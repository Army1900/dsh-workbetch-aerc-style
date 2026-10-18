# 非正常事件研究中心 · 重工业终端

DeepSeek Harness 的 Web 桌面主题插件。视觉是**科幻现实主义重工业**：烟黑、骨白、氧化铁与**国际安全橙**，1px 结构线、危险条纹和实心钢印徽记；控制光影，不做大面积霓虹。

文案采用「非正常事件研究中心」内部终端口吻：编号、权限、观测、归档，冷峻而克制。

## 一套结构语言

启动画面不是孤立的一张皮，内部界面复用同一套元素：

1. **启动序列**（Web 客户端每次启动播放约 2.6 秒，3 秒内连续刷新不重播）
   - AERC 机构抬头、第七工业观测站、档案编号
   - 大字改为 `非正常事件研究中心`：`研究中心` 为实心安全橙块
   - 页眉为 `ABNORMAL EVENT RESEARCH CENTER`，副标题为 `工业智能终端 · 观测层`
   - 底栏条码、`AERC-07 / 0417 / INTERNAL` 编号与危险条纹
   - 背景巨型 `07` 钢印水印
   - 人员权限 / 异常场 / 收容协议 / 观测阵列 / 工业层接入 五项自检
   - 32 段进度条、归档提示；点击任意位置或按 Esc / Enter / 空格跳过
   - 尊重 `prefers-reduced-motion`
2. **常驻机架**
   - 窗口四周 1px 窗框 + 安全橙 L 形角标
   - 96px 车间网格与极低对比扫描线（约 1.6%），只作材质，不挡操作
   - 与启动画面的 `inset 16px` 窗框、角标互为呼应
3. **会话状态条**
   - 编辑器下方一行 `AERC-07 // 观测链路在线`
   - 9.5px 等宽字、危险条纹小段、低对比，对应启动画面底部状态栏
4. **徽记**
   - 实心安全橙八角钢印板 + 负形 `D` + 反应堆芯点，用 `bg-base` 做真镂空
   - 同时用于**侧边栏品牌位**（替换默认图标）、空白会话 Hero、启动画面与插件图标
   - 侧边栏铭牌随折叠/展开的 `size` 缩放，小尺寸仍保持 `D` 与芯点可读
5. **左侧菜单**
   - `插件` → 模块机架（三个槽位 + 安全橙指示灯）
   - `定时任务` → 工业计时器（刻度盘 + 安全橙中心轴）
   - 用同 id + `priority: -10` 取得列表占用权；面板跳转、选中态和 tooltip 不变
   - News Wall 等通过 `ctx.slots.inject` 注册的图标会随新槽位恢复
   - SDD 七阶段由主题用同 id 重新挂回（沿用原插件的 20px 字形）；`项目开发` 组头由主题合成，可折叠，子项展开时缩进；主面板仍由 SDD 插件提供
6. **侧栏 chrome 接管**
   - `cordis.patch.yml` 禁用宿主 `ui-sidebar`，由本插件重新声明侧栏座位
   - 顶部品牌行、新建会话、面板导航、页脚由主题渲染
   - **工作区浏览器、设置面板仍由原插件通过 `sidebar.workspaces` / `sidebar.settings` 子槽渲染**，没有重写
   - 新建会话移到侧栏顶部（安全橙硬边按钮）；工作区切换在侧栏底部与输入栏右侧
   - 侧栏完全隐藏时，窗口左上角的开关/新建会话由 `shell.leading` 主题控件接管
   - 输入栏控件未重写，但发送/停止、模型、权限、计划按钮的 token 已映射到主题色
7. **配色**
   - 覆盖 Harness 的 14 个别名色 token：
     暗色为烟黑/氧化铁 + 国际安全橙 `#ff5a1f`；亮色为骨白 + 深锈橙 `#bd3510`。
   - 状态色保留一套氧化铜绿 / 危险黄作为第二、第三信号色，不再是单一灰橙。
   - 启动画面、机架、状态条、徽记全部引用 token，**没有硬编码颜色**。
