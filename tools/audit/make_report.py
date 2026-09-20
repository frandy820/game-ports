# -*- coding: utf-8 -*-
"""make_report.py — 合并 CDP 审计结果 + 静态清单 → 评分报告（P0/P1/P2 分级 + 共性问题排行）。
用法: python tools/audit/make_report.py reports/audit-baseline.json --label BASELINE [--out reports/AUDIT-BASELINE.md]
评分（0-10）：启动2 内容2 控制台2 返回1 移动溢出1 标题1 引导提示1
"""
import io, json, os, sys, datetime

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))

def load(p):
    with io.open(p, encoding='utf-8') as f:
        return json.load(f)

def score_entry(man_g, r):
    a = r.get('views', {}).get('m390', {})
    b = r.get('views', {}).get('d1440', {})
    s, why = 0.0, {'P0': [], 'P1': [], 'P2': []}
    # 启动 2
    if a.get('navOk') and b.get('navOk'):
        s += 2
    else:
        why['P0'].append('无法打开(%s)' % (a.get('navErr') or b.get('navErr') or 'HTTP错误'))
    # 内容 2
    div = a.get('canvasDiversity'); txt = a.get('bodyText', -1)
    if (div is not None and div > 4) or (txt is not None and txt > 20):
        s += 2
    else:
        why['P0'].append('疑似白屏(div=%s,txt=%s)' % (div, txt))
    # 控制台 2
    exc = [e for e in (a.get('errors', []) + b.get('errors', [])) if e.startswith('EXC:')]
    cerr = [e for e in (a.get('errors', []) + b.get('errors', [])) if e.startswith('CERR:')]
    if not exc and not cerr:
        s += 2
    elif not exc and len(cerr) <= 2:
        s += 1; why['P1'].append('console.error×%d' % len(cerr))
    else:
        why['P0' if exc else 'P1'].append('运行时异常×%d/console.error×%d' % (len(exc), len(cerr)))
    # 移动溢出 1
    ovf = a.get('overflowPx')
    if ovf is not None and ovf <= 4:
        s += 1
    elif ovf is not None and ovf > 24:
        why['P1'].append('390px 横向溢出 %dpx' % ovf)
    else:
        why['P2'].append('390px 溢出 %spx(轻)' % ovf)
    # 标题 1
    if a.get('title'):
        s += 1
    else:
        why['P2'].append('无标题')
    # 返回 1（平台启动器后全量具备；直连 URL 无返回仅作 P2 记录）
    if man_g.get('backMech'):
        s += 1
    else:
        why['P2'].append('直连页无返回入口(经启动器已覆盖)')
    # 引导 1
    if man_g.get('hintHits', 0) > 0:
        s += 1
    else:
        why['P2'].append('未检出操作提示')
    return s, why

def main():
    ap = sys.argv[1]
    label = 'BASELINE'
    if '--label' in sys.argv:
        label = sys.argv[sys.argv.index('--label') + 1]
    outp = sys.argv[sys.argv.index('--out') + 1] if '--out' in sys.argv else os.path.join(ROOT, 'reports', 'AUDIT-%s.md' % label)
    audit = load(ap)
    man = load(os.path.join(ROOT, 'reports', 'games-manifest.json'))
    mby = {g['id']: g for g in man['games']}

    rows = []
    for r in audit['results']:
        gid = r['id']
        if gid == 'hub':
            continue
        g = mby.get(gid, {})
        s, why = score_entry(g, r)
        rows.append({'id': gid, 'name': g.get('name', ''), 'cat': g.get('cat', ''), 'score': s, **why})
    rows.sort(key=lambda x: x['score'])

    p0 = [r for r in rows if r['P0']]
    p1 = [r for r in rows if not r['P0'] and r['P1']]
    p2 = [r for r in rows if not r['P0'] and not r['P1'] and r['P2']]
    clean = [r for r in rows if not r['P0'] and not r['P1'] and not r['P2']]
    # 共性问题排行
    from collections import Counter
    cnt = Counter()
    for r in rows:
        for k in ('P0', 'P1', 'P2'):
            for w in r[k]:
                cnt[w.split('(')[0].split('×')[0]] += 1

    L = []
    L.append('# 游戏库质量审计报告 · %s' % label)
    L.append('')
    L.append('- 生成时间: %s' % datetime.datetime.now().isoformat(timespec='seconds'))
    L.append('- 审计口径: 本地静态服务 + CDP 无头双视口（390 移动 / 1440 桌面），每款等载 %dms；控制台 error/异常全程监听' % audit.get('wait', 2400))
    L.append('- 数据源: %s（动态） + games-manifest.json（静态）' % os.path.basename(ap))
    L.append('')
    L.append('## 总览')
    L.append('')
    L.append('| 指标 | 数值 |')
    L.append('| --- | --- |')
    L.append('| 游戏总数 | %d |' % len(rows))
    L.append('| 可启动（双视口 HTTP 200 且有内容） | %d |' % len([r for r in rows if not r['P0']]))
    L.append('| **P0（打不开/白屏/运行时异常） | %d** |' % len(p0))
    L.append('| P1（console.error/明显溢出） | %d |' % len(p1))
    L.append('| P2（轻缺陷：轻溢出/无标题/直连无返回/未检出提示） | %d |' % len(p2))
    L.append('| 完全干净 | %d |' % len(clean))
    L.append('| 平均分 | %.1f / 10 |' % (sum(r['score'] for r in rows) / max(1, len(rows))))
    L.append('')
    L.append('## 共性问题排行')
    L.append('')
    L.append('| 问题 | 款数 |')
    L.append('| --- | --- |')
    for k, v in cnt.most_common(12):
        L.append('| %s | %d |' % (k, v))
    L.append('')
    if p0:
        L.append('## P0 清单（逐款）')
        L.append('')
        for r in p0:
            L.append('- **g%d %s**（%s, %.0f分）: %s' % (r['id'], r['name'], r['cat'], r['score'], '; '.join(r['P0'] + r['P1'])))
        L.append('')
    if p1:
        L.append('## P1 清单')
        L.append('')
        for r in p1:
            L.append('- g%d %s（%s）: %s' % (r['id'], r['name'], r['cat'], '; '.join(r['P1'])))
        L.append('')
    if p2:
        L.append('## P2 摘要（前 20，其余见 JSON）')
        L.append('')
        for r in p2[:20]:
            L.append('- g%d %s: %s' % (r['id'], r['name'], '; '.join(r['P2'])))
        L.append('')
    L.append('## 评分末 15 名（优先改进对象）')
    L.append('')
    L.append('| 款 | 名称 | 类别 | 分 |')
    L.append('| --- | --- | --- | --- |')
    for r in rows[:15]:
        L.append('| g%d | %s | %s | %.0f |' % (r['id'], r['name'], r['cat'], r['score']))
    L.append('')
    with io.open(outp, 'w', encoding='utf-8') as f:
        f.write('\n'.join(L) + '\n')
    print('REPORT-DONE %s rows=%d P0=%d P1=%d P2=%d clean=%d -> %s' % (label, len(rows), len(p0), len(p1), len(p2), len(clean), outp))

if __name__ == '__main__':
    main()
