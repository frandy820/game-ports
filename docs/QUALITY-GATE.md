# 质量门禁 · 可重复执行手册

> 2026-09-20 夜批建立。目标：任何一次改动（平台/游戏）之后，都能用同一组命令量化「有没有把库改坏」。
> 全部命令在仓库根（game-ports-pwa/）执行；前置：本地静态服务 `python -m http.server 8931 --bind 127.0.0.1`（后台）。

## 命令速查

| # | 命令 | 耗时 | 作用 |
| --- | --- | --- | --- |
| 1 | `python tools/audit/scan_static.py` | ~10s | 静态清单（150 卡元数据+返回/存档/输入/提示特征）→ reports/games-manifest.json |
| 2 | `node tools/audit/audit_sweep.js --base http://127.0.0.1:8931 --wait 2400 --out reports/audit-run.json --games 1-150,hub` | ~15-20min | CDP 双视口（390 移动/1440 桌面）全库动态审计：HTTP/白屏/控制台异常/溢出/标题 |
| 3 | `python tools/audit/make_report.py reports/audit-run.json --label POST` | ~2s | 合并评分 → reports/AUDIT-POST.md（P0/P1/P2+共性问题+末15名） |
| 4 | `node tools/audit/smoke_platform.js` | ~1.5min | 平台主路径：chips/收藏/筛选/继续游玩/play 启动器/搜索/返回（双视口） |
| 5 | `node tools/audit/smoke_shell.js` | ~30s | 壳层错误兜底：直连 overlay + iframe→父页错误条 + 恢复 |
| 6 | `node tools/audit/smoke_offline.js` | ~1min | 离线链路：sw 安装→断网→hub/play/briefs/游戏全可用 |
| 7 | `python tools/platform/inject_shell.py --check` | ~5s | 校验 150 款壳层引用在位（新部署/重建某款后须先跑无 --check 版） |

## 准入门禁（新增/改动一款游戏合入前）

1. **重建门禁**（改动前）：`python build<NN>.py` 的产物 md5 必须与当前部署 `game<NN>/index.html` 剥壳行后一致（证明构建管线可信），才允许改源码。
2. **回归门禁**（改动后）：款内已有 verify/smoke/playthrough 全绿；无资产款至少跑 smoke_polish<NN>.js（boot→引导→开始→一局动作→结算→重开→返回→二次不弹）。
3. **部署门禁**：`python tools/platform/integrate_game.py NN <md5前8>`（重建+部署+壳层注入+briefs 重生成+断言）。
4. **全库门禁**（批次收尾）：#2 sweep + #3 报告 —— **P0 必须=0**，P1 不得新增；与上一份 AUDIT-*.md 对比不得回退。

## 当前基线与已达标状态

- 基线（改动前）：reports/AUDIT-BASELINE.md —— 148/150 可启动，P0=2（g63/g64 运行时异常），P1=2（g18/g39 横向溢出），平均 8.8/10。
- 平台层已消解的共性问题：「直连页无返回入口」（111 款）由 play.html 启动器统一提供返回/重开/全屏/收藏；「未检出操作提示」（55 款）由启动前说明面板统一提供目标/操作/胜负（人工打磨款为核实文案，其余为诚实兜底+游戏内菜单）。

## 分级口径

- **P0**：打不开 / 白屏 / 未捕获运行时异常 —— 阻断合入
- **P1**：console.error / 390px 横向溢出 >24px —— 当批修复
- **P2**：轻溢出 ≤24px / 无标题 / 直连无返回（已由启动器覆盖）/ 未检出操作提示 —— 记录，择批清
- **P3**：新模式/新内容/联网功能 —— backlog，不做
