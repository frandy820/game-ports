# -*- coding: utf-8 -*-
"""integrate_game.py — 标杆游戏打磨交付集成（主控专用，逐款）。
步骤：重建（复现 fork 回执 md5）→ 部署 built → pwa/gameNN/index.html → 幂等注入壳层 → briefs 重生成 → 基本断言。
用法: python tools/platform/integrate_game.py 132 [期望md5前8位]
"""
import io, glob, os, subprocess, sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
SRC = os.path.join(ROOT, '..', 'game-ports')

def main():
    nn = sys.argv[1] if len(sys.argv) > 1 else ''
    assert nn.isdigit(), 'need game number'
    d = 'game' + (nn.zfill(2) if int(nn) < 10 else nn)
    want = sys.argv[2] if len(sys.argv) > 2 else None
    gdir = os.path.join(SRC, d)
    builds = sorted(glob.glob(os.path.join(gdir, 'build*.py')))
    assert builds, 'no build script in ' + gdir
    r = subprocess.run([sys.executable, builds[0]], cwd=gdir, capture_output=True, text=True, shell=False)
    out = (r.stdout or '') + (r.stderr or '')
    print(out.strip().splitlines()[-3:] and '\n'.join(out.strip().splitlines()[-3:]))
    assert r.returncode == 0, 'build failed'
    built = os.path.join(gdir, 'built.html')
    dst = os.path.join(ROOT, d, 'index.html')
    if os.path.exists(built):
        with io.open(built, 'rb') as f:
            b = f.read()
        if want:
            import hashlib
            got = hashlib.md5(b).hexdigest()[:8]
            assert got == want, 'md5 mismatch: %s != %s' % (got, want)
            print('MD5-OK %s' % got)
        with io.open(dst, 'wb') as f:
            f.write(b)
        print('DEPLOYED %s -> %s (%dB)' % (built, dst, len(b)))
    else:
        print('NO built.html（build 直接写 pwa 或产物异名）——核对 %s mtime/内容' % dst)
    for step in (['inject_shell.py'], ['gen_briefs.py']):
        rr = subprocess.run([sys.executable, os.path.join(HERE, *step)], cwd=ROOT, capture_output=True, text=True)
        print((rr.stdout or '').strip())
        assert rr.returncode == 0
    with io.open(dst, encoding='utf-8') as f:
        s = f.read()
    assert 'shell.js' in s, 'shell tag missing'
    assert '<title>' in s and '</html>' in s
    print('INTEGRATE-DONE %s (%dB, shell✓, briefs✓)' % (d, len(s.encode('utf-8'))))

if __name__ == '__main__':
    main()
