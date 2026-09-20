// smoke_offline.js — 离线链路验证：sw 安装后断网，hub/play.html/briefs/游戏 iframe 全部可用
'use strict';
const os = require('os'), path = require('path'), fs = require('fs'), { spawn } = require('child_process');
const BASE = 'http://127.0.0.1:8931';
const PORT = 9300 + Math.floor(Math.random() * 500);
const CH = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const UDD = path.join(os.tmpdir(), 'cdp_off_' + PORT);
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
  const ev = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); return r && r.result && r.result.result && r.result.result.value; };
  await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable');

  // 1) 在线访问关键页，让 sw 安装+预热
  await send('Page.navigate', { url: BASE + '/index.html' }); await sleep(3000);
  const swState = await ev('(async function(){for(var i=0;i<20;i++){if(navigator.serviceWorker.controller)return "active";await new Promise(r=>setTimeout(r,300));}return "none";})()');
  ok(swState === 'active', 'sw 控制页激活', swState);
  await send('Page.navigate', { url: BASE + '/play.html#g=133' }); await sleep(2500);
  await ev('document.getElementById("go").click();"x"'); await sleep(2500);   // 进游戏触发 iframe 资源
  await send('Page.navigate', { url: BASE + '/play.html#g=98' }); await sleep(2000);

  // 2) 断网
  await send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
  await send('Page.navigate', { url: BASE + '/index.html' }); await sleep(2600);
  ok(await ev('document.querySelectorAll("a.card").length') === 150, '离线 hub 150 卡');
  ok(await ev('document.querySelectorAll(".favbtn").length') === 150, '离线星标注入');
  await send('Page.navigate', { url: BASE + '/play.html#g=133' }); await sleep(2800);
  ok(await ev('document.getElementById("gname").textContent.length > 0') === true, '离线 play133 名称', await ev('document.getElementById("gname").textContent'));
  ok(await ev('document.getElementById("bgoal").textContent.length > 0') === true, '离线 briefs 数据(fetch)');
  await ev('document.getElementById("go").click();"x"'); await sleep(2600);
  ok(await ev('(function(){try{return !!document.getElementById("gv").contentDocument.querySelector("canvas");}catch(e){return false;}})()') === true, '离线游戏 iframe canvas');
  ok(await ev('document.getElementById("errbar").classList.contains("show")') === false, '离线无错误条');
  // 3) 恢复网络（收尾卫生）
  await send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });

  console.log('OFFLINE-SMOKE ' + P.length + '/' + (P.length + F.length) + (F.length ? ' FAILS: ' + F.join(', ') : ''));
  proc.kill();
  process.exit(F.length ? 1 : 0);
})().catch(e => { console.error('FATAL', e); try { proc.kill(); } catch (_) { } process.exit(2); });
