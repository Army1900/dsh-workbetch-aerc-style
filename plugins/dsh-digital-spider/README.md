# 数字蜘蛛 · 工业宠物助手

DeepSeek Harness Web 桌面上的未来工业八足宠物。**俯视视角**，身体只有晶体管大小（约 16×5px），八条细长腿展开约 140px，整张页面都是它的表面；它不只是一段装饰动画，会读真实的会话与定时任务状态：

- **会话关注**：每个空闲会话行左侧有一个 5px 蜘蛛锚点；会话收尾后，蜘蛛才去对应行。它不为每次开始/结束弹通用提示；没有事件时会从右下角 dock 缓慢巡游，走一段停一段。
- **定时任务**：任务进入触发前 2 分钟、真正到点时，蜘蛛在右下角 dock 提醒；45 分钟内有任务时脚边会挂倒计时小牌。
- **点子**：会话收尾 2 秒后（每会话 20 分钟冷却、全局 2 分钟间隔），读该会话最后内容，加载本地 **OpenMind** 技能集合，挑 1–2 个技能一起推演，输出带 `title / suggestion / rationale / skill` 的结构化点子；模型失败时不硬凑自动点子，手动按钮保留本地模板。
- **状态面板**：点蜘蛛身体打开 `DIGITAL SPIDER // PET-07`，看推进中的会话、接下来三条任务、最新点子、点子抽屉与 OpenMind 加载状态；可以点「再想一个」当场再推演一次。

## 两种动效（状态面板可切换）

点蜘蛛身体打开状态面板，顶部有 `ORGANIC / CYBER` 两个选项；选择会写进 localStorage，刷新后保持。默认是 `CYBER`。

### ORGANIC · 保留的有机蜘蛛

按距离与足尖锚点走路的版本，已经不是 CSS 摆动腿：

- **晶体管大小的身体**：约 16×5px 的细长腹甲 + 小头胸部 + 8 颗青色传感器眼，金属渐变、橙色危险纹、发光背核；身体朝向沿速度方向平滑转向。
- **三段式腿**：髋→膝→踝→足，每帧做两段式 IK 后再把胫节拆出一个带小角度折弯的跗节；膝关节朝身体外侧弯，身体移动时腿会自然伸缩，不会穿模或瞬移。
- **足尖是真的锚点**：落下的脚固定在**世界坐标**上，身体在它上方移动；只有脚与静止落点的距离超过步幅时，才抬腿、走一条带侧弯的弧线、落到新的抓握点。
- **交替四足 + 同侧波**：8 条腿分成两组轮流迈步，组内还有一条从前到后的相位波；步态相位由身体位移推进，而不是纯计时。走路速度压到约 50px/s，最多同时 4 条腾空，步幅长、节奏慢；跑动时步幅、步频与身体朝向一起变化，转弯时腿会自己找新落点。
- **身体律动**：步态相位驱动身体前后 surge 与横向 sway，转弯时腹部会以相反方向轻微滞后（abdomen lag），不是一块刚体平移。
- **停走节律**：走路时每 2.4–5.6 秒会停 0.26–0.68 秒，再继续爬；提醒触发的跑动不受这个节律影响。刚接到提醒时会先有一次很短的起跑脉冲（body startle），然后冲刺。
- **抓握反馈**：脚落下时留下一个向外扩散的橙色 grip 环，抬脚时足尖变亮、影子拉开、腿上的橙色 trace 变亮；静止时前腿更频繁地单腿探路（约 1.4–3.6s 一次），后腿更慢，保持活着的感觉。
- **低速巡游**：没有提醒时蜘蛛从右下角 dock 出发缓慢巡游，走一段停一段；收到会话/任务/点子会优先去对应锚点，处理完回 dock 再继续。气泡会出现在蜘蛛旁边，并自动避开屏幕边缘。系统开启「减少动效」后不再移动。

### CYBER · 电子爬虫

它仍然有足、会爬，只是步态不规律：