8. **输入框、气泡与菜单**
   - 宿主 composer 实际用的是 `--dsw-specific-input-major`（不是 14 个 alias token 之一）
   - 主题在 `<html>` 与 `<body>` 两处把 `--dsw-specific-input-major` 映射到 `--dsw-alias-bg-layer-1`
   - 同时映射 `bubble` / `bubble-highlight` / `menu` / `selector` / `tip` / 悬浮态 / 三级文字 / 滚动条
   - composer 边框的 `--dsw-alias-state-warn-secondary` 改为危险黄与边框的混合色
   - 输入框右下角的发送/停止按钮用 `--dsw-alias-button-info-fill/hover`，已映射到安全橙；`primary` 按钮与前景色一并映射
   - 另有一条 `.yhfFVG_primary` 直接兜底规则（宿主版本专属 class），确保发送/停止按钮不被更内层的主题 token 覆盖
   - 这些映射用 `var(--dsw-alias-*)` 引用，黑/白模式切换时自动重算

## 黑白自动切换

主题同时提供 `light` / `dark` 两套 token，`ctx.theme.overrideTokens` 按当前外观模式逐 token 重算：

- 在 `设置 → 外观` 选择浅色 / 深色 / 跟随系统，界面立即切换；
- 系统外观变化且偏好为「跟随系统」时也会切换；
- 启动画面、机架、状态条、Hero 徽记随同一套 token 一起变，不做第二套皮。

## 结构

| 文件 | 作用 |
| --- | --- |
| `index.js` | Host 半部，只负责让插件成为可启停条目 |
| `client.js` | 色层、机架、启动序列、状态条、Hero 徽记、zh/en 文案 |
| `cordis.patch.yml` | 禁用宿主 `ui-sidebar` + 插入 `dsh-scifi-industrial` 行 |
| `locale/*.json` | 插件管理器里显示的名称与描述 |
| `icon.svg` | 原始徽记图标 |

## 调整

- **启动序列时长**：`client.js` 里的 `SPLASH_MS`（毫秒）与 `FADE_MS`（淡出）。
- **重播间隔**：`SPLASH_GUARD_MS`，默认 3 秒；设为 `0` 则每次刷新都播放。
- **配色**：`TOKENS` 中的 `light` / `dark` 值，键名必须是 Harness 的 `--dsw-alias-*`。
- **文案**：`DICT.zh` / `DICT.en`，键名与组件中的 `t(...)` 对应。
- **网格/扫描线**：`.si-chassis__texture` 的 `opacity`；改为 `0` 即关闭。
- **机架边框**：`.si-chassis__frame` 的 `inset`；删除 `scifi-industrial-chassis` 注册即移除。
- **停用 / 回退**：本插件同时禁用了宿主 `ui-sidebar`，直接禁用插件会让侧栏变空。回退步骤：删除 `cordis.patch.yml` 里的 `- id: ui-sidebar … disabled: true`，重新 `remove_bundle` + `install_bundle`，再重启 Harness。

## 验证边界

已通过 JavaScript 语法、JSON、SVG 校验，并确认侧栏 chrome（本插件 occupant，priority -10）、`sidebar.workspaces` 工作区浏览器、`sidebar.settings` 设置面板、`shell.leading` 窗口控件、`shell.overlay` 机架/启动序列、`sidebar.brand.mark` 铭牌、`sidebar.panellist` 的插件/定时任务图标与 SDD 七阶段、`sidebar.footer.action` 的工作区切换、`conversation.input.right` 的工作区切换、`conversation.composer.dock` 状态条与 `conversation.hero.brand.mark` 徽记均已 active；输入框的 specific token 映射已写入根节点，实际颜色与排版需要在 Harness Web 页面中确认。
