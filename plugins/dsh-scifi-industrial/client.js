/**
 * 「非正常事件研究中心」工业终端主题 —— Client 半部。
 *
 * 设计系统（与启动画面共用一套结构语言）：
 *   1. 色层：ctx.theme.overrideTokens 覆盖别名色板，明/暗两套随 Harness 外观自动切换。
 *   2. 启动序列：shell.overlay 中的一次性 AERC 工业终端启动画面（2.6s）。
 *   3. 机架：shell.overlay 中常驻的 1px 窗框 + 琥珀角标 + 车间网格纹理。
 *   4. 会话：编辑器下方的 AERC-07 观测状态条；空白会话 Hero 的 AERC 徽记。
 *
 * 所有可见文案经 ctx.locale 注册（zh / en）；所有界面色取自主题 token，
 * 因此启动画面、机架、状态条会跟着 设置 → 外观 的黑/白/跟随系统一起切换。
 */

window.__ModuleLoader__.load({
  id: 'dsh-scifi-industrial',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    /** 主题层与 locale 命名空间共用这个 id。 */
    const NS = 'dsh-scifi-industrial'
    const STYLE_ID = 'dsh-scifi-industrial-styles'
    const SPLASH_GUARD_KEY = 'dsh-scifi-industrial.splash-at'
    const SPLASH_MS = 2600
    const FADE_MS = 520
    const SPLASH_GUARD_MS = 3000

    /** 每个客户端运行期只播一次启动序列。 */
    let splashConsumed = false
    /** 模块求值即决定本次是否播放，避免 StrictMode 重复消费。 */
    const playSplashOnLoad = shouldPlaySplash()

    const DICT = {
      zh: {
        'meta.system': 'ABNORMAL EVENT RESEARCH CENTER',
        'meta.unit': '第七工业观测站',
        'meta.archive': '档案 AERC-07-0417',
        'boot.sequence': '工业层启动序列',
        'boot.kicker': '工业异常观测单元 07',
        'boot.titleLead': '非正常事件',
        'boot.titleBlock': '研究中心',
        'boot.subtitle': '工业智能终端 · 观测层',
        'boot.noticeLabel': '通知',
        'boot.notice': '本终端记录全部接入行为。未经授权的观察者将被登记为「非正常事件」。',
        'boot.footNote': '内部资料 · 未经授权禁止转发',
        'boot.status.booting': '正在建立观测链路',
        'boot.status.ready': '观测链路已建立',
        'boot.skip': '单击任意位置跳过 · 本画面自动归档',
        'log.clearance': '人员权限校验',
        'log.clearanceValue': '已授权',
        'log.anomaly': '异常场读数',
        'log.anomalyValue': '低于阈值',
        'log.containment': '收容协议',
        'log.containmentValue': '已装载',
        'log.array': '观测阵列',
        'log.arrayValue': '同步中',
        'log.industry': '工业层接入',
        'log.industryValue': '已建立',
        'dock.link': '观测链路在线',
        'nav.plugins': '插件',
        'nav.schedules': '定时任务',
        'action.newSession': '新建会话',
        'action.workspace': '切换工作区',
        'workspace.registry': 'AERC-07 / 工作区登记',
        'workspace.empty': '暂无工作区',
        'sidebar.open': '打开侧边栏',
        'sidebar.collapse': '收起侧边栏',
        'sidebar.panels': '全局面板'
      },
      en: {
        'meta.system': 'ABNORMAL EVENT RESEARCH CENTER',
        'meta.unit': 'INDUSTRIAL OBSERVATION UNIT 07',
        'meta.archive': 'FILE AERC-07-0417',
        'boot.sequence': 'INDUSTRIAL LAYER BOOT SEQUENCE',
        'boot.kicker': 'INDUSTRIAL ANOMALY OBSERVATION UNIT 07',
        'boot.titleLead': '',
        'boot.titleBlock': 'AERC',
        'boot.subtitle': 'INDUSTRIAL TERMINAL · OBSERVATION LAYER',
        'boot.noticeLabel': 'NOTICE',
        'boot.notice': 'This terminal records every access. Unauthorized observers are registered as abnormal events.',
        'boot.footNote': 'INTERNAL MATERIAL · UNAUTHORIZED DISTRIBUTION PROHIBITED',
        'boot.status.booting': 'ESTABLISHING OBSERVATION LINK',
        'boot.status.ready': 'OBSERVATION LINK ESTABLISHED',
        'boot.skip': 'CLICK ANYWHERE TO SKIP · THIS FRAME IS ARCHIVED',
        'log.clearance': 'PERSONNEL CLEARANCE',
        'log.clearanceValue': 'GRANTED',
        'log.anomaly': 'ANOMALY FIELD',
        'log.anomalyValue': 'BELOW THRESHOLD',
        'log.containment': 'CONTAINMENT PROTOCOL',
        'log.containmentValue': 'LOADED',
        'log.array': 'OBSERVATION ARRAY',
        'log.arrayValue': 'SYNCING',
        'log.industry': 'INDUSTRIAL LAYER',
        'log.industryValue': 'LINKED',
        'dock.link': 'OBSERVATION LINK ACTIVE',
        'nav.plugins': 'Plugins',
        'nav.schedules': 'Schedules',
        'action.newSession': 'New Session',
        'action.workspace': 'Switch workspace',
        'workspace.registry': 'AERC-07 / WORKSPACE REGISTRY',
        'workspace.empty': 'NO WORKSPACES',
        'sidebar.open': 'Open sidebar',
        'sidebar.collapse': 'Collapse sidebar',
        'sidebar.panels': 'Global panels'
      }
    }

    /**
     * 别名色层：烟黑、骨白、氧化铁 + 国际安全橙。
     * 明暗两套都给出，Harness 切换外观时逐 token 重算。
     */
    const TOKENS = {
      '--dsw-alias-bg-base': { light: '#f1ede2', dark: '#0d0d0c' },
      '--dsw-alias-bg-layer-1': { light: '#fbf8f0', dark: '#171716' },
      '--dsw-alias-bg-layer-2': { light: '#e4ded1', dark: '#21211f' },
      '--dsw-alias-bg-overlay': { light: '#fffdf7', dark: '#2a2a27' },
      '--dsw-alias-border-l1': { light: '#c9c2b2', dark: '#3a3a35' },
      '--dsw-alias-border-l2': { light: '#8f887a', dark: '#55554e' },
      '--dsw-alias-brand-primary': { light: '#bd3510', dark: '#ff5a1f' },
      '--dsw-alias-label-primary': { light: '#17191a', dark: '#f2eee3' },
      '--dsw-alias-label-secondary': { light: '#5a5a52', dark: '#a6a399' },
      '--dsw-alias-state-error-primary': { light: '#a3352a', dark: '#e0503f' },
      '--dsw-alias-state-idle-primary': { light: '#67675f', dark: '#8a8a80' },
      '--dsw-alias-state-success-primary': { light: '#3d6f63', dark: '#4f9b8e' },
      '--dsw-alias-state-warn-primary': { light: '#8a6400', dark: '#e8b53a' },
      '--dsw-specific-sidebar-fill': { light: '#e7e0d0', dark: '#16100c' }
    }

    /** 启动序列的检查项：到进度阈值时点亮。 */
    const LOG_STEPS = [
      { at: 0.08, t: '00.2', label: 'log.clearance', value: 'log.clearanceValue' },
      { at: 0.26, t: '00.9', label: 'log.anomaly', value: 'log.anomalyValue' },
      { at: 0.46, t: '01.5', label: 'log.containment', value: 'log.containmentValue' },
      { at: 0.66, t: '02.2', label: 'log.array', value: 'log.arrayValue' },
      { at: 0.86, t: '02.8', label: 'log.industry', value: 'log.industryValue' }
    ]

    const SEGMENT_COUNT = 32

    /* SDD 七阶段：原插件直接注册 panellist，chrome 换槽后不会自动重注册；
       这里用同 id / 同 label 重新挂回图标，主面板仍由原插件提供。 */
    const SDD_GROUP_ID = 'e2e-dev-sdd-group'
    const SDD_GROUP_LABEL = '项目开发'
    const SDD_GROUP_PATH =
      '<rect x="2.5" y="3" width="15" height="14" rx="2"/><path d="M2.5 7.5h15M7.5 7.5V17"/><path d="m10.5 10.5 1.4 1.4 2.6-2.9"/>'
    const SDD_PANELS = [
      { id: 'dashboard', label: '项目看板', order: 1 },
      { id: 'requirements', label: '需求讨论', order: 2 },
      { id: 'prototype', label: '原型输出', order: 3 },
      { id: 'architecture', label: '系统设计', order: 4 },
      { id: 'specification', label: '规格设计', order: 5 },
      { id: 'development', label: '开发测试', order: 6 },
      { id: 'settings', label: '项目设置', order: 7 }
    ]
    const SDD_CHILD_IDS = new Set(SDD_PANELS.map((panel) => panel.id))
    const SDD_ICON_PATHS = {
      dashboard:
        '<rect x="3" y="3" width="5.5" height="5.5" rx="1"/><rect x="11.5" y="3" width="5.5" height="3.5" rx="1"/><rect x="3" y="11.5" width="5.5" height="5.5" rx="1"/><rect x="11.5" y="9.5" width="5.5" height="7.5" rx="1"/>',
      settings:
        '<circle cx="10" cy="10" r="2.5"/><path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M15.3 4.7l-1.4 1.4M6.1 13.9l-1.4 1.4"/>',
      requirements:
        '<path d="M6 3.5h6l3 3V16a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1Z"/><path d="M12 3.5V7h3M7.5 10h5M7.5 13h3.5"/><path d="m7.2 15.1.8.8 1.5-1.7"/>',
      prototype:
        '<rect x="2.75" y="3" width="14.5" height="14" rx="2"/><path d="M3 7h14M7.5 7v10M10 10h4.5M10 13h3M5.1 5h.1"/>',
      architecture:
        '<rect x="7" y="2.5" width="6" height="4" rx="1"/><rect x="2.5" y="13.5" width="5" height="4" rx="1"/><rect x="12.5" y="13.5" width="5" height="4" rx="1"/><path d="M10 6.5v3M5 13.5v-4h10v4"/>',
      specification:
        '<path d="M5 3.5h8l2 2V16a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1Z"/><path d="M13 3.5V6h2M8 8.5 6.5 10 8 11.5M12 8.5l1.5 1.5-1.5 1.5M9.5 13.5h3"/>',
      development:
        '<circle cx="5" cy="5" r="1.75"/><circle cx="5" cy="15" r="1.75"/><circle cx="14.5" cy="6.5" r="1.75"/><path d="M5 6.75v6.5M6.75 5h2a4 4 0 0 1 4 4v1"/><path d="m11.5 13.5 1.7 1.7 3.3-3.7"/>'
    }

    const CSS = `
.si-boot,
.si-boot *,
.si-boot *::before,
.si-boot *::after,
.si-chassis,
.si-chassis * { box-sizing: border-box; }

::selection {
  background: color-mix(in srgb, var(--dsw-alias-brand-primary) 38%, transparent);
  color: var(--dsw-alias-label-primary);
}

/* ───────────────────────── 机架：横贯全窗口的工业边框 ───────────────────────── */
.si-chassis {
  position: fixed;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  overflow: hidden;
}
.si-chassis__texture {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-image:
    linear-gradient(90deg, color-mix(in srgb, var(--dsw-alias-label-primary) 6%, transparent) 1px, transparent 1px),
    linear-gradient(180deg, color-mix(in srgb, var(--dsw-alias-label-primary) 4%, transparent) 1px, transparent 1px),
    repeating-linear-gradient(0deg, color-mix(in srgb, var(--dsw-alias-label-primary) 7%, transparent) 0 1px, transparent 1px 3px);
  background-size: 96px 96px, 96px 96px, 100% 3px;
  opacity: 0.16;
}
.si-chassis__frame {
  position: absolute;
  inset: 6px;
  border: 1px solid color-mix(in srgb, var(--dsw-alias-border-l2) 45%, transparent);
}
.si-chassis__corner {
  position: absolute;
  width: 16px;
  height: 16px;
  border: 0 solid var(--dsw-alias-brand-primary);
}
.si-chassis__corner--tl { top: 6px; left: 6px; border-top-width: 2px; border-left-width: 2px; }
.si-chassis__corner--tr { top: 6px; right: 6px; border-top-width: 2px; border-right-width: 2px; }
.si-chassis__corner--bl { bottom: 6px; left: 6px; border-bottom-width: 2px; border-left-width: 2px; }
.si-chassis__corner--br { bottom: 6px; right: 6px; border-bottom-width: 2px; border-right-width: 2px; }

/* ───────────────────────── 启动画面：全套 token，自动黑白切换 ───────────────────────── */
.si-boot {
  --si-bg: var(--dsw-alias-bg-base);
  --si-panel: var(--dsw-alias-bg-layer-1);
  --si-line: var(--dsw-alias-border-l1);
  --si-line-strong: var(--dsw-alias-border-l2);
  --si-ink: var(--dsw-alias-label-primary);
  --si-muted: var(--dsw-alias-label-secondary);
  --si-accent: var(--dsw-alias-brand-primary);
  --si-warn: var(--dsw-alias-state-warn-primary);
  position: fixed;
  inset: 0;
  z-index: 2147483000;
  pointer-events: auto;
  display: flex;
  flex-direction: column;
  gap: clamp(18px, 3vh, 36px);
  padding: clamp(22px, 4vh, 52px) clamp(24px, 4.4vw, 68px);
  overflow: hidden;
  isolation: isolate;
  background-color: var(--si-bg);
  color: var(--si-ink);
  font-family: ui-monospace, "SFMono-Regular", Menlo, Consolas, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", monospace;
  font-size: 13px;
  line-height: 1.5;
  cursor: default;
  user-select: none;
  opacity: 1;
  transition: opacity ${FADE_MS}ms cubic-bezier(0.4, 0, 0.2, 1);
}
.si-boot[data-leaving="true"] { opacity: 0; }

.si-boot::before {
  content: "";
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  background-image:
    linear-gradient(90deg, color-mix(in srgb, var(--si-ink) 5%, transparent) 1px, transparent 1px),
    linear-gradient(180deg, color-mix(in srgb, var(--si-ink) 4%, transparent) 1px, transparent 1px);
  background-size: 96px 96px, 96px 96px;
  opacity: 0.9;
}

.si-frame {
  position: absolute;
  inset: 16px;
  z-index: 0;
  border: 1px solid var(--si-line);
  pointer-events: none;
}
.si-frame::before,
.si-frame::after {
  content: "";
  position: absolute;
  width: 7px;
  height: 7px;
  background: var(--si-accent);
}
.si-frame::before { top: -4px; left: -4px; }
.si-frame::after { right: -4px; bottom: -4px; }

.si-watermark {
  position: absolute;
  right: clamp(8px, 2vw, 32px);
  bottom: clamp(34px, 7vh, 88px);
  z-index: 0;
  font-family: "Arial Narrow", "Helvetica Neue", system-ui, sans-serif;
  font-size: clamp(150px, 26vw, 360px);
  font-weight: 800;
  letter-spacing: -0.02em;
  line-height: 0.8;
  color: color-mix(in srgb, var(--si-accent) 7%, transparent);
  -webkit-text-stroke: 1px color-mix(in srgb, var(--si-accent) 20%, transparent);
  pointer-events: none;
}

.si-head {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  padding-bottom: 13px;
  border-bottom: 1px solid var(--si-line);
}
.si-head__brand {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}
.si-head__code {
  display: inline-grid;
  place-items: center;
  width: 42px;
  height: 24px;
  flex: none;
  background: var(--si-accent);
  color: var(--si-bg);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
}
.si-head__name {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.2em;
  color: var(--si-muted);
  text-transform: uppercase;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.si-head__meta {
  display: flex;
  align-items: center;
  gap: 16px;
  flex: none;
  font-size: 10px;
  letter-spacing: 0.2em;
  color: var(--si-muted);
  text-transform: uppercase;
  font-variant-numeric: tabular-nums;
}
.si-head__unit { color: var(--si-ink); opacity: 0.82; }
.si-head__archive { color: var(--si-accent); }

.si-main {
  position: relative;
  z-index: 1;
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1.32fr) minmax(0, 0.95fr);
  align-items: center;
  gap: clamp(26px, 4.6vw, 78px);
}

.si-id {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}
.si-id__mark { display: block; width: clamp(56px, 6.6vw, 82px); height: auto; }
.si-id__kicker {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 10px;
  letter-spacing: 0.3em;
  color: var(--si-muted);
  text-transform: uppercase;
}
.si-id__dash { width: 26px; height: 1px; flex: none; background: var(--si-accent); }
.si-id__title {
  margin: 0;
  font-family: "Arial Narrow", "Helvetica Neue", "PingFang SC", system-ui, sans-serif;
  font-size: clamp(34px, 4.6vw, 64px);
  font-weight: 800;
  letter-spacing: 0.04em;
  line-height: 0.94;
  color: var(--si-ink);
  text-transform: uppercase;
}
.si-id__block {
  display: inline-block;
  margin-left: 0.06em;
  padding: 0.04em 0.1em 0.08em;
  background: var(--si-accent);
  color: var(--si-bg);
}
.si-id__sub {
  font-size: clamp(10.5px, 1vw, 13px);
  letter-spacing: 0.2em;
  color: var(--si-muted);
  text-transform: uppercase;
}
.si-hazard {
  width: min(300px, 52%);
  height: 7px;
  margin-top: 4px;
  background: repeating-linear-gradient(135deg, var(--si-accent) 0 9px, var(--si-panel) 9px 18px);
}
.si-code {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 2px;
}
.si-barcode {
  display: block;
  width: 148px;
  height: 12px;
  flex: none;
  color: var(--si-muted);
  opacity: 0.7;
}
.si-code__text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 8px;
  letter-spacing: 0.24em;
  color: var(--si-muted);
  opacity: 0.7;
  text-transform: uppercase;
}

.si-log {
  display: flex;
  flex-direction: column;
  border-top: 1px solid var(--si-line);
  min-width: 0;
}
.si-log__title {
  padding: 10px 0 8px;
  font-size: 9.5px;
  letter-spacing: 0.3em;
  color: var(--si-muted);
  text-transform: uppercase;
}
.si-log__row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: baseline;
  gap: 12px;
  padding: 9px 0;
  border-bottom: 1px solid var(--si-line);
  opacity: 0.16;
  transform: translateY(3px);
  transition: opacity 240ms ease, transform 240ms ease;
}
.si-log__row[data-on="true"] { opacity: 1; transform: none; }
.si-log__t {
  font-size: 9.5px;
  letter-spacing: 0.08em;
  color: var(--si-muted);
  opacity: 0.65;
  font-variant-numeric: tabular-nums;
}
.si-log__label {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 9px;
  font-size: 10.5px;
  letter-spacing: 0.16em;
  color: var(--si-muted);
  text-transform: uppercase;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.si-log__label::before {
  content: "";
  width: 6px;
  height: 6px;
  flex: none;
  background: var(--si-line-strong);
  transition: background 240ms ease;
}
.si-log__row[data-on="true"] .si-log__label::before { background: var(--si-accent); }
.si-log__value {
  font-size: 10px;
  letter-spacing: 0.14em;
  color: var(--si-ink);
  text-transform: uppercase;
  white-space: nowrap;
}

.si-notice {
  margin-top: 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
  border: 1px solid var(--si-line);
  border-left: 2px solid var(--si-accent);
  background: var(--si-panel);
}
.si-notice__label {
  font-size: 9px;
  letter-spacing: 0.32em;
  color: var(--si-accent);
  text-transform: uppercase;
}
.si-notice__text {
  margin: 0;
  font-size: 10.5px;
  line-height: 1.7;
  letter-spacing: 0.04em;
  color: var(--si-muted);
}

.si-foot {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.si-progress {
  display: flex;
  gap: 3px;
  height: 9px;
}
.si-progress__seg { flex: 1; background: color-mix(in srgb, var(--si-line) 55%, transparent); }
.si-progress__seg[data-on="true"] { background: var(--si-accent); }
.si-foot__row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 18px;
  font-size: 10px;
  letter-spacing: 0.18em;
  color: var(--si-muted);
  text-transform: uppercase;
  font-variant-numeric: tabular-nums;
}
.si-foot__note { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.si-foot__status { color: var(--si-ink); white-space: nowrap; }
.si-foot__pct { color: var(--si-warn); white-space: nowrap; }
.si-foot__hint {
  font-size: 9.5px;
  letter-spacing: 0.22em;
  color: var(--si-muted);
  opacity: 0.62;
  text-transform: uppercase;
}
.si-blink {
  display: inline-block;
  width: 6px;
  height: 11px;
  margin-left: 7px;
  vertical-align: -1px;
  background: var(--si-accent);
  animation: si-blink 1.1s steps(1, end) infinite;
}
@keyframes si-blink {
  0%, 55% { opacity: 1; }
  56%, 100% { opacity: 0.15; }
}

/* ───────────────────────── 会话：编辑器下方的观测状态条 ───────────────────────── */
.si-dock {
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: 100%;
  padding: 3px 6px 0;
  font-family: ui-monospace, "SFMono-Regular", Menlo, Consolas, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", monospace;
  font-size: 9.5px;
  line-height: 1.5;
  letter-spacing: 0.16em;
  color: var(--dsw-alias-label-secondary);
  text-transform: uppercase;
  pointer-events: none;
}
.si-dock__stripe {
  width: 20px;
  height: 5px;
  flex: none;
  background: repeating-linear-gradient(135deg, var(--dsw-alias-brand-primary) 0 5px, transparent 5px 10px);
  opacity: 0.9;
}
.si-dock__tag {
  flex: none;
  padding: 1px 4px;
  background: var(--dsw-alias-brand-primary);
  color: var(--dsw-alias-bg-base);
  line-height: 1.35;
}
.si-dock__link {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  opacity: 0.85;
}

/* ───────────────────────── 空白会话 Hero 的 AERC 徽记 ───────────────────────── */
.si-hero-mark { display: block; }
.si-sidebar-mark { display: block; }

/* ───────────────────────── 侧栏底部：新建会话 / 工作区切换 ───────────────────────── */
.si-action {
  width: 28px;
  height: 28px;
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 2px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
}
.si-action:hover {
  border-color: var(--dsw-alias-border-l2);
  background: color-mix(in srgb, var(--dsw-alias-label-primary) 7%, transparent);
  color: var(--dsw-alias-label-primary);
}
.si-action:focus-visible {
  outline: 1px solid var(--dsw-alias-brand-primary);
  outline-offset: 1px;
}
.si-action[data-on="true"] {
  border-color: var(--dsw-alias-brand-primary);
  color: var(--dsw-alias-brand-primary);
}
.si-action svg { display: block; }

.si-ws-pop {
  position: fixed;
  z-index: 2147482500;
  width: 252px;
  max-height: 320px;
  overflow: auto;
  display: flex;
  flex-direction: column;
  padding: 6px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 2px;
  background: var(--dsw-alias-bg-overlay);
  color: var(--dsw-alias-label-primary);
  font-family: ui-monospace, "SFMono-Regular", Menlo, Consolas, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", monospace;
}
.si-ws-pop__head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 6px 8px;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
  font-size: 9px;
  letter-spacing: 0.2em;
  color: var(--dsw-alias-label-secondary);
  text-transform: uppercase;
}
.si-ws-pop__head::before {
  content: "";
  width: 14px;
  height: 4px;
  flex: none;
  background: repeating-linear-gradient(
    135deg,
    var(--dsw-alias-brand-primary) 0 4px,
    transparent 4px 8px
  );
}
.si-ws-pop__row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  margin: 0;
  padding: 8px 6px;
  border: 0;
  border-bottom: 1px solid color-mix(in srgb, var(--dsw-alias-border-l1) 60%, transparent);
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 11px;
  letter-spacing: 0.04em;
  text-align: left;
  cursor: pointer;
}
.si-ws-pop__row:last-child { border-bottom: 0; }
.si-ws-pop__row:hover { background: color-mix(in srgb, var(--dsw-alias-label-primary) 7%, transparent); }
.si-ws-pop__row[data-active="true"] { color: var(--dsw-alias-brand-primary); }
.si-ws-pop__dot {
  width: 6px;
  height: 6px;
  flex: none;
  background: var(--dsw-alias-border-l2);
}
.si-ws-pop__row[data-active="true"] .si-ws-pop__dot { background: var(--dsw-alias-brand-primary); }
.si-ws-pop__name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.si-ws-pop__path {
  margin-left: auto;
  max-width: 92px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 9px;
  color: var(--dsw-alias-label-secondary);
  opacity: 0.65;
}
.si-ws-pop__empty {
  padding: 12px 6px;
  font-size: 10px;
  letter-spacing: 0.16em;
  color: var(--dsw-alias-label-secondary);
  text-transform: uppercase;
}

/* ───────────────────────── 侧栏 chrome：品牌行 + 新建会话 + 面板导航 ───────────────────────── */
.si-sb {
  height: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  padding: 6px 12px;
  overflow: hidden;
  background: var(--dsw-specific-sidebar-fill);
  color: var(--dsw-alias-label-primary);
  font-family: ui-monospace, "SFMono-Regular", Menlo, Consolas, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", monospace;
}
.si-sb--rail {
  align-items: stretch;
  padding: 14px 10px 6px;
}
.si-sb-drag {
  height: 28px;
  flex: none;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  -webkit-app-region: drag;
}
.si-sb-drag .si-sb-icon { -webkit-app-region: no-drag; }
.si-sb-brandrow {
  height: 42px;
  flex: none;
  display: flex;
  align-items: center;
  gap: 10px;
  -webkit-app-region: drag;
}
.si-sb-brandrow .si-sb-icon {
  margin-left: auto;
  -webkit-app-region: no-drag;
}
.si-sb-markbtn {
  width: 32px;
  height: 32px;
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 2px;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
}
.si-sb-markbtn:hover { background: color-mix(in srgb, var(--dsw-alias-label-primary) 7%, transparent); }
.si-sb-mark { display: flex; flex: none; }
.si-sb-brandname { min-width: 0; overflow: hidden; }
.si-sb-brand { display: flex; flex-direction: column; line-height: 1.25; min-width: 0; }
.si-sb-brand__name {
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.16em;
  color: var(--dsw-alias-label-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.si-sb-brand__tag {
  font-size: 9px;
  letter-spacing: 0.18em;
  color: var(--dsw-alias-brand-primary);
  text-transform: uppercase;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.si-sb-icon {
  width: 28px;
  height: 28px;
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 2px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
}
.si-sb-icon:hover {
  border-color: var(--dsw-alias-border-l2);
  background: color-mix(in srgb, var(--dsw-alias-label-primary) 7%, transparent);
  color: var(--dsw-alias-label-primary);
}
.si-sb-icon:focus-visible {
  outline: 1px solid var(--dsw-alias-brand-primary);
  outline-offset: 1px;
}
.si-sb-new {
  width: 100%;
  height: 36px;
  flex: none;
  display: flex;
  align-items: center;
  gap: 9px;
  margin: 6px 0 8px;
  padding: 0 12px;
  border: 1px solid var(--dsw-alias-brand-primary);
  border-radius: 2px;
  background: color-mix(in srgb, var(--dsw-alias-brand-primary) 12%, transparent);
  color: var(--dsw-alias-brand-primary);
  font: inherit;
  font-size: 13px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  cursor: pointer;
  text-align: left;
}
.si-sb-new:hover {
  background: var(--dsw-alias-brand-primary);
  color: var(--dsw-alias-bg-base);
}
.si-sb-new:focus-visible {
  outline: 1px solid var(--dsw-alias-brand-primary);
  outline-offset: 1px;
}
.si-sb-new__label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.si-sb-new__code {
  margin-left: auto;
  flex: none;
  font-size: 9px;
  letter-spacing: 0.12em;
  opacity: 0.7;
}
.si-sb-new--rail {
  width: 28px;
  height: 28px;
  margin: 6px auto;
  padding: 0;
  justify-content: center;
  border-color: var(--dsw-alias-border-l2);
  background: transparent;
  color: var(--dsw-alias-label-secondary);
}
.si-sb-new--rail:hover {
  border-color: var(--dsw-alias-brand-primary);
  background: var(--dsw-alias-brand-primary);
  color: var(--dsw-alias-bg-base);
}
.si-sb-nav {
  display: flex;
  flex-direction: column;
  gap: 1px;
  flex: none;
  padding: 2px 0;
}
.si-sb-nav__row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  height: 34px;
  padding: 0 10px;
  border: 0;
  border-left: 2px solid transparent;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  font-size: 14px;
  letter-spacing: 0.03em;
  text-align: left;
  cursor: pointer;
}
.si-sb-nav__row:hover {
  background: color-mix(in srgb, var(--dsw-alias-label-primary) 6%, transparent);
  color: var(--dsw-alias-label-primary);
}
.si-sb-nav__row[data-on="true"] {
  border-left-color: var(--dsw-alias-brand-primary);
  background: color-mix(in srgb, var(--dsw-alias-brand-primary) 9%, transparent);
  color: var(--dsw-alias-label-primary);
}
.si-sb-nav__glyph {
  width: 18px;
  height: 18px;
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
}
.si-sb-nav__label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.si-sb-nav__fold {
  margin-left: auto;
  flex: none;
  font-size: 10px;
  color: var(--dsw-alias-label-secondary);
}
.si-sb-nav__row--group {
  color: var(--dsw-alias-label-secondary);
  font-size: 13px;
  letter-spacing: 0.08em;
}
.si-sb-nav__row--child {
  padding-left: 30px;
}
.si-sb-nav--rail {
  align-items: center;
  gap: 3px;
  padding: 2px 0;
}
.si-sb-nav--rail .si-sb-nav__row {
  width: 36px;
  height: 36px;
  padding: 0;
  justify-content: center;
  border-left: 0;
  border-right: 2px solid transparent;
}
.si-sb-nav--rail .si-sb-nav__row[data-on="true"] {
  border-right-color: var(--dsw-alias-brand-primary);
}
.si-sb-region {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.si-sb-footer-actions {
  flex: none;
  display: flex;
  align-items: center;
  gap: 2px;
  padding-top: 4px;
}
.si-sb-footer-actions--rail {
  flex-direction: column;
  align-items: center;
}
.si-sb-settings { flex: none; padding-top: 2px; }
.si-sb-spacer { flex: 1; }
.si-lead {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 8px;
}

/* 宿主 composer 主按钮（发送/停止）兜底：即使宿主在更内层重定义 token，也保持安全橙。 */
.yhfFVG_primary {
  background: var(--dsw-alias-brand-primary) !important;
  color: var(--dsw-alias-bg-base) !important;
}
.yhfFVG_primary:hover:not(:disabled) {
  background: color-mix(
    in srgb,
    var(--dsw-alias-brand-primary) 82%,
    var(--dsw-alias-label-primary)
  ) !important;
  color: var(--dsw-alias-bg-base) !important;
}

@media (max-width: 900px) {
  .si-boot { padding: 20px 20px 24px; }
  .si-main { grid-template-columns: minmax(0, 1fr); align-items: start; gap: 24px; }
  .si-log { display: none; }
  .si-head__meta { display: none; }
  .si-head__name { font-size: 10px; letter-spacing: 0.14em; }
  .si-id__sub { letter-spacing: 0.14em; }
  .si-watermark { font-size: 120px; opacity: 0.7; }
}

@media (prefers-reduced-motion: reduce) {
  .si-boot { transition-duration: 120ms; }
  .si-log__row { transition: none; transform: none; }
  .si-blink { animation: none; }
}
`

    function prefersReducedMotion() {
      try {
        return window.matchMedia('(prefers-reduced-motion: reduce)').matches
      } catch (error) {
        return false
      }
    }

    /** 页面重载后 3 秒内不重播，避免 HMR / 连续刷新时反复遮挡。 */
    function shouldPlaySplash() {
      if (splashConsumed) return false
      splashConsumed = true
      try {
        const last = Number(window.sessionStorage.getItem(SPLASH_GUARD_KEY) || '0')
        if (Number.isFinite(last) && Date.now() - last < SPLASH_GUARD_MS) return false
        window.sessionStorage.setItem(SPLASH_GUARD_KEY, String(Date.now()))
      } catch (error) {
        /* 无痕模式或存储被禁用时照常播放 */
      }
      return true
    }

    /** locale 切换时让带文案的组件重新取词。 */
    function useLocaleRevision(locale) {
      const [, setRevision] = React.useState(0)
      React.useEffect(() => {
        if (!locale || typeof locale.subscribe !== 'function') return undefined
        return locale.subscribe(() => setRevision((value) => value + 1))
      }, [locale])
    }

    /**
     * 实心钢印徽记：安全橙八角板 + 负形 D + 反应堆芯点。
     * 负形使用 bg-base，在启动画面/英雄区看起来像真镂空；
     * 放到侧边栏时则是同一枚冲压铭牌。
     */
    function Emblem({ size, className }) {
      const geometry = Number.isFinite(size) && size > 0 ? { width: size, height: size } : {}
      const cut = 'var(--dsw-alias-bg-base)'
      return h(
        'svg',
        {
          viewBox: '0 0 64 64',
          className,
          'aria-hidden': true,
          focusable: false,
          ...geometry
        },
        h('polygon', {
          points: '9,2 55,2 62,9 62,55 55,62 9,62 2,55 2,9',
          fill: 'var(--dsw-alias-brand-primary)',
          stroke: cut,
          strokeWidth: 2
        }),
        h('path', {
          d: 'M22 16 H34 A16 16 0 0 1 34 48 H22',
          fill: 'none',
          stroke: cut,
          strokeWidth: 8,
          strokeLinejoin: 'miter'
        }),
        h('circle', { cx: 35, cy: 32, r: 5.5, fill: cut }),
        h('circle', { cx: 12, cy: 12, r: 1.6, fill: cut }),
        h('circle', { cx: 52, cy: 12, r: 1.6, fill: cut }),
        h('circle', { cx: 12, cy: 52, r: 1.6, fill: cut }),
        h('circle', { cx: 52, cy: 52, r: 1.6, fill: cut })
      )
    }

    /** 技术条码：启动画面左栏的档案标记。 */
    const BAR_PATTERN = [
      2, 1, 1, 3, 1, 1, 2, 2, 1, 4, 1, 2, 1, 1, 3, 1, 1, 2, 4, 1, 2, 1, 1, 3, 1, 2, 2, 1, 1, 4, 1, 1, 2, 3, 1, 2, 1, 1
    ]

    function Barcode() {
      let cursor = 0
      const bars = []
      BAR_PATTERN.forEach((width, index) => {
        if (index % 2 === 0) {
          bars.push(h('rect', { key: index, x: cursor, y: 0, width, height: 18, fill: 'currentColor' }))
        }
        cursor += width
      })
      return h(
        'svg',
        {
          className: 'si-barcode',
          viewBox: '0 0 ' + cursor + ' 18',
          preserveAspectRatio: 'none',
          'aria-hidden': true,
          focusable: false
        },
        bars
      )
    }

    /** 侧边栏品牌位：用 AERC 铭牌替换默认品牌图标。 */
    function SidebarMark({ size }) {
      return h(Emblem, {
        size: Number.isFinite(size) ? size : 24,
        className: 'si-sidebar-mark'
      })
    }

    /** 左侧菜单 · 插件：模块机架，三个槽位带安全橙指示灯。 */
    function PluginsNavIcon({ size, active }) {
      const edge = Number.isFinite(size) ? size : 18
      const ledOpacity = active ? 1 : 0.55
      return h(
        'svg',
        {
          viewBox: '0 0 24 24',
          width: edge,
          height: edge,
          fill: 'none',
          'aria-hidden': true,
          focusable: false
        },
        h('rect', { x: 4.5, y: 3.5, width: 15, height: 17, stroke: 'currentColor', strokeWidth: 1.5 }),
        h('path', { d: 'M4.5 9h15M4.5 15h15', stroke: 'currentColor', strokeWidth: 1.5 }),
        h('rect', {
          x: 15.5,
          y: 5.6,
          width: 2,
          height: 2,
          fill: 'var(--dsw-alias-brand-primary)',
          fillOpacity: ledOpacity
        }),
        h('rect', {
          x: 15.5,
          y: 11.6,
          width: 2,
          height: 2,
          fill: 'var(--dsw-alias-brand-primary)',
          fillOpacity: ledOpacity
        }),
        h('rect', {
          x: 15.5,
          y: 17.6,
          width: 2,
          height: 2,
          fill: 'var(--dsw-alias-brand-primary)',
          fillOpacity: ledOpacity
        }),
        h('path', { d: 'M8 20.5v2M16 20.5v2', stroke: 'currentColor', strokeWidth: 1.5 })
      )
    }

    /** 左侧菜单 · 定时任务：工业计时器，中心轴为安全橙。 */
    function SchedulesNavIcon({ size, active }) {
      const edge = Number.isFinite(size) ? size : 18
      const accentOpacity = active ? 1 : 0.6
      return h(
        'svg',
        {
          viewBox: '0 0 24 24',
          width: edge,
          height: edge,
          fill: 'none',
          'aria-hidden': true,
          focusable: false
        },
        h('circle', { cx: 12, cy: 12.5, r: 7.5, stroke: 'currentColor', strokeWidth: 1.5 }),
        h('path', { d: 'M10 2.5h4M12 2.5v1.6', stroke: 'currentColor', strokeWidth: 1.5 }),
        h('path', {
          d: 'M12 5v2.2M19.5 12.5h-2.2M12 20v-2.2M4.5 12.5h2.2',
          stroke: 'currentColor',
          strokeWidth: 1.5
        }),
        h('path', {
          d: 'M12 12.5V8.6M12 12.5l2.8 1.8',
          stroke: 'currentColor',
          strokeWidth: 1.5,
          strokeLinecap: 'square'
        }),
        h('circle', {
          cx: 12,
          cy: 12.5,
          r: 1.3,
          fill: 'var(--dsw-alias-brand-primary)',
          fillOpacity: accentOpacity
        })
      )
    }

    /** 侧栏底部：新建会话。 */
    function NewSessionAction({ t, startSession }) {
      return h(
        'button',
        {
          type: 'button',
          className: 'si-action',
          title: t('action.newSession'),
          'aria-label': t('action.newSession'),
          onClick: () => startSession()
        },
        h(
          'svg',
          { viewBox: '0 0 24 24', width: 18, height: 18, fill: 'none', 'aria-hidden': true, focusable: false },
          h('path', {
            d: 'M6 3.5h8l4 4v13H6z',
            stroke: 'currentColor',
            strokeWidth: 1.5,
            strokeLinejoin: 'miter'
          }),
          h('path', { d: 'M14 3.5v4h4', stroke: 'currentColor', strokeWidth: 1.5 }),
          h('path', {
            d: 'M12 11v6M9 14h6',
            stroke: 'var(--dsw-alias-brand-primary)',
            strokeWidth: 1.8
          })
        )
      )
    }

    /** 从 useWorkspaces 快照里取工作区列表，兼容几种 store 形状。 */
    function readWorkspaces(snapshot) {
      if (!snapshot || typeof snapshot !== 'object') return []
      if (Array.isArray(snapshot.workspaces)) return snapshot.workspaces
      if (snapshot.byId && typeof snapshot.byId === 'object') {
        const ids = Array.isArray(snapshot.ids) ? snapshot.ids : Object.keys(snapshot.byId)
        const list = ids.map((id) => snapshot.byId[id]).filter(Boolean)
        if (list.length > 0) return list
      }
      return Array.isArray(snapshot) ? snapshot : []
    }

    /** 侧栏底部：工作区切换。 */
    function WorkspaceAction({ t, useWorkspaces, openWorkspace }) {
      const snapshot = useWorkspaces((value) => value)
      const workspaces = readWorkspaces(snapshot)
      const currentId =
        snapshot?.activeWorkspaceId ??
        snapshot?.activeId ??
        snapshot?.selectedWorkspaceId ??
        snapshot?.selectedId ??
        snapshot?.currentWorkspaceId ??
        null
      const [open, setOpen] = React.useState(false)
      const [placement, setPlacement] = React.useState(null)
      const buttonRef = React.useRef(null)
      const popRef = React.useRef(null)

      React.useEffect(() => {
        if (!open) return undefined
        const onPointerDown = (event) => {
          if (buttonRef.current?.contains(event.target)) return
          if (popRef.current?.contains(event.target)) return
          setOpen(false)
        }
        const onKeyDown = (event) => {
          if (event.key === 'Escape') setOpen(false)
        }
        document.addEventListener('pointerdown', onPointerDown)
        document.addEventListener('keydown', onKeyDown)
        return () => {
          document.removeEventListener('pointerdown', onPointerDown)
          document.removeEventListener('keydown', onKeyDown)
        }
      }, [open])

      const toggle = () => {
        if (open) {
          setOpen(false)
          return
        }
        const rect = buttonRef.current?.getBoundingClientRect()
        if (rect) setPlacement({ left: rect.left, bottom: window.innerHeight - rect.top + 6 })
        setOpen(true)
      }

      return h(
        React.Fragment,
        null,
        h(
          'button',
          {
            ref: buttonRef,
            type: 'button',
            className: 'si-action',
            'data-on': open ? 'true' : 'false',
            title: t('action.workspace'),
            'aria-label': t('action.workspace'),
            'aria-expanded': open ? 'true' : 'false',
            onClick: toggle
          },
          h(
            'svg',
            { viewBox: '0 0 24 24', width: 18, height: 18, fill: 'none', 'aria-hidden': true, focusable: false },
            h('path', {
              d: 'M12 3.5l8 4-8 4-8-4z',
              stroke: 'currentColor',
              strokeWidth: 1.5,
              strokeLinejoin: 'miter'
            }),
            h('path', {
              d: 'M4 12l8 4 8-4M4 16.5l8 4 8-4',
              stroke: 'currentColor',
              strokeWidth: 1.5,
              strokeLinejoin: 'miter'
            }),
            h('rect', {
              x: 10.8,
              y: 10.8,
              width: 2.4,
              height: 2.4,
              fill: 'var(--dsw-alias-brand-primary)'
            })
          )
        ),
        open && placement
          ? h(
              'div',
              {
                ref: popRef,
                className: 'si-ws-pop',
                style: { left: placement.left + 'px', bottom: placement.bottom + 'px' },
                role: 'menu'
              },
              h('div', { className: 'si-ws-pop__head' }, t('workspace.registry')),
              workspaces.length === 0
                ? h('div', { className: 'si-ws-pop__empty' }, t('workspace.empty'))
                : workspaces.map((workspace, index) => {
                    const id = workspace.workspaceId ?? workspace.id ?? workspace.path ?? 'workspace-' + index
                    const title = workspace.title ?? workspace.path ?? String(id)
                    return h(
                      'button',
                      {
                        key: String(id),
                        type: 'button',
                        role: 'menuitem',
                        className: 'si-ws-pop__row',
                        'data-active': String(id) === String(currentId) ? 'true' : 'false',
                        onClick: () => {
                          openWorkspace(id)
                          setOpen(false)
                        }
                      },
                      h('span', { className: 'si-ws-pop__dot', 'aria-hidden': true }),
                      h('span', { className: 'si-ws-pop__name' }, title),
                      workspace.path
                        ? h('span', { className: 'si-ws-pop__path' }, workspace.path)
                        : null
                    )
                  })
            )
          : null
      )
    }

    /** SDD 阶段/组图标，沿用原插件的 20px 线性字形。 */
    function SddGlyph({ kind, size }) {
      const edge = Number.isFinite(size) ? size : 18
      const html = kind === SDD_GROUP_ID ? SDD_GROUP_PATH : SDD_ICON_PATHS[kind] || ''
      return h('svg', {
        viewBox: '0 0 20 20',
        width: edge,
        height: edge,
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.5,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': true,
        focusable: false,
        dangerouslySetInnerHTML: { __html: html }
      })
    }

    /** 侧栏品牌行：产品名 + AERC 编号。 */
    function BrandWordmark() {
      return h(
        'span',
        { className: 'si-sb-brand' },
        h('span', { className: 'si-sb-brand__name' }, 'DEEPSEEK'),
        h('span', { className: 'si-sb-brand__tag' }, 'HARNESS / AERC-07')
      )
    }

    /** 侧栏折叠/展开图标。 */
    function PanelLeftGlyph({ size }) {
      const edge = Number.isFinite(size) ? size : 16
      return h(
        'svg',
        { viewBox: '0 0 24 24', width: edge, height: edge, fill: 'none', 'aria-hidden': true, focusable: false },
        h('rect', { x: 3.5, y: 4.5, width: 17, height: 15, stroke: 'currentColor', strokeWidth: 1.5 }),
        h('path', { d: 'M9 4.5v15', stroke: 'currentColor', strokeWidth: 1.5 }),
        h('path', {
          d: 'M5.5 8h1.5M5.5 12h1.5M5.5 16h1.5',
          stroke: 'var(--dsw-alias-brand-primary)',
          strokeWidth: 1.5
        })
      )
    }

    /** 新建会话图标。 */
    function NewSessionGlyph({ size }) {
      const edge = Number.isFinite(size) ? size : 16
      return h(
        'svg',
        { viewBox: '0 0 24 24', width: edge, height: edge, fill: 'none', 'aria-hidden': true, focusable: false },
        h('path', {
          d: 'M6 3.5h8l4 4v13H6z',
          stroke: 'currentColor',
          strokeWidth: 1.5,
          strokeLinejoin: 'miter'
        }),
        h('path', { d: 'M14 3.5v4h4', stroke: 'currentColor', strokeWidth: 1.5 }),
        h('path', {
          d: 'M12 11v6M9 14h6',
          stroke: 'var(--dsw-alias-brand-primary)',
          strokeWidth: 1.8
        })
      )
    }

    /**
     * 侧栏 chrome 接管：品牌行、新建会话、面板导航、工作区浏览器子槽和页脚。
     * 工作区浏览器、设置面板仍由原注册者渲染，这里只接管外壳。
     */
    function ThemedSidebar({
      collapsed,
      renderSlot,
      usePanelInfo,
      usePanels,
      startSession,
      toggleSidebar,
      selectPanel,
      t
    }) {
      const panels = usePanels()
      const activePanelId = usePanelInfo((info) => info.activePanelId)
      const [sddCollapsed, setSddCollapsed] = React.useState(false)
      const wide = !collapsed
      const isMac =
        typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform || navigator.userAgent)
      const mark = h(
        'span',
        { className: 'si-sb-mark' },
        renderSlot('sidebar.brand.mark', { size: 24 }, { fallback: h(Emblem, { size: 24 }) })
      )
      const brandName = renderSlot('sidebar.brand.name', {}, { fallback: h(BrandWordmark) })
      const toggle = h(
        'button',
        {
          type: 'button',
          className: 'si-sb-icon',
          title: collapsed ? t('sidebar.open') : t('sidebar.collapse'),
          'aria-label': collapsed ? t('sidebar.open') : t('sidebar.collapse'),
          onClick: () => toggleSidebar()
        },
        h(PanelLeftGlyph, { size: 16 })
      )
      const newSession = h(
        'button',
        {
          type: 'button',
          className: wide ? 'si-sb-new' : 'si-sb-new si-sb-new--rail',
          title: t('action.newSession'),
          'aria-label': t('action.newSession'),
          onClick: () => startSession()
        },
        h(NewSessionGlyph, { size: wide ? 16 : 18 }),
        wide ? h('span', { className: 'si-sb-new__label' }, t('action.newSession')) : null,
        wide ? h('span', { className: 'si-sb-new__code' }, 'N-07') : null
      )
      const nav = (rail) => {
        const items = []
        let groupAdded = false
        for (const panel of panels) {
          if (panel.id === SDD_GROUP_ID) {
            if (!rail) {
              items.push({ kind: 'group' })
              groupAdded = true
            }
            continue
          }
          if (SDD_CHILD_IDS.has(panel.id)) {
            if (!rail && !groupAdded) {
              items.push({ kind: 'group' })
              groupAdded = true
            }
            if (!rail && sddCollapsed) continue
            items.push({ kind: 'panel', panel, child: !rail && groupAdded })
            continue
          }
          items.push({ kind: 'panel', panel, child: false })
        }
        return h(
          'nav',
          {
            className: rail ? 'si-sb-nav si-sb-nav--rail' : 'si-sb-nav',
            'aria-label': t('sidebar.panels')
          },
          items.map((item) => {
            if (item.kind === 'group') {
              return h(
                'button',
                {
                  key: 'sdd-group',
                  type: 'button',
                  className: 'si-sb-nav__row si-sb-nav__row--group',
                  title: SDD_GROUP_LABEL,
                  'aria-label': SDD_GROUP_LABEL,
                  'aria-expanded': 'true',
                  onClick: () => {
                    setSddCollapsed(false)
                    selectPanel('dashboard')
                  }
                },
                h(
                  'span',
                  { className: 'si-sb-nav__glyph' },
                  h(SddGlyph, { kind: SDD_GROUP_ID, size: 16 })
                ),
                h('span', { className: 'si-sb-nav__label' }, SDD_GROUP_LABEL),
                h(
                  'span',
                  { className: 'si-sb-nav__fold', 'aria-hidden': true },
                  sddCollapsed ? '▸' : '▾'
                )
              )
            }
            const panel = item.panel
            return h(
              'button',
              {
                key: panel.id,
                type: 'button',
                className: 'si-sb-nav__row' + (item.child ? ' si-sb-nav__row--child' : ''),
                'data-on': panel.id === activePanelId ? 'true' : 'false',
                title: panel.label,
                'aria-label': panel.label,
                'aria-current': panel.id === activePanelId ? 'page' : undefined,
                onClick: () => selectPanel(panel.id)
              },
              h(
                'span',
                { className: 'si-sb-nav__glyph' },
                renderSlot(
                  'sidebar.panellist',
                  { size: rail ? 18 : 16, active: panel.id === activePanelId },
                  { only: panel.id }
                )
              ),
              rail ? null : h('span', { className: 'si-sb-nav__label' }, panel.label)
            )
          })
        )
      }

      if (!wide) {
        return h(
          'div',
          { className: 'si-sb si-sb--rail' },
          isMac ? h('div', { className: 'si-sb-drag', 'data-window-drag': true }) : null,
          h(
            'button',
            {
              type: 'button',
              className: 'si-sb-markbtn',
              title: t('sidebar.open'),
              'aria-label': t('sidebar.open'),
              onClick: () => toggleSidebar()
            },
            mark
          ),
          newSession,
          nav(true),
          h('span', { className: 'si-sb-spacer' }),
          h(
            'div',
            { className: 'si-sb-footer-actions si-sb-footer-actions--rail' },
            renderSlot('sidebar.footer.action', { wide: false })
          ),
          h('div', { className: 'si-sb-settings' }, renderSlot('sidebar.settings', { wide: false }))
        )
      }

      return h(
        'div',
        { className: 'si-sb' },
        isMac ? h('div', { className: 'si-sb-drag', 'data-window-drag': true }, toggle) : null,
        h(
          'div',
          { className: 'si-sb-brandrow', 'data-window-drag': true },
          mark,
          h('span', { className: 'si-sb-brandname' }, brandName),
          isMac ? null : toggle
        ),
        newSession,
        panels.length > 0 ? nav(false) : null,
        h(
          'div',
          { className: 'si-sb-region' },
          renderSlot('sidebar.workspaces', { wide: true, expandSidebar: () => {} })
        ),
        h(
          'div',
          { className: 'si-sb-footer-actions' },
          renderSlot('sidebar.footer.action', { wide: true })
        ),
        h('div', { className: 'si-sb-settings' }, renderSlot('sidebar.settings', { wide: true }))
      )
    }

    /** 侧栏完全隐藏时，窗口左上角的主题化开关 + 新建会话。 */
    function LeadingControls({ startSession, toggleSidebar, t }) {
      return h(
        'div',
        { className: 'si-lead' },
        h(
          'button',
          {
            type: 'button',
            className: 'si-sb-icon',
            title: t('sidebar.open'),
            'aria-label': t('sidebar.open'),
            onClick: () => toggleSidebar()
          },
          h(PanelLeftGlyph, { size: 16 })
        ),
        h(
          'button',
          {
            type: 'button',
            className: 'si-sb-icon',
            title: t('action.newSession'),
            'aria-label': t('action.newSession'),
            onClick: () => startSession()
          },
          h(NewSessionGlyph, { size: 16 })
        )
      )
    }

    /** 常驻机架：窗框 + 琥珀角标 + 车间网格，与启动画面同一套结构语言。 */
    function Chassis() {
      return h(
        'div',
        { className: 'si-chassis', 'aria-hidden': true },
        h('div', { className: 'si-chassis__texture' }),
        h('div', { className: 'si-chassis__frame' }),
        h('span', { className: 'si-chassis__corner si-chassis__corner--tl' }),
        h('span', { className: 'si-chassis__corner si-chassis__corner--tr' }),
        h('span', { className: 'si-chassis__corner si-chassis__corner--bl' }),
        h('span', { className: 'si-chassis__corner si-chassis__corner--br' })
      )
    }

    /** 编辑器下方的一行机构状态，对应启动画面底部的观测链路。 */
    function DockStatus({ t, locale }) {
      useLocaleRevision(locale)
      return h(
        'div',
        { className: 'si-dock' },
        h('span', { className: 'si-dock__stripe', 'aria-hidden': true }),
        h('span', { className: 'si-dock__tag' }, 'AERC-07'),
        h('span', { className: 'si-dock__link' }, t('dock.link'))
      )
    }

    /** 空白会话 Hero 上的徽记，由会话层给出 size。 */
    function HeroMark({ size, className }) {
      return h(Emblem, {
        size: Number.isFinite(size) ? size : 56,
        className: [className, 'si-hero-mark'].filter(Boolean).join(' ')
      })
    }

    function Splash({ t, onFinish }) {
      const reduced = prefersReducedMotion()
      const [progress, setProgress] = React.useState(0)
      const [leaving, setLeaving] = React.useState(false)
      const [done, setDone] = React.useState(false)

      React.useEffect(() => {
        if (leaving) return undefined
        let frame = 0
        let start = 0
        const total = reduced ? 800 : SPLASH_MS
        const step = (now) => {
          if (!start) start = now
          const next = Math.min(1, (now - start) / total)
          setProgress(next)
          if (next < 1) {
            frame = window.requestAnimationFrame(step)
          } else {
            setLeaving(true)
          }
        }
        frame = window.requestAnimationFrame(step)
        return () => window.cancelAnimationFrame(frame)
      }, [leaving, reduced])

      React.useEffect(() => {
        if (!leaving) return undefined
        if (reduced) {
          setDone(true)
          return undefined
        }
        const timer = window.setTimeout(() => setDone(true), FADE_MS)
        return () => window.clearTimeout(timer)
      }, [leaving, reduced])

      React.useEffect(() => {
        if (done) onFinish()
      }, [done, onFinish])

      React.useEffect(() => {
        const onKeyDown = (event) => {
          if (event.key === 'Escape' || event.key === 'Enter' || event.key === ' ') setLeaving(true)
        }
        window.addEventListener('keydown', onKeyDown)
        return () => window.removeEventListener('keydown', onKeyDown)
      }, [])

      const pct = Math.round(progress * 100)
      const ready = progress >= 0.9
      const segments = []
      for (let index = 0; index < SEGMENT_COUNT; index += 1) {
        segments.push(
          h('span', {
            key: index,
            className: 'si-progress__seg',
            'data-on': (index + 1) / SEGMENT_COUNT <= progress ? 'true' : 'false'
          })
        )
      }

      return h(
        'div',
        {
          className: 'si-boot',
          'data-leaving': leaving ? 'true' : 'false',
          role: 'presentation',
          onClick: () => setLeaving(true)
        },
        h('div', { className: 'si-frame', 'aria-hidden': true }),
        h('span', { className: 'si-watermark', 'aria-hidden': true }, '07'),

        h(
          'header',
          { className: 'si-head' },
          h(
            'div',
            { className: 'si-head__brand' },
            h('span', { className: 'si-head__code' }, 'AERC'),
            h('span', { className: 'si-head__name' }, t('meta.system'))
          ),
          h(
            'div',
            { className: 'si-head__meta' },
            h('span', { className: 'si-head__unit' }, t('meta.unit')),
            h('span', { className: 'si-head__archive' }, t('meta.archive'))
          )
        ),

        h(
          'main',
          { className: 'si-main' },
          h(
            'section',
            { className: 'si-id' },
            h(Emblem, { className: 'si-id__mark' }),
            h(
              'div',
              { className: 'si-id__kicker' },
              h('span', { className: 'si-id__dash' }),
              t('boot.kicker')
            ),
            h(
              'h1',
              { className: 'si-id__title' },
              t('boot.titleLead')
                ? h('span', { className: 'si-id__word' }, t('boot.titleLead'))
                : null,
              h('span', { className: 'si-id__block' }, t('boot.titleBlock'))
            ),
            h('div', { className: 'si-id__sub' }, t('boot.subtitle')),
            h('div', { className: 'si-hazard', 'aria-hidden': true }),
            h(
              'div',
              { className: 'si-code' },
              h(Barcode),
              h('span', { className: 'si-code__text' }, 'AERC-07 / 0417 / INTERNAL')
            )
          ),
          h(
            'section',
            { className: 'si-log', 'aria-hidden': true },
            h('div', { className: 'si-log__title' }, t('boot.sequence')),
            LOG_STEPS.map((item, index) =>
              h(
                'div',
                {
                  key: index,
                  className: 'si-log__row',
                  'data-on': progress >= item.at ? 'true' : 'false'
                },
                h('span', { className: 'si-log__t' }, item.t),
                h('span', { className: 'si-log__label' }, t(item.label)),
                h('span', { className: 'si-log__value' }, t(item.value))
              )
            ),
            h(
              'div',
              { className: 'si-notice' },
              h('span', { className: 'si-notice__label' }, t('boot.noticeLabel')),
              h('p', { className: 'si-notice__text' }, t('boot.notice'))
            )
          )
        ),

        h(
          'footer',
          { className: 'si-foot' },
          h('div', { className: 'si-progress', 'aria-hidden': true }, segments),
          h(
            'div',
            { className: 'si-foot__row' },
            h('span', { className: 'si-foot__note' }, t('boot.footNote')),
            h(
              'span',
              { className: 'si-foot__status' },
              ready ? t('boot.status.ready') : t('boot.status.booting'),
              ready ? null : h('span', { className: 'si-blink', 'aria-hidden': true })
            ),
            h('span', { className: 'si-foot__pct' }, String(pct).padStart(3, '0') + '%')
          ),
          h('div', { className: 'si-foot__hint' }, t('boot.skip'))
        )
      )
    }

    function Overlay({ t, locale }) {
      useLocaleRevision(locale)
      const [mounted, setMounted] = React.useState(playSplashOnLoad)
      const finish = React.useCallback(() => setMounted(false), [])
      if (!mounted) return null
      return h(Splash, { t, onFinish: finish })
    }

    function apply(ctx) {
      ctx.effect(() => {
        if (typeof document === 'undefined' || !document.head) return undefined
        const node = document.createElement('style')
        node.id = STYLE_ID
        node.textContent = CSS
        document.head.appendChild(node)
        return () => node.remove()
      })

      ctx.effect(() => {
        try {
          return ctx.theme.overrideTokens(NS, TOKENS)
        } catch (error) {
          console.error('[dsh-scifi-industrial] 主题色层注册失败：', error)
          return undefined
        }
      })

      /* 宿主还有一批 specific / alias 扩展 token（输入框、气泡、菜单、悬浮态）不在 14 个覆盖面里。
         这里在根节点把它们映射到本主题的 token；引用会随明暗切换自动重算。 */
      const EXTRA_ROOT_TOKENS = {
        '--dsw-specific-input-major': 'var(--dsw-alias-bg-layer-1)',
        '--dsw-specific-bubble': 'var(--dsw-alias-bg-layer-1)',
        '--dsw-specific-bubble-highlight': 'var(--dsw-alias-bg-layer-2)',
        '--dsw-specific-menu': 'var(--dsw-alias-bg-overlay)',
        '--dsw-specific-selector': 'var(--dsw-alias-bg-layer-1)',
        '--dsw-specific-tip': 'var(--dsw-alias-bg-overlay)',
        '--dsw-specific-login-input': 'var(--dsw-alias-bg-layer-1)',
        '--dsw-specific-sidebar-nav-item-active':
          'color-mix(in srgb, var(--dsw-alias-brand-primary) 14%, transparent)',
        '--dsw-specific-sidebar-nav-item-active-accent': 'var(--dsw-alias-brand-primary)',
        '--dsw-specific-sidebar-nav-item-hover':
          'color-mix(in srgb, var(--dsw-alias-label-primary) 7%, transparent)',
        '--dsw-alias-bg-module-platform': 'var(--dsw-alias-bg-layer-1)',
        '--dsw-alias-border-l2-darkmode-thin': 'var(--dsw-alias-border-l2)',
        '--dsw-alias-border-l3': 'var(--dsw-alias-border-l1)',
        '--dsw-alias-border-l4': 'var(--dsw-alias-border-l2)',
        '--dsw-alias-label-tertiary': 'var(--dsw-alias-label-secondary)',
        '--dsw-alias-label-dimmed':
          'color-mix(in srgb, var(--dsw-alias-label-secondary) 72%, transparent)',
        '--dsw-alias-label-caption': 'var(--dsw-alias-label-secondary)',
        '--dsw-alias-interactive-bg-hover':
          'color-mix(in srgb, var(--dsw-alias-label-primary) 7%, transparent)',
        '--dsw-alias-interactive-bg-hover-solid': 'var(--dsw-alias-bg-layer-2)',
        '--dsw-alias-button-floating-fill': 'var(--dsw-alias-bg-overlay)',
        '--dsw-alias-button-floating-hover': 'var(--dsw-alias-bg-layer-2)',
        '--dsw-alias-menu-icon': 'var(--dsw-alias-label-secondary)',
        '--dsw-alias-scrollbar-bg-l2': 'var(--dsw-alias-border-l1)',
        '--dsw-alias-scrollbar-hover-l2': 'var(--dsw-alias-border-l2)',
        '--dsw-alias-button-info-fill': 'var(--dsw-alias-brand-primary)',
        '--dsw-alias-button-info-hover':
          'color-mix(in srgb, var(--dsw-alias-brand-primary) 82%, var(--dsw-alias-label-primary))',
        '--dsw-alias-button-primary-fill': 'var(--dsw-alias-brand-primary)',
        '--dsw-alias-button-primary-hover':
          'color-mix(in srgb, var(--dsw-alias-brand-primary) 82%, var(--dsw-alias-label-primary))',
        '--dsw-alias-button-primary-dimmed':
          'color-mix(in srgb, var(--dsw-alias-brand-primary) 45%, var(--dsw-alias-bg-base))',
        '--dsw-alias-button-elevated-fill': 'var(--dsw-alias-bg-layer-2)',
        '--dsw-alias-button-ghost-active-fill':
          'color-mix(in srgb, var(--dsw-alias-brand-primary) 14%, transparent)',
        '--dsw-alias-button-ghost-active-border': 'var(--dsw-alias-brand-primary)',
        '--dsw-alias-button-ghost-active-hover':
          'color-mix(in srgb, var(--dsw-alias-brand-primary) 20%, transparent)',
        '--dsw-alias-button-tool-bar-fill': 'transparent',
        '--dsw-alias-button-tool-bar-fill-invisible': 'transparent',
        '--dsw-alias-button-tool-bar-hover':
          'color-mix(in srgb, var(--dsw-alias-label-primary) 7%, transparent)',
        '--dsw-alias-label-primary-foreground': 'var(--dsw-alias-bg-base)',
        '--dsw-alias-state-warn-secondary':
          'color-mix(in srgb, var(--dsw-alias-state-warn-primary) 28%, var(--dsw-alias-border-l2))',
        '--dsw-alias-state-warn-tertiary':
          'color-mix(in srgb, var(--dsw-alias-state-warn-primary) 12%, transparent)',
        '--dsw-alias-state-warn-label': 'var(--dsw-alias-state-warn-primary)'
      }
      ctx.effect(() => {
        if (typeof document === 'undefined') return undefined
        const carriers = [document.documentElement, document.body].filter(Boolean)
        const entries = Object.entries(EXTRA_ROOT_TOKENS)
        const saved = []
        for (const carrier of carriers) {
          for (const [name] of entries) {
            saved.push([
              carrier,
              name,
              carrier.style.getPropertyValue(name),
              carrier.style.getPropertyPriority(name)
            ])
          }
        }
        const applyExtra = () => {
          for (const carrier of carriers) {
            for (const [name, value] of entries) carrier.style.setProperty(name, value)
          }
        }
        applyExtra()
        const off = typeof ctx.on === 'function' ? ctx.on('theme/change', applyExtra) : undefined
        return () => {
          if (off) off()
          for (const [carrier, name, value, priority] of saved) {
            if (value) carrier.style.setProperty(name, value, priority)
            else carrier.style.removeProperty(name)
          }
        }
      })

      let t = (key) => DICT.zh[key] || DICT.en[key] || key
      ctx.effect(() => {
        try {
          const offZh = ctx.locale.register(NS, 'zh', DICT.zh)
          const offEn = ctx.locale.register(NS, 'en', DICT.en)
          t = ctx.locale.bind(NS)
          return () => {
            t = (key) => DICT.zh[key] || DICT.en[key] || key
            offZh()
            offEn()
          }
        } catch (error) {
          console.error('[dsh-scifi-industrial] 文案注册失败，退回内置字典：', error)
          return undefined
        }
      })

      /* 常驻机架：放在 overlay 队列最前，不遮挡 toast。 */
      ctx.effect(() =>
        ctx.slots.inject('shell.overlay', () =>
          ctx.slots.register(
            { name: 'shell.overlay', id: 'scifi-industrial-chassis', order: -10 },
            Chassis
          )
        )
      )

      /* 启动序列：overlay 队列最后，覆盖机架与 toast。 */
      const SplashSeat = () => h(Overlay, { t, locale: ctx.locale })
      ctx.effect(() =>
        ctx.slots.inject('shell.overlay', () =>
          ctx.slots.register(
            { name: 'shell.overlay', id: 'scifi-industrial-splash', order: 90 },
            SplashSeat
          )
        )
      )

      /* 编辑器下方的机构状态条。 */
      const DockSeat = () => h(DockStatus, { t, locale: ctx.locale })
      ctx.effect(() =>
        ctx.slots.inject('conversation.composer.dock', () =>
          ctx.slots.register(
            { name: 'conversation.composer.dock', id: 'scifi-industrial-status', order: 10 },
            DockSeat
          )
        )
      )

      /* 侧边栏品牌位：AERC 冲压铭牌。单槽按 priority 升序取首个，-10 覆盖默认图标。 */
      ctx.effect(() =>
        ctx.slots.inject('sidebar.brand.mark', () =>
          ctx.slots.register({ name: 'sidebar.brand.mark', priority: -10 }, SidebarMark)
        )
      )

      /* 左侧菜单：替换 Harness 自带的插件/定时任务图标（同 id，低 priority 取得占用权）。 */
      ctx.effect(() =>
        ctx.slots.inject('sidebar.panellist', () =>
          ctx.slots.register(
            {
              name: 'sidebar.panellist',
              id: 'plugins',
              order: 0,
              priority: -10,
              label: () => t('nav.plugins')
            },
            PluginsNavIcon
          )
        )
      )

      ctx.effect(() =>
        ctx.slots.inject('sidebar.panellist', () =>
          ctx.slots.register(
            {
              name: 'sidebar.panellist',
              id: 'schedules',
              order: 10,
              priority: -10,
              label: () => t('nav.schedules')
            },
            SchedulesNavIcon
          )
        )
      )

      /* SDD 七阶段 + 项目开发组：原插件直接注册，chrome 换槽后重挂图标。 */
      SDD_PANELS.forEach((panel) => {
        const SddSeat = (props) => h(SddGlyph, { ...props, kind: panel.id })
        ctx.effect(() =>
          ctx.slots.inject('sidebar.panellist', () =>
            ctx.slots.register(
              {
                name: 'sidebar.panellist',
                id: panel.id,
                order: panel.order,
                priority: -10,
                label: () => panel.label
              },
              SddSeat
            )
          )
        )
      })
      const SddGroupSeat = (props) => h(SddGlyph, { ...props, kind: SDD_GROUP_ID })
      ctx.effect(() =>
        ctx.slots.inject('sidebar.panellist', () =>
          ctx.slots.register(
            {
              name: 'sidebar.panellist',
              id: SDD_GROUP_ID,
              order: 0.5,
              priority: -10,
              label: () => SDD_GROUP_LABEL
            },
            SddGroupSeat
          )
        )
      )

      /* 侧栏底部：工作区切换（新建会话在侧栏 chrome 顶部）。 */
      const uiWorkspace = ctx.get('uiWorkspace')
      if (uiWorkspace && typeof uiWorkspace.startSession === 'function') {
        const WorkspaceSeat = (props) =>
          h(WorkspaceAction, {
            ...props,
            t,
            openWorkspace: (id) => uiWorkspace.openWorkspace(id)
          })
        ctx.effect(() =>
          ctx.slots.inject('sidebar.footer.action', () =>
            ctx.slots.register(
              {
                name: 'sidebar.footer.action',
                id: 'scifi-industrial-workspace',
                order: -10,
                label: () => t('action.workspace')
              },
              WorkspaceSeat
            )
          )
        )
        const ToolbarWorkspaceSeat = (props) =>
          h(WorkspaceAction, {
            ...props,
            t,
            openWorkspace: (id) => uiWorkspace.openWorkspace(id)
          })
        ctx.effect(() =>
          ctx.slots.inject('conversation.input.right', () =>
            ctx.slots.register(
              {
                name: 'conversation.input.right',
                id: 'scifi-industrial-workspace',
                order: -10,
                label: () => t('action.workspace')
              },
              ToolbarWorkspaceSeat
            )
          )
        )
      }

      /* 侧栏 chrome 接管：仅在宿主 ui-sidebar 被禁用时注册，避免子座冲突。 */
      const hostSidebarActive = ctx.slots
        .entriesOfSlot('sidebar')
        .some((entry) => (typeof ctx.slots.isLive === 'function' ? ctx.slots.isLive(entry) : true))
      if (!hostSidebarActive) {
        let panelValue = []
        const panelListeners = new Set()
        const getPanels = () => panelValue
        const setPanels = (next) => {
          panelValue = next
          panelListeners.forEach((listener) => listener())
        }
        const subscribePanels = (listener) => {
          panelListeners.add(listener)
          return () => panelListeners.delete(listener)
        }
        const syncPanels = () => {
          try {
            const entries = ctx.slots.entriesOfSlot('sidebar.panellist')
            const byId = new Map()
            for (const entry of entries) {
              if (typeof ctx.slots.isLive === 'function' && !ctx.slots.isLive(entry)) continue
              const id = entry.options && entry.options.id
              if (!id) continue
              const labelOption = entry.options.label
              const label = typeof labelOption === 'function' ? labelOption() : labelOption
              byId.set(id, {
                id,
                order: (entry.options && entry.options.order) || 0,
                label: String(label === undefined || label === null ? id : label)
              })
            }
            setPanels([...byId.values()].sort((a, b) => a.order - b.order))
          } catch (error) {
            /* 侧栏尚未声明时忽略 */
          }
        }
        const usePanels = () => {
          const [value, setValue] = React.useState(getPanels)
          React.useEffect(() => subscribePanels(() => setValue(getPanels())), [])
          return value
        }
        ctx.effect(() => {
          syncPanels()
          return ctx.slots.subscribe('sidebar.panellist', syncPanels)
        })
        ctx.effect(() => ctx.locale.subscribe(syncPanels))

        const navInject = () => ({
          startSession: (workspaceId) => {
            const ui = ctx.get('uiWorkspace')
            if (ui && typeof ui.startSession === 'function') ui.startSession(workspaceId)
          },
          toggleSidebar: () => {
            const current = ctx.get('layout')
            if (current && typeof current.toggleSidebar === 'function') current.toggleSidebar()
          },
          selectPanel: (id) => {
            const current = ctx.get('layout')
            if (current && typeof current.selectPanel === 'function') current.selectPanel(id)
          },
          usePanels,
          t: (key) => t(key)
        })

        ctx.effect(() =>
          ctx.slots.inject('sidebar', () =>
            ctx.slots.register(
              {
                name: 'sidebar',
                priority: -10,
                children: {
                  'sidebar.brand.mark': { kind: 'single', scope: 'root' },
                  'sidebar.brand.name': { kind: 'single', scope: 'root' },
                  'sidebar.toggle.badge': { kind: 'single', scope: 'root' },
                  'sidebar.panellist': { kind: 'list', scope: 'root' },
                  'sidebar.workspaces': { kind: 'single', scope: 'root' },
                  'sidebar.settings': { kind: 'single', scope: 'root' },
                  'sidebar.footer.action': { kind: 'list', scope: 'root' }
                },
                inject: navInject
              },
              ThemedSidebar
            )
          )
        )

        ctx.effect(() =>
          ctx.slots.inject('shell.leading', () =>
            ctx.slots.register(
              {
                name: 'shell.leading',
                priority: -10,
                inject: () => ({
                  startSession: (workspaceId) => {
                    const ui = ctx.get('uiWorkspace')
                    if (ui && typeof ui.startSession === 'function') ui.startSession(workspaceId)
                  },
                  toggleSidebar: () => {
                    const current = ctx.get('layout')
                    if (current && typeof current.toggleSidebar === 'function') current.toggleSidebar()
                  },
                  t: (key) => t(key)
                })
              },
              LeadingControls
            )
          )
        )
      }

      /* 空白会话 Hero 徽记。 */
      ctx.effect(() =>
        ctx.slots.inject('conversation.hero.brand.mark', () =>
          ctx.slots.register({ name: 'conversation.hero.brand.mark' }, HeroMark)
        )
      )
    }

    return { inject: ['slots', 'theme', 'locale', 'layout', 'uiWorkspace'], apply }
  }
})
