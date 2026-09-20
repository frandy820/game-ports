// smoke_platform.js — 平台主路径冒烟（hub 升级后：chips/收藏/筛选/继续/play.html 启动器/搜索/返回）
// 用法: node tools/audit/smoke_platform.js [--base http://127.0.0.1:8931]
// 制式: --headless + --mute-audio + 随机端口 9300+rand(500) + 独立 user-data-dir
'use strict';
const os = require('os'), path = require('path'), fs = require('fs'), { spawn } = require('child_process');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const BASE = arg('base', 'http://127.0.0.1:8931');
const PORT = 9300 + Math.floor(Math.random() * 500);
const CH = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const UDD = path.join(os.tmpdir(), 'cdp_plat_' + PORT);
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
    if (m.method === 'Runtime.exceptionThrown') errors.push('EXC:' + (((m.params.exceptionDetails.exception || {}).description || '').split('\n')[0] || '').slice(0, 140));
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push('CERR');
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
  };
  const send = (method, params) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r && r.result && r.result.exceptionDetails) return undefined; return r && r.result && r.result.result && r.result.result.value; };
  await send('Runtime.enable'); await send('Page.enable');

  const click = async (x, y) => {
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  };
  const nav = async (url) => { errors = []; const r = await send('Page.navigate', { url }); await sleep(1400); return !r.errorText; };

  for (const vp of [{ name: 'm390', w: 390, h: 844, mobile: true }, { name: 'd1440', w: 1440, h: 900, mobile: false }]) {
    await send('Emulation.setDeviceMetricsOverride', { width: vp.w, height: vp.h, deviceScaleFactor: 1, mobile: vp.mobile });
    const tag = vp.name + ' ';

    // —— hub ——
    ok(await nav(BASE + '/index.html'), tag + 'hub 打开');
    ok(errors.length === 0, tag + 'hub 零控制台错误', errors.join(';'));
    ok(await ev('document.querySelectorAll("a.card").length') === 150, tag + '150 卡');
    ok(await ev('document.querySelectorAll(".chip").length') === 3, tag + 'chips=3');
    ok(await ev('document.querySelectorAll(".favbtn").length') === 150, tag + '150 星标注入');
    await ev('document.querySelectorAll(".cat,.subcat").forEach(function(e){e.classList.add("open")}); void 0');
    ok(await ev('document.body.scrollWidth <= ' + (vp.w + 4)), tag + '无横向溢出', await ev('document.body.scrollWidth'));
    // 搜索仍可用
    await ev('var q=document.getElementById("q"); q.value="接龙"; q.dispatchEvent(new Event("input")); void 0');
    await sleep(400);
    ok(await ev('document.body.classList.contains("searching")') === true, tag + '搜索态生效');
    ok(await ev('document.getElementById("scount").textContent.indexOf("找到") >= 0'), tag + 'scount 有结果');
    await ev('document.getElementById("q").value = ""; document.getElementById("q").dispatchEvent(new Event("input")); void 0');
    await sleep(300);

    if (vp.name === 'm390') {
      // —— 收藏：星标点击（选 game133 卡）——
      ok(await ev('(function(){var c=document.querySelector(\'a.card[href="./play.html#g=133"] .favbtn\');c.scrollIntoView({block:"center"});var r=c.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()').then(async pt => { await sleep(200); await click(pt.x, pt.y); await sleep(300); return !!pt; }), 'm390 点星标');
      ok(await ev('document.querySelectorAll(".isfaved").length') === 1, 'm390 收藏态=1 卡');
      ok(await ev('document.getElementById("nfav").textContent') === '1', 'm390 收藏计数=1');
      // —— 筛选：收藏 ——
      await ev('document.querySelector(\'.chip[data-f="fav"]\').click(); void 0'); await sleep(250);
      const hid = await ev('(function(){var miss=[].filter.call(document.querySelectorAll("a.card.fmiss"),function(c){return c.classList.contains("fmiss")}).length; return miss;})()');
      ok(hid === 149, 'm390 收藏筛隐藏 149 卡', hid);
      ok(await ev('document.querySelector(\'a.card[href="./play.html#g=133"]\').classList.contains("fmiss")') === false, 'm390 被收藏卡未被隐藏');
      await ev('document.querySelector(\'.chip[data-f="all"]\').click(); void 0'); await sleep(200);
      // —— 空收藏提示（先清空再切筛选）——
      await ev('localStorage.setItem("hubFavs","[]"); location.reload(); void 0'); await sleep(1600);
      await ev('document.querySelector(\'.chip[data-f="fav"]\').click(); void 0'); await sleep(250);
      ok(await ev('document.getElementById("fnote").classList.contains("show")') === true, 'm390 空收藏提示显示');
      await ev('document.querySelector(\'.chip[data-f="all"]\').click(); void 0'); await sleep(200);

      // —— 启动器：game98 ——
      ok(await nav(BASE + '/play.html#g=98'), 'play98 打开');
      ok(errors.length === 0, 'play98 零控制台错误', errors.join(';'));
      ok(await ev('document.getElementById("gname").textContent') === '电梯调度', 'play98 名称', await ev('document.getElementById("gname").textContent'));
      ok(await ev('document.getElementById("bgoal").textContent.length > 0', ), 'play98 目标有值');
      ok(await ev('document.getElementById("brief").classList.contains("hide")') === false, 'play98 首次弹说明');
      await ev('document.getElementById("go").click(); void 0'); await sleep(3200);
      ok(await ev('document.getElementById("brief").classList.contains("hide")') === true, 'play98 开始后隐藏说明');
      // iframe 内游戏已跑（shell 注入后仍正常）
      ok(await ev('(function(){try{var d=document.getElementById("gv").contentDocument;return !!d && !!d.querySelector("canvas");}catch(e){return "err:"+e.message;}})()') === true, 'play98 iframe canvas 在位');
      ok(await ev('document.getElementById("errbar").classList.contains("show")') === false, 'play98 无错误条');
      // 重开按钮
      await ev('document.getElementById("breload").click(); void 0'); await sleep(2500);
      ok(await ev('(function(){try{var d=document.getElementById("gv").contentDocument;return !!d.querySelector("canvas");}catch(e){return false;}})()') === true, 'play98 重开后 canvas 在位');
      // 刷新后说明不再弹
      ok(await nav(BASE + '/play.html#g=98'), 'play98 二次打开');
      await sleep(1800);
      ok(await ev('document.getElementById("brief").classList.contains("hide")') === true, 'play98 二次进入不弹说明');
      // —— hub 继续游玩条 ——
      ok(await nav(BASE + '/index.html'), 'hub 回访');
      await sleep(1200);
      await ev('document.querySelectorAll(".cat,.subcat").forEach(function(e){e.classList.add("open")}); void 0');
      ok(await ev('document.getElementById("cont").classList.contains("show")') === true, '继续游玩条显示');
      ok(await ev('document.getElementById("contgo").getAttribute("href")') === './play.html#g=98', '继续游玩指向 g98', await ev('document.getElementById("contgo").getAttribute("href")'));
      // —— 卡片点击走 play.html ——
      const pt2 = await ev('(function(){var c=document.querySelector(\'a.card[href="./play.html#g=133"]\');c.scrollIntoView({block:"center"});var r=c.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()');
      await sleep(200);
      await click(pt2.x, pt2.y); await sleep(1800);
      ok(await ev('location.hash') === '#g=133', '点卡片进入 play133', await ev('location.hash'));
    }
  }

  console.log('PLATFORM-SMOKE ' + P.length + '/' + (P.length + F.length) + (F.length ? ' FAILS: ' + F.join(', ') : ''));
  proc.kill();
  process.exit(F.length ? 1 : 0);
})().catch(e => { console.error('FATAL', e); try { proc.kill(); } catch (_) { } process.exit(2); });
