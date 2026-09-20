# -*- coding: utf-8 -*-
"""scan_static.py — 静态清单扫描：hub 卡片元数据 + 每款游戏文件静态特征 → reports/games-manifest.json
可重复运行（幂等）：每次从当前 index.html 与 gameNN/index.html 重扫。
"""
import io, json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))  # pwa 根
OUT = os.path.join(ROOT, 'reports', 'games-manifest.json')

def read(p):
    with io.open(p, 'r', encoding='utf-8', errors='replace') as f:
        return f.read()

def main():
    hub = read(os.path.join(ROOT, 'index.html'))
    # subcat 段切分：按 <div class="subcat ... data-sub="X/Y"> 分段
    segs = []  # (cat, sub, html)
    for m in re.finditer(r'<div class="subcat[^"]*"[^>]*data-sub="([^/"]+)/([^"]+)"[^>]*>', hub):
        segs.append([m.group(1), m.group(2), m.start()])
    games = []
    card_re = re.compile(r'<a class="card"([^>]*)>(.*?)</a>', re.S)
    tag_re = re.compile(r'<(?:div|span)[^>]*class="gtag[^"]*"[^>]*>([^<]*)<')
    play_re = re.compile(r'<div class="gplay">([^<]*)<')
    for i, seg in enumerate(segs):
        cat, sub, start = seg
        end = segs[i + 1][2] if i + 1 < len(segs) else len(hub)
        body = hub[start:end]
        for cm in card_re.finditer(body):
            attrs, inner = cm.group(1), cm.group(2)
            name = (re.search(r'data-name="([^"]*)"', attrs) or [None, ''])[1]
            href = (re.search(r'href="([^"]*)"', attrs) or [None, ''])[1]
            dm = re.search(r'\./game(\d+)/', href)
            if not dm:
                continue
            gid = int(dm.group(1))
            gtag = tag_re.search(inner)
            gplay = play_re.search(inner)
            games.append({
                'id': gid, 'dir': 'game%02d' % gid if gid < 10 else 'game%d' % gid,
                'name': name, 'href': href, 'cat': cat, 'sub': sub,
                'tag': gtag.group(1).strip() if gtag else '',
                'desc': gplay.group(1).strip() if gplay else '',
            })
    games.sort(key=lambda g: g['id'])
    assert len(games) == 150, 'expect 150 cards, got %d' % len(games)

    # 静态特征
    for g in games:
        p = os.path.join(ROOT, g['dir'], 'index.html')
        if not os.path.exists(p):
            g.update(sizeKB=0, title='', backMech='', saveKey='', kb=False, touch=False,
                     hasAudio=False, hintHits=0, viewport=False)
            continue
        s = read(p)
        title = (re.search(r'<title>([^<]*)</title>', s) or [None, ''])[1].strip()
        back = ''
        for pat, lab in [(r'pHome', 'canvas:pHome'), (r'returnHome|goHome|backHome', 'canvas:home'),
                         (r'\.\./index\.html|\./\.\./', 'dom:hublink'), (r'回目录|返回目录|返回游戏库', 'text:回目录')]:
            if re.search(pat, s):
                back = lab
                break
        keys = set(re.findall(r"localStorage\.[GS]etItem\(\s*'([^']+)'", s))
        keys |= set(re.findall(r"localStorage\.[GS]etItem\(\s*\"([^\"]+)\"", s))
        gk = [k for k in keys if re.match(r'^g\d|^\d+$|^game', k)]
        g.update(sizeKB=round(len(s.encode('utf-8')) / 1024.0, 1), title=title,
                 backMech=back, saveKey=(gk[0] if gk else (sorted(keys)[0] if keys else '')),
                 kb=bool(re.search(r'addEventListener\(\s*["\']keydown', s)),
                 touch=bool(re.search(r'touchstart|pointerdown', s)),
                 hasAudio='AudioContext' in s,
                 hintHits=len(re.findall(r'操作说明|玩法|教程|按键|方向键|提示|点击|拖动|长按|按住', s)),
                 viewport='name=viewport' in s)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with io.open(OUT, 'w', encoding='utf-8') as f:
        json.dump({'generatedAt': __import__('datetime').datetime.now().isoformat(timespec='seconds'),
                   'total': len(games), 'games': games}, f, ensure_ascii=False, indent=1)
    print('MANIFEST-DONE total=%d -> %s' % (len(games), OUT))
    # 概览
    noback = [g['id'] for g in games if not g['backMech']]
    nosave = len([g for g in games if not g['saveKey']])
    print('  noBackMech=%s' % (noback or 'none'))
    print('  noSaveKey=%d  kbOnly=%d  touch=%d  audio=%d' % (
        nosave, len([g for g in games if g['kb'] and not g['touch']]),
        len([g for g in games if g['touch']]), len([g for g in games if g['hasAudio']])))

if __name__ == '__main__':
    main()
