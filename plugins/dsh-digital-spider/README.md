# 数字蜘蛛 · 工业宠物助手

DeepSeek Harness Web 桌面上的未来工业八足宠物。**俯视视角**，身体只有晶体管大小（约 16×5px），八条细长腿展开约 140px，整张页面都是它的表面；它不只是一段装饰动画，会读真实的会话与定时任务状态：

- **会话关注**：每个空闲会话行左侧有一个 5px 蜘蛛锚点；会话收尾后，蜘蛛才去对应行。它不为每次开始/结束弹通用提示；没有事件时会从右下角 dock 缓慢巡游，走一段停一段。
- **定时任务**：任务进入触发前 2 分钟、真正到点时，蜘蛛在右下角 dock 提醒；45 分钟内有任务时脚边会挂倒计时小牌。
- **形态化点子**：会话收尾 2 秒后（每会话 20 分钟冷却、全局 2 分钟间隔），读该会话最后内容。第一轮模型只做技能路由：从 **OpenMind** 的 7 个技能里选一个技能和模式；第二轮按该技能自己的输出契约生成真正的形态：诗（`poetic-essence`）、梦境（`deep-dream`）、约束反转、跨域类比、明心定向、事上练、知行复盘。卡片按形态渲染，不再把一切都压成一句建议。
- **状态面板**：点蜘蛛身体打开 `DIGITAL SPIDER // PET-07`，看推进中的会话、接下来三条任务、最新点子、点子抽屉与 OpenMind 加载状态；「点子形态」里可以选自动或指定诗/梦境/反转等，按这个形态当场生成。

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

像一只在数据网络里寻路的爬虫：走得有目的、有节拍，每一步都踩在支撑多边形里。

- **交替四足步态**：L1·R2·L3·R4 与 R1·L2·R3·L4 两组相差半个周期，组内从后往前有一条小相位波；最多 4 条腿同时腾空，始终有一组撑地。相位由身体**位移 + 转身角速度**推进，身体不动腿就不乱动。
- **抓钩式伸缩腿**：抬腿时取「摆动结束 + 半个支撑期」后身体的预测位姿作为落点，前腿再额外向前抓出（`CYBER_GRAB`），后腿留在身后被拖着收回；腿可伸到静止长度的 2.1 倍（`CYBER_REACH`）。摆动前半程足尖先**缩回**，后半程**弹射伸出**、略越过落点再回弹抓住；影子拉开表示抬起。
- **俯视投影的腿**：各节按比例伸缩，伸得越长越直、胫节与跗节越细，trace 也更亮；膝只在髋—足连线外侧拱出一点，不做随机正弦抖动。橙色信号沿腿从髋流向足尖，落足瞬间足尖与 trace 亮一下，并留下 grip 环。
- **八向路由**：去任何地方都走 0°/45°/90° 的 PCB 式走线（最多一个拐点，巡游目标对齐 24px 栅格）。拐点处发一个方形节点 ping，边转边走切过去（爬行时只停 40–100ms，奔跑不停）。前方用一条流动虚线预览剩余路由与节点。
- **拖链**：身后从纺器拉出一串点状链接，停下后逐渐收回。
- **身体律动**：横向 sway 与步态周期同步；每次前腿抓住、后腿收回，身体被明显拽一下（一个周期两次），转弯时腹部滞后更大；停下后两组腿先后归位，前腿每 4–8 秒伸长向前远探、点出一个扫描 ping 再缩回。巡游间隔 1.6–4.2s。
- **速度**：爬行约 150px/s（`CYBER_WALK_SPEED`），提醒触发的奔跑约 440px/s（`CYBER_RUN_SPEED`）；ORGANIC 仍用 `WALK_SPEED` / `RUN_SPEED`。

