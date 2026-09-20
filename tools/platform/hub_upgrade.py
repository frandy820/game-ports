# -*- coding: utf-8 -*-
"""hub_upgrade.py — hub 平台成熟化升级（幂等，标记防重入）。
改动：①tagline 数量勘误 ②筛选 chips+继续游玩条 ③收藏星标+筛选/最近 JS ④卡片 href → play.html 启动器
     ⑤sw 增补 play.html/briefs.json/shell.js 并升版本。基于当前 index.html 外科手术，不重排卡片。
用法: python tools/platform/hub_upgrade.py
"""
import io, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
IDX = os.path.join(ROOT, 'index.html')
SW = os.path.join(ROOT, 'sw.js')
MARK = '<!-- pg-platform-v1 -->'

CSS = MARK + '''
<style>
.chips{display:flex;gap:8px;margin:2px 0 14px;flex-wrap:wrap}
.chip{padding:7px 15px;border-radius:999px;border:1px solid rgba(140,160,220,.22);background:rgba(24,35,66,.5);
  color:#c9d4ee;font-size:13px;cursor:pointer;transition:border-color .15s ease,color .15s ease}
.chip:hover{border-color:rgba(140,160,220,.45);color:#e8ecf8}
.chip.on{background:linear-gradient(100deg,#ffb347,#ffd9a0);color:#0d1322;border-color:transparent;font-weight:700}
.chip:disabled{opacity:.4;cursor:default}
.chip .n{font-size:11px;opacity:.75;margin-left:3px}
.fnote{display:none;margin:-6px 0 12px;color:#8d99b8;font-size:12.5px;line-height:1.6;
  padding:10px 14px;border:1px dashed rgba(140,160,220,.25);border-radius:12px}
.fnote.show{display:block}
.cont{display:none;margin:0 0 16px;padding:12px 14px;border-radius:14px;
  background:linear-gradient(135deg,rgba(255,179,71,.12),rgba(126,200,255,.07));
  border:1px solid rgba(255,179,71,.3);align-items:center;gap:10px;flex-wrap:wrap}
.cont.show{display:flex}
.cont .lab{color:#e8d9c2;font-size:12.5px;letter-spacing:.08em;flex:none}
.cont a{color:#ffd9a0;font-size:14.5px;font-weight:700;text-decoration:none;padding:4px 8px;border-radius:8px}
.cont a:hover{background:rgba(255,179,71,.12)}
.cont .more{color:#8d99b8;font-size:12px}
.card .favbtn{position:absolute;top:9px;right:9px;z-index:3;width:30px;height:30px;border-radius:9px;
  display:flex;align-items:center;justify-content:center;cursor:pointer;
  background:rgba(13,19,34,.55);border:1px solid rgba(140,160,220,.25)}
.card .favbtn:hover{border-color:rgba(255,179,71,.6)}
.card .favbtn svg{width:16px;height:16px;fill:none;stroke:#8d99b8;stroke-width:1.7;stroke-linejoin:round}
.card.isfaved .favbtn svg{fill:#ffb347;stroke:#ffb347}
.card.isfaved{border-color:rgba(255,179,71,.4)}
.fmiss{display:none!important}
@media(prefers-reduced-motion:reduce){.chip,.card{transition:none!important}}
</style>
'''

HTML_INJECT = MARK + '''
  <div class="chips" id="chips">
    <button class="chip on" data-f="all">全部</button>
    <button class="chip" data-f="fav">收藏<span class="n" id="nfav"></span></button>
    <button class="chip" data-f="recent">最近<span class="n" id="nrec"></span></button>
  </div>
  <div class="cont" id="cont"><span class="lab">上次玩到</span><a id="contgo" href="#"></a><span class="more" id="contmore"></span></div>
  <div class="fnote" id="fnote"></div>
'''

