# -*- coding: utf-8 -*-
"""inject_shell.py — 幂等注入共享壳层引用到全部 gameNN/index.html（部署产物层）。
用法: python tools/platform/inject_shell.py [--check]   # --check=只核对不写
在复制任何新构建游戏进 pwa 后重跑本脚本（幂等，已注入则跳过）。
"""
import io, os, sys, glob

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
TAG = '<script src="../shell.js" defer></script>'

def main():
    check = '--check' in sys.argv
    dirs = sorted(glob.glob(os.path.join(ROOT, 'game*')))
    injected, already, missing = 0, 0, []
    for d in dirs:
        if not os.path.isdir(d):
            continue
        p = os.path.join(d, 'index.html')
        if not os.path.exists(p):
            missing.append(os.path.basename(d)); continue
        with io.open(p, 'r', encoding='utf-8', errors='strict') as f:
            s = f.read()
        if 'shell.js' in s:
            already += 1; continue
        if '</body>' not in s:
            missing.append(os.path.basename(d) + '(no </body>)'); continue
        if check:
            missing.append(os.path.basename(d) + '(pending)'); continue
        s2 = s.replace('</body>', TAG + '\n</body>', 1)
        with io.open(p, 'w', encoding='utf-8', newline='') as f:
            f.write(s2)
        injected += 1
    print('INJECT-DONE injected=%d already=%d dirs=%d' % (injected, already, len(dirs)))
    if missing:
        print('  pending/missing:', ', '.join(missing[:10]), '...' if len(missing) > 10 else '')
        sys.exit(1 if check else 0)

if __name__ == '__main__':
    main()
