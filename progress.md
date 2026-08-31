# 口袋游戏机 PWA 进度

> 任务：output/games/game-ports 6款HTML游戏 → PWA 上手机（方案见 ../game-ports-mobile-pwa-plan.md）
> 2026-08-31 开工。

## 状态：已部署并自动化验证通过，待真机验收

## 已完成
| # | 步骤 | 结果 |
|---|---|---|
| 1 | 摸底 | 6款全自带触屏/禁缩放/touch-action/audio resume；Chrome 390x844 模拟逐款截图自查布局 6/6 通过，游戏侧零改动 |
| 2 | 构建目录 | output/games/game-ports-pwa/，每游戏仅保留自包含 index.html（game05 图片全 data URI 内联，art/ 为素材源不参与运行） |
| 3 | 图标 | PIL 程序化生成 4 枚（192/512/maskable512/apple180），深空底+橙金星球 |
| 4 | PWA 三件套 | manifest.json（standalone/portrait）+ sw.js（stale-while-revalidate，VERSION=v1.0.0）+ hub index.html（深空风6卡片+安装引导+微信检测+safe-area） |
| 5 | 注入 | inject_pwa.py（../inject_pwa.py）幂等注入6游戏：manifest链接/theme-color/standalone返回浮标⌂；script配对自检6/6 |
| 6 | 局域网服务 | http.server 8765 独立进程（Start-Process），本机 192.168.43.55:8765，全资源 200 |
| 7 | 部署 | repo github.com/frandy820/game-ports（public，master）→ Pages 已开：**https://frandy820.github.io/game-ports/** |
| 8 | 线上验证 | 10项URL全200；SW activated+13项预缓存（v1.0.0）；模拟离线：hub 6卡渲染✓、game02 加载✓（含返回浮标）|

## 关键决定
- 游戏页不注入 viewport-fit=cover（零布局风险），theme-color #0d1322 兜底状态栏色
- 返回浮标仅在 display-mode:standalone 显示（iOS PWA 无系统返回键）
- SW 用 stale-while-revalidate：离线立开 + 改动后台自动更新，游戏更新只需改文件 + sw.js bump VERSION + push
- 本地 http://IP 非_secure context_，SW 不注册（仅影响局域网尝鲜的离线能力，不影响游玩）

## 待办
- [ ] 用户真机验收：iPhone Safari 添加主屏幕（全屏/离线/存档），安卓 Chrome 安装
- [ ] 触屏手感反馈修订

## 修复记录
- 2026-08-31 iPhone微信打开 hub 下半空白（6卡片+footer不渲染，guide正常显示）→ v1.0.1：卡片由 JS innerHTML 注入改为**静态 HTML 写死**（build_hub.py 生成），JS 仅剩引导条+SW注册；微信 iPhone UA 模拟验证 6卡全渲染。根因未定位（无法远程抓 iOS console），防御性重构。**注意：微信内可能缓存旧页约10分钟（Pages max-age=600），仍空白则下拉刷新/稍等**

## 回滚
- 关 Pages：gh api repos/frandy820/game-ports/pages -X DELETE
- 删 repo：gh repo delete game-ports --yes
- 本地源 game-ports/ 全程未动
