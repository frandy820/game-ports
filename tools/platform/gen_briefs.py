# -*- coding: utf-8 -*-
"""gen_briefs.py — 生成 briefs.json（play.html 启动前说明数据）。
数据源：reports/games-manifest.json（自动）+ 各款 gameNNN/brief.json（人工打磨款，覆盖自动值）。
未打磨款 how/lose/dur 缺省为空（前端显示「待补充」，诚实状态）。
用法: python tools/platform/gen_briefs.py
"""
import io, json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))          # pwa 根
SRC = os.path.join(ROOT, '..', 'game-ports')           # 源工作区（brief.json 交付处）

def main():
    with io.open(os.path.join(ROOT, 'reports', 'games-manifest.json'), encoding='utf-8') as f:
        man = json.load(f)
    out, curated = {}, 0
    for g in man['games']:
        e = {'name': g['name'], 'cat': g['cat'], 'sub': g['sub'], 'tag': g['tag'], 'desc': g['desc'],
             'ctrl': ('kb+touch' if g.get('kb') and g.get('touch') else ('kb' if g.get('kb') else ('touch' if g.get('touch') else ''))),
             'goal': '', 'how': '', 'lose': '', 'dur': ''}
        bp = os.path.join(SRC, g['dir'], 'brief.json')
        if os.path.exists(bp):
            with io.open(bp, encoding='utf-8') as f:
                b = json.load(f)
            for k in ('goal', 'how', 'lose', 'dur', 'ctrl', 'name'):
                if b.get(k):
                    e[k] = b[k]
            e['curated'] = True
            curated += 1
        else:
            # 非人工款：操作说明按输入形态兜底（诚实、有用的下限，不编造细节）
            e['how'] = {'kb': '键盘操作，具体按键见游戏内菜单/说明',
                        'touch': '点触操作，具体点法见游戏内菜单/说明',
                        'kb+touch': '键盘或点触均可，具体见游戏内菜单/说明',
                        '': '见游戏内菜单/说明'}[e['ctrl']]
        out[str(g['id'])] = e
    dst = os.path.join(ROOT, 'briefs.json')
    with io.open(dst, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
    print('BRIEFS-DONE total=%d curated=%d -> %s' % (len(out), curated, dst))

if __name__ == '__main__':
    main()
