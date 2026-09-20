// smoke_benchmarks.js — 标杆游戏经启动器的批量闭环冒烟（每款：play.html 打开→说明→开始→canvas 活→零异常→重开→返回）
// 用法: node tools/audit/smoke_benchmarks.js 98 132 133 137 [...]
'use strict';
const os = require('os'), path = require('path'), fs = require('fs'), { spawn } = require('child_process');
const GIDS = process.argv.slice(2).map(Number).filter(Boolean);
if (!GIDS.length) { console.error('usage: node smoke_benchmarks.js <gid...>'); process.exit(2); }
const BASE = 'http://127.0.0.1:8931';
const PORT = 9300 + Math.floor(Math.random() * 500);
const CH = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const UDD = path.join(os.tmpdir(), 'cdp_bench_' + PORT);
try { fs.rmSync(UDD, { recursive: true, force: true }); } catch (e) { }
const proc = spawn(CH, ['--headless', '--disable-gpu', '--mute-audio', '--window-position=-32000,-32000',
  '--user-data-dir=' + UDD, '--remote-debugging-port=' + PORT, '--no-first-run', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const P = [], F = [];
const ok = (c, n, d) => { (c ? P : F).push(n); if (!c) console.log('  FAIL:', n, '|', d === undefined ? '' : d); };

(async () => {
  let t = null;
  for (let i = 0; i < 40; i++) { try { const r = await fetch('http://127.0.0.1:' + PORT + '/json/list'); t = await r.json(); if (t.length) break; } catch (e) { await sleep(250); } }
  if (!t) { console.error('FATAL: CDP not reachable'); proc.kill(); process.exit(2); }
  const page = t.find(x => x.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pend = new Map(); let errors = [];
  ws.onmessage = ev2 => {
    const m = JSON.parse(ev2.data);
    if (m.method === 'Runtime.exceptionThrown') errors.push('EXC');
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push('CERR');
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
  };
  const send = (method, params) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r && r.result && r.result.exceptionDetails) return 'EVALERR'; return r && r.result && r.result.result && r.result.result.value; };
  await send('Runtime.enable'); await send('Page.enable');

  const waitReady = async (dir) => {   // hashchange→reload 场景下 Page.navigate 立即返回且旧 iframe 仍就绪——必须锚定目标款目录轮询
    const expr = '(function(){try{var d=document.getElementById("gv").contentDocument;return !!(d&&d.readyState==="complete"&&d.body&&d.body.children.length>0&&d.location.href.indexOf("/' + dir + '/")>=0);}catch(e){return false;}})()';
    for (let i = 0; i < 32; i++) {
      const r = await ev(expr);
      if (r === true) { await sleep(700); return true; }
      await sleep(300);
    }
    return false;
  };
  for (const vp of [{ name: 'm390', w: 390, h: 844, mobile: true }, { name: 'd1440', w: 1440, h: 900, mobile: false }]) {
    await send('Emulation.setDeviceMetricsOverride', { width: vp.w, height: vp.h, deviceScaleFactor: 1, mobile: vp.mobile });
    for (const g of GIDS) {
      const tag = vp.name + ' g' + g;
      const dir = 'game' + (g < 10 ? '0' + g : g);
      errors = [];
      await send('Page.navigate', { url: BASE + '/play.html#g=' + g });
      ok(await waitReady(dir) === true, tag + ' 就绪');
      ok(errors.length === 0, tag + ' 启动器零异常', errors.join(','));
      const nm = await ev('document.getElementById("gname").textContent');
      ok(!!nm && nm.length > 0, tag + ' 名称载入', nm);
      // 说明面板（首次弹/二次不弹都接受，但必须有「开始」可进）
      await ev('document.getElementById("go").click();"x"'); await sleep(2400);
      ok(await ev('document.getElementById("brief").classList.contains("hide")') === true, tag + ' 进入游戏');
      ok(await ev('(function(){try{var d=document.getElementById("gv").contentDocument;var cv=d.querySelector("canvas");var n=0;if(cv){try{var x=cv.getContext("2d");var dd=x.getImageData(0,0,cv.width,cv.height).data;for(var i=0;i<dd.length;i+=4*97){if(dd[i]|dd[i+1]|dd[i+2])n++;}}catch(e){}}if(n>20)return true;var b=0;[].slice.call(d.querySelectorAll("button,[onclick],.btn,#mGo,#mGo *")).forEach(function(e){var s=d.defaultView.getComputedStyle(e);if(s.display!=="none"&&s.visibility!=="hidden"&&e.offsetWidth>20&&e.offsetHeight>12&&e.textContent.trim())b++;});return b>=2;}catch(e){return false;}})()') === true, tag + ' 首屏可交互');
      ok(await ev('document.getElementById("errbar").classList.contains("show")') === false, tag + ' 无错误条');
      // 游戏内零异常（含 iframe 域）
      ok(errors.length === 0, tag + ' 全程零控制台错误', errors.join(','));
      // 重开 + 返回
      await ev('document.getElementById("breload").click();"x"'); await sleep(2200);
      ok(await ev('(function(){try{return !!document.getElementById("gv").contentDocument.querySelector("canvas");}catch(e){return false;}})()') === true, tag + ' 重开恢复');
      const back = await ev('document.querySelector(".bar .back").getAttribute("href")');
      ok(back === './index.html', tag + ' 返回库链接', back);
    }
  }
  console.log('BENCH-SMOKE ' + P.length + '/' + (P.length + F.length) + (F.length ? ' FAILS: ' + F.join(' | ') : ''));
  proc.kill();
  process.exit(F.length ? 1 : 0);
})().catch(e => { console.error('FATAL', e); try { proc.kill(); } catch (_) { } process.exit(2); });