- **足尖抓住页面**：每条腿的足尖是固定的世界坐标；身体移动时，腿从髋到足被拉长/压缩，而不是用“飘过去的腿尖”跟随。
- **松散的伸缩步**：每条腿有自己的伸展上限和随机计时器；身体走远或计时器到点，且轮到自己的相位窗口，腿才抬起、伸到新落点再踩下。一次最多 3 条腿摆动（奔跑时 4 条），相位是松散波而不是严格分组，步长、时长、落点仍带随机。
- **长距离伸缩**：新落点大约在 68–138px 外；前腿明显偏向身体前进方向，后腿保持外展，避免交叉。四段腿直接拉长，不做 IK 可达性限制；落点留下橙色 grip 环，踩下瞬间身体轻微下沉。
- **四段电缆腿**：髋→P1→P2→P3→足，节点只有 1–4.5px 的缓慢波动；足尖实际抓住页面，不抽搐。
- **与 ORGANIC 同一套颜色**：钢灰腿、橙色 trace（虚线）、橙色关节和暖白足尖，不再使用青色；身体只多一圈橙色虚线光环与轻微橙色 drop-shadow。
- **爬行速度**：约 58px/s；后侧足尖拖得越远、同时迈步的腿越多，身体会被自动降速，等足尖重踩后再加速，不是身体独立匀速滑行。
- **活体感**：身体 sway/surge 平滑，不会被每一步的落足脉冲或 startle 抖一下；腿按松散的相位波错开迈步；单腿每隔 5–11 秒向外远探一次，形成“探路/感知”的动作。身体速度用平滑因子跟随后腿拖拽，不会一顿一顿。

- **远距虫洞**：目标距离超过 `WORMHOLE_DISTANCE`（默认 260px）时不再慢慢爬过去，而是在原地开一个**信息流虫洞**：
  - 虫洞直径约 150–200px：两圈反向旋转的虚线环、一圈刻度、中心暗核与脉冲圈，两点之间一条流动的橙色虚线数据带；
  - **钻入**（约 0.5s）：虫洞从 0.35 倍张开，身体连同八条腿一起缩小，足尖以 2.6rad 螺旋收进洞心，洞口闪一下；
  - **传输**（0.2s）：身体暂时隐藏，起点洞收拢、终点洞张开，数据带闪亮；
  - **钻出**（约 0.54s）：终点虫洞打开，身体从 3% 放大回原尺寸，腿尖螺旋展开，洞口在最后 28% 淡出；总时长约 1.24 秒。
  - 虫洞只在 CYBER 模式启用；ORGANIC 仍按原来的方式爬过去。按「减少动效」时也不播放虫洞，直接瞬移并显示提醒。

## 结构

| 文件 | 作用 |
| --- | --- |
| `index.js` | Host 半部：订阅 `api-session/*`、`schedule/changed`，读 `sessionQuery` / `schedule` / `llm`，提供两个本地端点 |
| `client.js` | Client 半部：`shell.overlay` 里的整页蜘蛛、`sidebar.session.row.leading` 的 5px 会话锚点、程序化步态、点子卡片/抽屉与状态面板；zh/en 文案 |
| `cordis.patch.yml` | 插入 `digital-spider` 插件行 |
| `locale/*.json` | 插件管理器里的名称与描述 |
| `icon.svg` | 俯视蜘蛛图标 |

### 两个端点

浏览器半部只跟本包 Host 半部说话，不碰别的插件的 DOM、不读会话日志：

```text
GET  /dsh-digital-spider/state   # 会话、任务、点子抽屉、OpenMind 状态
POST /dsh-digital-spider/idea    # 带 sessionId 当场再推演一个点子
```

端点放在 `/api` 之外（`/api` 是框架自己的前缀路由）；只接受回环地址与同源页面，跨站请求会被 `sec-fetch-site` 检查挡掉。状态全部在内存里，不写盘，也不往会话日志追加任何东西。

### 落点

| 目标 | 位置 | 触发 |
| --- | --- | --- |
| 会话 / 点子 | 该会话行左侧 5px 蜘蛛锚点 | 会话收尾生成点子 / 从抽屉打开旧点子 |
| 定时任务 | 右下角 dock | 任务进入 2 分钟窗口 / 到点 |
| 待机 | dock 附近缓慢巡游 | 没有待处理事件 |

锚点由插件注册到 `sidebar.session.row.leading`，只读取自己的 5px DOM；会话行滚动出视口或折叠时退回 dock。远距离目标仍可能触发 CYBER 虫洞。

## 调整

Host 侧常量都在 `index.js` 顶部：

- `TICK_MS`：状态补读节拍（默认 4s）
- `SCHEDULE_LEAD_MS`：提前多久提醒（默认 120s）
- `IDEA_GAP_MS` / `SESSION_IDEA_COOLDOWN_MS`：全局点子间隔（2 分钟）与同一会话冷却（20 分钟）
- `IDEA_DEBOUNCE_MS` / `IDEA_MIN_SESSION_MS`：收尾后等 2s、短于 45s 的会话不生成
- `OPENMIND_CACHE_MS`：OpenMind 技能目录扫描缓存；路径可用 `DSH_OPENMIND_DIR` 或插件 `openmindDir` 配置覆盖
- `IDEA_MAX_TOKENS`、`IDEA_CONTEXT_CHARS`：推演的成本与上下文长度
- `MAX_EVENTS` / `MAX_SESSIONS`：快照规模

