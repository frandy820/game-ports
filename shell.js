/* shell.js — 口袋游戏机共享游戏壳层（错误兜底）
 * 由 tools/platform/inject_shell.py 注入各 gameNN/index.html（<script src="../shell.js" defer>）。
 * 常规运行零视觉零行为侵入；仅在捕获到运行时错误时显示恢复浮层（重试 / 返回游戏库）。
 * 在 play.html 启动器 iframe 内时，同时 postMessage 通知父页。
 */
(function () {
  'use strict';
  if (window.__pgShell) return;
  window.__pgShell = 1;
  var shown = false;

  function btn(label, fn, primary) {
    var b = document.createElement('button');
    b.textContent = label;
    b.setAttribute('style', 'margin:0 6px;padding:10px 18px;border-radius:12px;border:1px solid ' +
      (primary ? '#ffb347' : 'rgba(140,160,220,.4)') + ';background:' +
      (primary ? '#ffb347' : 'transparent') + ';color:' +
      (primary ? '#0d1322' : '#c9d4ee') + ';font-size:15px;font-weight:600;cursor:pointer;');
    b.onclick = fn;
    return b;
  }

  function overlay(kind, msg) {
    if (shown) return;
    shown = true;
    try {
      if (window.parent !== window) {
        window.parent.postMessage({ type: 'pg-shell-error', kind: kind, msg: String(msg || '').slice(0, 300) }, '*');
      }
    } catch (e) { /* 跨域等异常忽略 */ }
    var d = document.createElement('div');
    d.setAttribute('style', 'position:fixed;inset:0;z-index:2147483647;background:rgba(13,19,34,.94);' +
      'display:flex;align-items:center;justify-content:center;padding:24px;font-family:sans-serif;');
    var box = document.createElement('div');
    box.setAttribute('style', 'max-width:400px;text-align:center;background:#141d33;color:#e8ecf8;' +
      'border:1px solid rgba(140,160,220,.35);border-radius:16px;padding:24px 20px;');
    var h = document.createElement('div');
    h.textContent = '游戏出了点问题';
    h.setAttribute('style', 'font-size:17px;font-weight:700;margin-bottom:10px;');
    var p = document.createElement('div');
    p.textContent = String(msg || '未知错误').slice(0, 220);
    p.setAttribute('style', 'font-size:12.5px;color:#8d99b8;line-height:1.6;margin-bottom:18px;' +
      'word-break:break-all;max-height:120px;overflow:auto;');
    var row = document.createElement('div');
    row.appendChild(btn('重试', function () { location.reload(); }, true));
    row.appendChild(btn('返回游戏库', function () { location.href = '../index.html'; }, false));
    box.appendChild(h); box.appendChild(p); box.appendChild(row);
    d.appendChild(box);
    document.body.appendChild(d);
  }

  window.addEventListener('error', function (e) {
    var m = (e && (e.message || (e.error && e.error.message))) || '未知错误';
    // 资源加载失败（非脚本异常）不弹层：游戏本体自包含，此类多为扩展注入噪声
    if (e && e.target && e.target !== window && e.target.nodeName) return;
    overlay('error', m);
  }, true);
  window.addEventListener('unhandledrejection', function (e) {
    var r = e && e.reason;
    overlay('unhandledrejection', (r && (r.message || r)) || 'Promise 未处理拒绝');
  });
})();
