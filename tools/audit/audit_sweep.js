// audit_sweep.js — 全库游戏质量审计（CDP 无头扫描，可重复运行）
// 用法: node tools/audit/audit_sweep.js [--base http://127.0.0.1:8931] [--wait 2600] [--out reports/audit-run.json] [--games 1-150,hub]
// 输出: 每款游戏 × 每视口（390 移动 / 1440 桌面）的启动/内容/控制台/溢出/标题探针结果。
// 制式: --headless（禁 =new）+ --mute-audio + 随机端口 9300+rand(500) + 独立 user-data-dir。
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), { spawn } = require('child_process');

// ---------- 参数 ----------
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const BASE = arg('base', 'http://127.0.0.1:8931');
const WAIT = parseInt(arg('wait', '2600'), 10);
const OUT = path.resolve(arg('out', 'reports/audit-run.json'));
let GAMES = arg('games', '1-150,hub');
// 解析 games 范围
const ids = [];
for (const part of GAMES.split(',')) {
  const m = part.match(/^(\d+)-(\d+)$/);
  if (m) { for (let i = +m[1]; i <= +m[2]; i++) ids.push(i); }
  else if (part === 'hub') ids.push('hub');
  else if (/^\d+$/.test(part)) ids.push(+part);
}
const dirOf = n => n === 'hub' ? '' : 'game' + (n < 10 ? '0' + n : n) + '/';

// ---------- Chrome ----------
const PORT = 9300 + Math.floor(Math.random() * 500);
const CH = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const UDD = path.join(os.tmpdir(), 'cdp_audit_' + PORT);
try { fs.rmSync(UDD, { recursive: true, force: true }); } catch (e) { }
const proc = spawn(CH, ['--headless', '--disable-gpu', '--mute-audio', '--window-position=-32000,-32000',
  '--user-data-dir=' + UDD, '--remote-debugging-port=' + PORT, '--no-first-run', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  let t = null;
  for (let i = 0; i < 40; i++) {
    try { const r = await fetch('http://127.0.0.1:' + PORT + '/json/list'); t = await r.json(); if (t.length) break; } catch (e) { await sleep(250); }
  }
  if (!t) { console.error('FATAL: CDP not reachable'); proc.kill(); process.exit(2); }
  const page = t.find(x => x.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pend = new Map();
  let errors = [];           // 每次导航前清空
  let navFailed = false;
  ws.onmessage = ev2 => {
    const m = JSON.parse(ev2.data);
    if (m.method === 'Runtime.exceptionThrown') errors.push('EXC:' + (((m.params.exceptionDetails.exception || {}).description || m.params.exceptionDetails.text || '').split('\n')[0].slice(0, 160)));
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
      const a = (m.params.args || []).map(x => x.value || x.description || '').join(' ').slice(0, 160);
      errors.push('CERR:' + a);
    }
    if (m.method === 'Page.loadEventFired') { }
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
  };
  const send = (method, params) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (!r || !r.result || r.result.exceptionDetails) return undefined;
    return r.result.result && r.result.result.value;
  };
  await send('Runtime.enable'); await send('Page.enable'); await send('Log.enable');

  const VIEWPORTS = [
    { name: 'm390', w: 390, h: 844, mobile: true },
    { name: 'd1440', w: 1440, h: 900, mobile: false },
  ];

  // 页面探针（在页面上下文执行；返回结构化结果）
  const PROBE = `(function(){
    var r = {};
    r.title = document.title || '';
    r.url = location.pathname;
    r.bodyText = (document.body ? document.body.innerText : '').replace(/\\s+/g, ' ').trim().length;
    r.appChildren = document.body ? document.body.children.length : 0;
    r.cvs = Array.prototype.map.call(document.querySelectorAll('canvas'), function(c){ return c.width + 'x' + c.height; });
    r.hasViewportMeta = !!document.querySelector('meta[name=viewport]');
    r.docW = Math.max(document.documentElement.scrollWidth, document.body ? document.body.scrollWidth : 0);
    // canvas 内容多样性（非白板）：采样量化色
    r.canvasDiversity = -1;
    try {
      var cv = document.querySelector('canvas');
      if (cv) {
        var x = cv.getContext && cv.getContext('2d');
        if (x) {
          var d = x.getImageData(0, 0, cv.width, cv.height).data;
          var seen = {}, n = 0, N = 0;
          for (var i = 0; i < d.length; i += 4 * 97) {
            var k = (d[i] >> 4) + ',' + (d[i+1] >> 4) + ',' + (d[i+2] >> 4);
            if (!seen[k]) { seen[k] = 1; n++; }
            N++;
          }
          r.canvasDiversity = n;
        }
      }
    } catch (e) { r.canvasDiversity = -2; }
    // DOM 级返回入口（canvas 内绘制的返回按钮由静态扫描补充）
    r.domBack = !!document.querySelector('a[href*="index.html"], a[href="../"], a[href="/"]');
    return r;
  })()`;

  const results = [];
  const t0 = Date.now();
  for (const gid of ids) {
    const entry = { id: gid, url: (gid === 'hub' ? BASE + '/index.html' : BASE + '/' + dirOf(gid) + 'index.html'), views: {} };
    for (const vp of VIEWPORTS) {
      errors = [];
      await send('Emulation.setDeviceMetricsOverride', { width: vp.w, height: vp.h, deviceScaleFactor: 1, mobile: vp.mobile });
      const nav = await send('Page.navigate', { url: entry.url });
      const navErr = nav && nav.errorText;
      await sleep(WAIT);
      const p = await ev(PROBE);
      entry.views[vp.name] = {
        navOk: !navErr,
        navErr: navErr || null,
        title: p ? p.title : null,
        bodyText: p ? p.bodyText : -1,
        appChildren: p ? p.appChildren : -1,
        canvas: p ? p.cvs : null,
        canvasDiversity: p ? p.canvasDiversity : null,
        docW: p ? p.docW : null,
        overflowPx: p ? (p.docW - vp.w) : null,
        hasViewportMeta: p ? p.hasViewportMeta : null,
        domBack: p ? p.domBack : null,
        errors: errors.slice(0, 6),
        errorCount: errors.length,
      };
    }
    // 汇总两视口
    const a = entry.views.m390, b = entry.views.d1440;
    entry.ok = a && b && a.navOk && b.navOk && a.bodyText >= 0 && (a.canvasDiversity === null || a.canvasDiversity > 4 || a.bodyText > 20);
    results.push(entry);
    const bad = (!entry.ok ? ' ⚠' : '') + (a.errorCount + b.errorCount > 0 ? ' E' + (a.errorCount + b.errorCount) : '');
    console.log('[' + results.length + '/' + ids.length + '] game' + gid + bad + ' title=' + (a.title || '').slice(0, 18) + ' div=' + a.canvasDiversity + ' txt=' + a.bodyText + ' ovf=' + a.overflowPx);
  }
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify({ base: BASE, wait: WAIT, startedAt: new Date(t0).toISOString(), finishedAt: new Date().toISOString(), total: results.length, results }, null, 1));
  console.log('AUDIT-DONE total=' + results.length + ' -> ' + OUT);
  proc.kill();
  process.exit(0);
})().catch(e => { console.error('FATAL', e); try { proc.kill(); } catch (_) { } process.exit(2); });