- **远距传输（原虫洞）**：目标距离超过 `WORMHOLE_DISTANCE`（默认 260px）时，蜘蛛不爬过去，而是把自己当成一次网络请求发出去。去提醒点、回 dock 一律传输；巡游中的长跳有一半概率传输、一半沿路由快爬，平时每分钟大约能看到 2–6 次。传输途中到达的提醒会在落地后立即补发：
  - **ENCODE 编码**（约 0.52s）：起点出现锁定框 + 准星刻度和 `TX 0x…` 标签；两组腿先后折回身体，身体轻微充能后**量化缩小**（四级）并带横向 glitch，拆成 14 个数据块；同时预先算出的八向链路淡入。
  - **TRANSMIT 传输**（0.34–0.76s，按链路长度伸缩）：数据块排成一列沿链路跳过去，走过的路由被点亮，经过拐点时跳点闪烁放大；起点锁定框松开淡出，终点锁定框收紧，标签 `RX …`。
  - **DECODE 解码**（约 0.6s）：数据块在终点汇合，身体四级量化重建，两组腿先后展开、各自落足留下 grip 环；标签变为 `200 OK 0x…`，锁定框放大淡出。
  - 只在 CYBER 模式启用；ORGANIC 仍按原来的方式爬过去。「减少动效」下不播放传输，直接瞬移并显示提醒。

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
POST /dsh-digital-spider/idea    # { sessionId?, skill?, mode? } 当场生成一个形态
```

端点放在 `/api` 之外（`/api` 是框架自己的前缀路由）；只接受回环地址与同源页面，跨站请求会被 `sec-fetch-site` 检查挡掉。状态全部在内存里，不写盘，也不往会话日志追加任何东西。

### 落点

| 目标 | 位置 | 触发 |
| --- | --- | --- |
| 会话 / 点子 | 该会话行左侧 5px 蜘蛛锚点 | 会话收尾生成点子 / 从抽屉打开旧点子 |
| 定时任务 | 右下角 dock | 任务进入 2 分钟窗口 / 到点 |
| 待机 | dock 附近缓慢巡游 | 没有待处理事件 |

锚点由插件注册到 `sidebar.session.row.leading`，只读取自己的 5px DOM；会话行滚动出视口或折叠时退回 dock。远距离目标仍可能触发 CYBER 数据包传输。

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
- `BUBBLE_MS` / `IDEA_MS`：气泡停留；点子先以**想法气泡**出现（圆角气泡 + 两颗渐小的思考点，只显示一句标题，最多两行），点开才展开成完整卡片（建议、理由、技能与操作按钮）；点开后计时重置为 30s，到时收进抽屉
- `WALK_SPEED` / `RUN_SPEED` / `ACCEL`：爬行与奔跑速度（默认 50 / 280 px/s）
- `BODY_SCALE`：身体绘制缩放（默认 0.26，改大就会变回大蜘蛛）
- `rowAnchors` / `dockPoint`：会话行锚点与右下角待机点
- `LEG_DEFS`：八条腿的髋点、静止落点、左右侧与步态组；改这里能改腿长、腿展与站姿
- `MOTION_KEY`：动效偏好的 localStorage key；默认 `CYBER`
- `CYBER_WALK_SPEED` / `CYBER_RUN_SPEED` / `CYBER_SWING` / `CYBER_REACH` / `CYBER_GRAB`：CYBER 爬行与奔跑速度、摆动相占比、伸缩上限与各对腿的前抓量；`updateCyberLegs` 里是相位偏移、预测落点、收脚与探腿
- `ROUTE_GRID` / `planRoute`：巡游栅格与八向路由；`TRAIL_POINTS`：拖链长度
- `WORMHOLE_DISTANCE` / `WARP_OUT_MS` / `WARP_TRANSFER_MS` / `WARP_IN_MS` / `PACKET_COUNT`：远距传输阈值、编码/传输(基础)/解码时长与数据块数量
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
- `POST /dsh-digital-spider/idea` 手动指定 `skill=poetic-essence, mode=READ` 时成功返回 `format: 3` 的 `artifact.poem / attribution / interpretation / implication`，并写入快照与抽屉；
- 不带 `skill` 的自动请求会先走一轮模型路由，再按选中的技能生成形态；实测自动路由选择了 `act-on-ground`，生成 `step / acceptance`；
- 用 headless 冒烟测试渲染了 `SpiderPet`：诗卡（`ds-pop__poem`）、形态选择器（`ds-form__select`）、结构化点子、会话行锚点退回 dock、CYBER 数据包传输、状态面板与 `ORGANIC / CYBER` 切换都能跑。

未验证或受环境限制：

- 当前环境没有浏览器控制，蜘蛛的实际爬行、8 条腿的 IK、步态节奏、抓握环、气泡与面板排版、明暗主题下的观感仍需在 Harness 页面里人工确认；
- 当前没有活动中的定时任务，因此 2 分钟预警 / 到点提醒的端到端路径只做了代码审查，没有真实触发；
- `prefers-reduced-motion`、窄视口与高 DPI 的视觉表现同样需要人工确认。

## 设计备注

- 蜘蛛本体与抓握环属于 artwork，使用固定的工业色（烟黑、金属灰、安全橙、少量青）；气泡、面板、按钮底色与文字全部走 `--dsw-alias-*` token，明暗主题自动跟随。
- 不静默修改宿主：不替换应用根、不往 `document.body` 追加东西、不 require Harness Client 包；只通过 `shell.overlay` 注册一只宠物。
- 会话状态以 `api-session/status` / `api-session/activity` 为准，标题与摘要经 `sessionQuery` 补读；不轮询 `agent/status`，也不重扫会话日志。
- 点子生成是两轮模型调用：第一轮发送会话上下文 + 7 个技能目录用于路由；第二轮发送**所选会话的标题、最近用户/助手片段**（各截断）以及**所选 OpenMind 技能的说明**用于生成形态。OpenMind 源码保存在集合外的独立克隆里，不进入 workbench 仓库。
- 会话锚点只注册在宿主提供的 `sidebar.session.row.leading` 槽位，渲染自己的 5px 节点；点击锚点由 DOM 冒泡交给会话行自己的打开逻辑，不读取别的插件 DOM。
- 腿的落点是页面上的世界坐标；除自己的行锚点外，它不会读取宿主的按钮/卡片位置。
