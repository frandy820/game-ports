// smoke_shell.js — 共享壳层错误兜底验证（直连页 overlay + play.html iframe→父页错误条）
'use strict';
const os = require('os'), path = require('path'), fs = require('fs'), { spawn } = require('child_process');
const BASE = 'http://127.0.0.1:8931';
const PORT = 9300 + Math.floor(Math.random() * 500);
const CH = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const UDD = path.join(os.tmpdir(), 'cdp_shell_' + PORT);
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
  let id = 0; const pend = new Map();
  ws.onmessage = ev2 => { const m = JSON.parse(ev2.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
  const send = (method, params) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r && r.result && r.result.exceptionDetails) return 'EVALERR'; return r && r.result && r.result.result && r.result.result.value; };
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });

  // —— 场景 1：直连游戏页，人为抛未捕获异常 → shell overlay ——
  let r = await send('Page.navigate', { url: BASE + '/game98/index.html' }); await sleep(2600);
  await ev('setTimeout(function(){ null.x }, 0); "thrown"'); await sleep(600);
  ok(await ev('!!document.querySelector("body > div") && document.body.lastElementChild.textContent.indexOf("游戏出了点问题") >= 0') === true, '直连页异常→overlay 出现');
  ok(await ev('document.body.lastElementChild.textContent.indexOf("返回游戏库") >= 0') === true, 'overlay 有返回按钮');
  ok(await ev('document.body.lastElementChild.textContent.indexOf("重试") >= 0') === true, 'overlay 有重试按钮');
  // 无异常路径不弹层：刷新后静置
  r = await send('Page.navigate', { url: BASE + '/game98/index.html' }); await sleep(2600);
  ok(await ev('document.body.lastElementChild.textContent.indexOf("游戏出了点问题")') < 0, '正常路径零 overlay');

  // —— 场景 2：play.html iframe 内异常 → 父页错误条 ——
  r = await send('Page.navigate', { url: BASE + '/play.html#g=98' }); await sleep(3200);
  await ev('document.getElementById("go").click(); "ok"'); await sleep(800);
  await ev('(function(){var w=document.getElementById("gv").contentWindow; w.eval("setTimeout(function(){ null.y }, 0)"); return "inj";})()'); await sleep(700);
  ok(await ev('document.getElementById("errbar").classList.contains("show")') === true, 'iframe 异常→父页错误条');
  ok(await ev('document.getElementById("errmsg").textContent.length > 4') === true, '错误条有信息');
  // 重开恢复
  await ev('document.getElementById("errgo").click(); "r"'); await sleep(2600);
  ok(await ev('document.getElementById("errbar").classList.contains("show")') === false, '重开后错误条消失');
  ok(await ev('(function(){try{return !!document.getElementById("gv").contentDocument.querySelector("canvas");}catch(e){return false;}})()') === true, '重开后游戏恢复');

  console.log('SHELL-SMOKE ' + P.length + '/' + (P.length + F.length) + (F.length ? ' FAILS: ' + F.join(', ') : ''));
  proc.kill();
  process.exit(F.length ? 1 : 0);
})().catch(e => { console.error('FATAL', e); try { proc.kill(); } catch (_) { } process.exit(2); });