JS = MARK + '''
<script>
/* pg-platform-v1：收藏 / 最近游玩 / 筛选 / 继续游玩（与 play.html 共享 localStorage 键） */
(function () {
  'use strict';
  var LSG = function (k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
  var LSS = function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  var cards = [].slice.call(document.querySelectorAll('a.card'));
  var gidOf = function (el) { var m = (el.getAttribute('href') || '').match(/#g=(\\d+)/); return m ? +m[1] : 0; };
  var favs = LSG('hubFavs') || [];
  var recents = LSG('hubRecent') || [];
  var STAR = '<svg viewBox="0 0 24 24"><path d="M12 3.6l2.5 5.1 5.6.8-4 4 .9 5.6-5-2.6-5 2.6.9-5.6-4-4 5.6-.8z"/></svg>';

  var idx = {};   // gid -> {el, name}
  cards.forEach(function (c) {
    var g = gidOf(c);
    if (!g) return;
    idx[g] = { el: c, name: c.getAttribute('data-name') || ('#' + g) };
    var b = document.createElement('span');
    b.className = 'favbtn'; b.setAttribute('role', 'button'); b.setAttribute('tabindex', '0');
    b.setAttribute('aria-label', '收藏'); b.innerHTML = STAR;
    var tog = function (e) {
      e.preventDefault(); e.stopPropagation();
      var i = favs.indexOf(g);
      if (i >= 0) favs.splice(i, 1); else favs.push(g);
      LSS('hubFavs', favs); paint();
    };
    b.addEventListener('click', tog);
    b.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') tog(e); });
    c.appendChild(b);
  });

  var cur = 'all';
  var chips = [].slice.call(document.querySelectorAll('.chip'));
  var fnote = document.getElementById('fnote');
  function paint() {
    cards.forEach(function (c) {
      var g = gidOf(c);
      c.classList.toggle('isfaved', favs.indexOf(g) >= 0);
      if (cur === 'fav') c.classList.toggle('fmiss', favs.indexOf(g) < 0);
      else if (cur === 'recent') c.classList.toggle('fmiss', recents.indexOf(g) < 0);
      else c.classList.remove('fmiss');
    });
    chips.forEach(function (ch) { ch.classList.toggle('on', ch.getAttribute('data-f') === cur); });
    document.getElementById('nfav').textContent = favs.length ? favs.length : '';
    document.getElementById('nrec').textContent = recents.length ? recents.length : '';
    var note = '';
    if (cur === 'fav' && !favs.length) note = '还没有收藏——点卡片右上角的星标即可收藏，收藏后在此快速找到。';
    else if (cur === 'recent' && !recents.length) note = '还没有游玩记录——从任意游戏开始，之后这里能快速回到它。';
    fnote.textContent = note; fnote.classList.toggle('show', !!note);
  }
  chips.forEach(function (ch) {
    ch.addEventListener('click', function () { cur = ch.getAttribute('data-f'); paint(); });
  });

  // 记录最近游玩（点击卡片即记；play.html 载入时也会记）
  cards.forEach(function (c) {
    c.addEventListener('click', function () {
      var g = gidOf(c); if (!g) return;
      recents = [g].concat(recents.filter(function (x) { return x !== g; })).slice(0, 12);
      LSS('hubRecent', recents);
    });
  });

  // 继续游玩条
  var cont = document.getElementById('cont');
  if (recents.length) {
    var last = idx[recents[0]];
    if (last) {
      cont.classList.add('show');
      var a = document.getElementById('contgo');
      a.textContent = last.name; a.setAttribute('href', './play.html#g=' + recents[0]);
      document.getElementById('contmore').textContent = recents.length > 1 ? '· 最近共 ' + recents.length + ' 款' : '';
    }
  }
  paint();
})();
</script>
'''

def main():
    with io.open(IDX, encoding='utf-8') as f:
        s = f.read()
    if MARK in s:
        print('hub_upgrade: already applied, skip (如需重跑先 git checkout index.html)')
        return
    n0 = s

    # 1) tagline 数量勘误
    s2 = s.replace('一百三十五款离线小游戏', '一百五十款离线小游戏', 1)
    assert s2 != s, 'tagline anchor missing'
    s = s2

    # 2) CSS（插在 </head> 前，独立 style 块）
    assert '</head>' in s
    s = s.replace('</head>', CSS + '\n</head>', 1)

    # 3) chips/继续条（插在 nav.cats 前）
    assert '<nav class="cats"' in s
    s = s.replace('<nav class="cats"', HTML_INJECT + '\n  <nav class="cats"', 1)

    # 4) 卡片 href → play.html 启动器
    pat = re.compile(r'href="\./game(\d+)/index\.html\?v=[^"]*"')
    s, n = pat.subn(lambda m: 'href="./play.html#g=%d"' % int(m.group(1)), s)
    assert n == 150, 'expect 150 card hrefs, got %d' % n

    # 5) 平台 JS（</body> 前）
    assert s.rstrip().endswith('</html>')
    s = s.replace('</body>', JS + '\n</body>', 1)

    with io.open(IDX, 'w', encoding='utf-8', newline='') as f:
        f.write(s)
    print('HUB-UPGRADED cards=%d bytes %d -> %d' % (n, len(n0.encode('utf-8')), len(s.encode('utf-8'))))

    # 6) sw：版本 + 预缓存
    with io.open(SW, encoding='utf-8') as f:
        w = f.read()
    w = w.replace("const VERSION = 'v1.0.155';", "const VERSION = 'v1.1.0';", 1)
    add = "  './play.html',\n  './briefs.json',\n  './shell.js',\n"
    w = w.replace("  './index.html',\n", "  './index.html',\n" + add, 1)
    assert "v1.1.0" in w and "./play.html'" in w
    with io.open(SW, 'w', encoding='utf-8', newline='') as f:
        f.write(w)
    print('SW-UPGRADED v1.1.0 (+play.html/briefs.json/shell.js)')

if __name__ == '__main__':
    main()