Client 侧在 `client.js` 顶部：

- `POLL_MS`：轮询间隔（默认 1.6s）
- `BUBBLE_MS` / `IDEA_MS`：气泡停留；点子卡片保留 30s 后收进抽屉
- `WALK_SPEED` / `RUN_SPEED` / `ACCEL`：爬行与奔跑速度（默认 50 / 280 px/s）
- `BODY_SCALE`：身体绘制缩放（默认 0.26，改大就会变回大蜘蛛）
- `rowAnchors` / `dockPoint`：会话行锚点与右下角待机点
- `LEG_DEFS`：八条腿的髋点、静止落点、左右侧与步态组；改这里能改腿长、腿展与站姿
- `MOTION_KEY`：动效偏好的 localStorage key；默认 `CYBER`
- `updateCyberLegs`：CYBER 的足尖重踩间隔、伸展上限、探出半径与 grip ping
- `WORMHOLE_DISTANCE` / `WARP_OUT_MS` / `WARP_TRANSFER_MS` / `WARP_IN_MS`：远距虫洞阈值与三段时长
- `PHASE_OFFSETS`：ORGANIC 的同侧波相位
- `CHIP_WINDOW_MS`：倒计时牌出现的窗口（默认 45 分钟）
- `CSS` 里可以改身体配色、腿宽、grip 环与 HUD 样式

## 安装与停用

本目录通过 Plugin Manager 的 `install_bundle` 安装为当前 profile 的 bundle，随后由 HMR 激活。停用插件即移除蜘蛛与两个端点；不需要回退其他插件。

## 验证边界

已实际验证：

- `index.js` / `client.js` 通过 `node --check`，三个 JSON 与 `icon.svg` 解析通过；
- `install_bundle` 返回 `application: applied`，无 warnings；Bundle 列表里 `dsh-digital-spider` 为 enabled / installed；
- Client 侧 `shell.overlay` 的 `digital-spider-pet` occupant 为 active（order `-4`，位于机架之上、toast 之下）；
- `GET /dsh-digital-spider/state` 返回 `v: 1`，`sessionController` 的 running 基线与当前会话一致；`openmind.available` 为 `true`，`skillCount` 为 7；
- `POST /dsh-digital-spider/idea` 带 `sessionId` 时成功调用默认模型，读取 OpenMind 技能，返回 `format: 2` 的 `ideaTitle / suggestion / rationale / skill`，并把 `idea` 写入快照与抽屉；
- 用 headless 冒烟测试渲染了 `SpiderPet`：结构化点子卡片、会话行锚点退回 dock、CYBER 虫洞、状态面板与 `ORGANIC / CYBER` 切换都能跑；测试里点子卡片断言 `ds-pop__why` 存在。

未验证或受环境限制：

- 当前环境没有浏览器控制，蜘蛛的实际爬行、8 条腿的 IK、步态节奏、抓握环、气泡与面板排版、明暗主题下的观感仍需在 Harness 页面里人工确认；
- 当前没有活动中的定时任务，因此 2 分钟预警 / 到点提醒的端到端路径只做了代码审查，没有真实触发；
- `prefers-reduced-motion`、窄视口与高 DPI 的视觉表现同样需要人工确认。

## 设计备注

- 蜘蛛本体与抓握环属于 artwork，使用固定的工业色（烟黑、金属灰、安全橙、少量青）；气泡、面板、按钮底色与文字全部走 `--dsw-alias-*` token，明暗主题自动跟随。
- 不静默修改宿主：不替换应用根、不往 `document.body` 追加东西、不 require Harness Client 包；只通过 `shell.overlay` 注册一只宠物。
- 会话状态以 `api-session/status` / `api-session/activity` 为准，标题与摘要经 `sessionQuery` 补读；不轮询 `agent/status`，也不重扫会话日志。
- 点子生成会把**所选会话的标题、最近一条用户消息和最近一条助手回复**（各截断）以及**本地选中的 OpenMind 技能说明**发给当前默认模型；这是本插件唯一的外发内容。OpenMind 源码保存在集合外的独立克隆里，不进入 workbench 仓库。
- 会话锚点只注册在宿主提供的 `sidebar.session.row.leading` 槽位，渲染自己的 5px 节点；点击锚点由 DOM 冒泡交给会话行自己的打开逻辑，不读取别的插件 DOM。
- 腿的落点是页面上的世界坐标；除自己的行锚点外，它不会读取宿主的按钮/卡片位置。
