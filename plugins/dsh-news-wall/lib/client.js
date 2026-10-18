window.__ModuleLoader__.load({
	id: "dsh-news-wall",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		/**
		 * 时事大屏 · Client 半部（DSH web 客户端插件）
		 *
		 * 由 scripts/build.mjs 包进 DSH 的模块加载协议，产出 lib/client.js：
		 *
		 *   window.__ModuleLoader__.load({ id: 'dsh-news-wall', factory: (require) => { ... } })
		 *
		 * 所以这里写成 CJS：`require('react')` 走 shell 的模块表，其余全部内联，
		 * 不引入任何第三方依赖。插件做两件事：
		 *
		 *   1. 往 sidebar.panellist 注册侧边栏图标（id = 'news-wall'）；
		 *   2. 往 main 注册同 key 的中央面板 —— 点图标即切到这块大屏。
		 *
		 * 版式：编辑部头版 —— 一张深色大图焦点卡（自动轮播）+ 全高热榜光轨
		 *      + 三栏快讯（国内 / 国际 / 科技）+ 底部快讯跑马灯。
		 * 数据来自 Host 半部的同源端点（见 src/index.mjs）。
		 */

		const React = require('react')

		const PACKAGE_ID = 'dsh-news-wall'
		/** 面板 id：sidebar.panellist 的 list id 与 main 的 keyed key 必须一致。 */
		const PANEL_ID = 'news-wall'
		/** 兜底取数路径（Host 半部还会通过 tapIndex 注入带端口的启动配置）。 */
		const DEFAULT_API = '/dsh-news-wall/feed'
		/** 兜底偏好路径（启动配置里也有一份）。 */
		const DEFAULT_PREFS = '/dsh-news-wall/prefs'
		const STYLE_ID = 'dsh-news-wall-styles'

		const REFRESH_CHOICES = [1, 5, 15]
		const DEFAULT_REFRESH_MIN = 5
		/** 焦点卡轮播间隔。 */
		const HERO_ROTATE_MS = 9000

		const h = React.createElement

		/** 板块强调色（成品色，不参与主题切换 —— 作为「版面油墨」使用）。 */
		const ACCENT = {
		  cn: 'var(--nw-cn)',
		  world: 'var(--nw-world)',
		  tech: 'var(--nw-tech)',
		  hot: 'var(--nw-hot)',
		}

		const CATEGORY_LABEL = {
		  cn: '国内要闻',
		  world: '国际时事',
		  tech: '科技 · AI',
		  hot: '全网热榜',
		}

		/* ────────────────────────────── 样式 ────────────────────────────── */

		const CSS = `
		/* 轮播光轨的角度变量；不支持 @property 时退化为静态描边 */
		@property --nw-sweep { syntax: '<angle>'; inherits: false; initial-value: 0deg; }

		.nw-root, .nw-root *, .nw-root *::before, .nw-root *::after { box-sizing: border-box; }

		.nw-root {
		  --nw-gap: 12px;
		  --nw-radius: 20px;
		  --nw-text: var(--dsw-alias-label-primary, #16171a);
		  --nw-muted: var(--dsw-alias-label-secondary, #6f7280);
		  --nw-line: var(--dsw-alias-border-l1, rgba(60, 60, 67, .14));
		  --nw-glass: color-mix(in srgb, var(--dsw-alias-bg-layer-1, #ffffff) 74%, transparent);
		  --nw-glass-deep: color-mix(in srgb, var(--dsw-alias-bg-layer-2, #f2f2f7) 84%, transparent);
		  --nw-ink: color-mix(in srgb, var(--nw-text) 24%, transparent);
		  --nw-brand: var(--dsw-alias-brand-primary, #0a84ff);
		  --nw-ok: var(--dsw-alias-state-success-primary, #34c759);
		  --nw-warn: var(--dsw-alias-state-warn-primary, #ff9f0a);
		  --nw-bad: var(--dsw-alias-state-error-primary, #ff3b30);
		  --nw-cn: #ff375f;
		  --nw-world: #0a84ff;
		  --nw-tech: #1fc97a;
		  --nw-hot: #ff9f0a;
		  position: relative;
		  height: 100%;
		  min-height: 520px;
		  overflow: hidden;
		  color: var(--nw-text);
		  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text",
		    "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Helvetica Neue", sans-serif;
		  -webkit-font-smoothing: antialiased;
		  text-rendering: optimizeLegibility;
		  isolation: isolate;
		}

		/* ── 极光底：三团缓慢漂移的色雾，给版面一点「活气」 ── */
		.nw-aurora {
		  position: absolute;
		  inset: -18%;
		  z-index: 0;
		  pointer-events: none;
		  filter: blur(64px);
		  opacity: .5;
		}
		.nw-blob { position: absolute; border-radius: 50%; }
		.nw-blob.a {
		  width: 46%; height: 52%; left: 2%; top: -10%;
		  background: radial-gradient(circle at 40% 40%, color-mix(in srgb, var(--nw-cn) 60%, transparent), transparent 68%);
		  animation: nw-drift-a 34s ease-in-out infinite alternate;
		}
		.nw-blob.b {
		  width: 42%; height: 48%; right: -2%; top: -14%;
		  background: radial-gradient(circle at 60% 40%, color-mix(in srgb, var(--nw-world) 54%, transparent), transparent 68%);
		  animation: nw-drift-b 44s ease-in-out infinite alternate;
		}
		.nw-blob.c {
		  width: 54%; height: 46%; left: 26%; bottom: -22%;
		  background: radial-gradient(circle at 50% 50%, color-mix(in srgb, var(--nw-tech) 38%, transparent), transparent 70%);
		  animation: nw-drift-c 52s ease-in-out infinite alternate;
		}
		@keyframes nw-drift-a { to { transform: translate3d(10%, 9%, 0) scale(1.18); } }
		@keyframes nw-drift-b { to { transform: translate3d(-9%, 11%, 0) scale(1.12); } }
		@keyframes nw-drift-c { to { transform: translate3d(-7%, -11%, 0) scale(1.22); } }

		.nw-body {
		  position: relative;
		  z-index: 1;
		  display: flex;
		  flex-direction: column;
		  gap: var(--nw-gap);
		  height: 100%;
		  min-height: 0;
		  padding: 15px 17px 13px;
		}

		/* ── 顶栏 ── */
		.nw-top { display: flex; align-items: center; gap: 12px; min-width: 0; flex-wrap: wrap; row-gap: 8px; }
		.nw-brand { display: flex; align-items: center; gap: 10px; min-width: 0; }
		.nw-mark {
		  flex: 0 0 auto;
		  width: 30px; height: 30px;
		  border-radius: 9px;
		  display: grid; place-items: center;
		  color: #fff; font-size: 15px; font-weight: 800; letter-spacing: -.02em;
		  background: linear-gradient(145deg, #ff375f, #0a84ff 52%, #7b5cff);
		  box-shadow: 0 8px 20px -8px color-mix(in srgb, var(--nw-world) 70%, transparent),
		              inset 0 1px 0 rgba(255, 255, 255, .5);
		}
		.nw-brand-text { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
		.nw-brand-title { font-size: 13.5px; font-weight: 700; letter-spacing: .02em; }
		.nw-brand-sub {
		  font-size: 9.5px; font-weight: 600; letter-spacing: .16em; text-transform: uppercase;
		  color: var(--nw-muted);
		}
		.nw-live {
		  display: inline-flex; align-items: center; gap: 5px;
		  height: 19px; padding: 0 8px;
		  border-radius: 99px;
		  font-size: 9px; font-weight: 800; letter-spacing: .14em;
		  color: var(--nw-bad);
		  background: color-mix(in srgb, var(--nw-bad) 12%, transparent);
		  border: 1px solid color-mix(in srgb, var(--nw-bad) 26%, transparent);
		}
		.nw-live i { width: 5px; height: 5px; border-radius: 50%; background: var(--nw-bad); animation: nw-pulse 2s ease-out infinite; }
		@keyframes nw-pulse {
		  0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--nw-bad) 60%, transparent); }
		  100% { box-shadow: 0 0 0 7px transparent; }
		}

		.nw-actions { margin-left: auto; display: flex; align-items: center; gap: 8px; }

		.nw-btn {
		  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
		  height: 28px; padding: 0 11px;
		  border: 1px solid var(--nw-line);
		  border-radius: 9px;
		  background: var(--nw-glass-deep);
		  color: var(--nw-text);
		  font: inherit; font-size: 12px; font-weight: 600;
		  cursor: pointer;
		  transition: background .16s ease, transform .1s ease, box-shadow .2s ease, border-color .2s ease;
		}
		.nw-btn:hover { border-color: color-mix(in srgb, var(--nw-brand) 38%, var(--nw-line)); background: color-mix(in srgb, var(--nw-brand) 10%, var(--nw-glass-deep)); }
		.nw-btn:active { transform: scale(.97); }
		.nw-btn:disabled { opacity: .6; cursor: default; }
		.nw-btn.primary {
		  border-color: transparent;
		  color: #fff;
		  background: linear-gradient(180deg, color-mix(in srgb, var(--nw-brand) 86%, #fff), var(--nw-brand));
		  box-shadow: 0 10px 22px -10px color-mix(in srgb, var(--nw-brand) 85%, transparent),
		              inset 0 1px 0 rgba(255, 255, 255, .36);
		}
		.nw-btn.primary:hover { background: linear-gradient(180deg, color-mix(in srgb, var(--nw-brand) 92%, #fff), color-mix(in srgb, var(--nw-brand) 92%, #000)); }
		.nw-btn.square { width: 28px; padding: 0; }
		.nw-icon { display: block; }
		.nw-spin { animation: nw-spin .9s linear infinite; }
		@keyframes nw-spin { to { transform: rotate(360deg); } }

		.nw-seg {
		  display: inline-flex; padding: 2px; gap: 2px;
		  border: 1px solid var(--nw-line); border-radius: 9px; background: var(--nw-glass-deep);
		}
		.nw-seg-item {
		  border: 0; background: transparent; color: var(--nw-muted);
		  font: inherit; font-size: 11px; font-weight: 700;
		  height: 22px; padding: 0 8px; border-radius: 7px; cursor: pointer;
		  font-variant-numeric: tabular-nums;
		  transition: color .16s ease, background .16s ease;
		}
		.nw-seg-item.active { color: #fff; background: var(--nw-brand); box-shadow: 0 2px 8px -2px color-mix(in srgb, var(--nw-brand) 80%, transparent); }

		/* 源状态浮层 */
		.nw-sources { position: relative; }
		.nw-sources > summary { list-style: none; }
		.nw-sources > summary::-webkit-details-marker { display: none; }
		.nw-src-pop {
		  position: absolute; top: 34px; right: 0; z-index: 9;
		  width: 274px; max-height: 46vh; overflow-y: auto;
		  padding: 8px;
		  border: 1px solid var(--nw-line); border-radius: 14px;
		  background: var(--dsw-alias-bg-overlay, #fff);
		  box-shadow: 0 24px 60px -22px rgba(0, 0, 0, .45);
		}
		.nw-src-row { display: flex; align-items: baseline; gap: 8px; padding: 5px 8px; border-radius: 8px; font-size: 11.5px; }
		.nw-src-row.bad { background: color-mix(in srgb, var(--nw-bad) 10%, transparent); }
		.nw-src-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
		.nw-src-meta { color: var(--nw-muted); font-variant-numeric: tabular-nums; white-space: nowrap; }
		.nw-src-row.bad .nw-src-meta { color: var(--nw-bad); }

		/* ── 报头：大时钟 ── */
		.nw-masthead { display: flex; align-items: flex-end; gap: 16px; min-width: 0; }
		.nw-clock {
		  font-size: clamp(38px, 3.2vw, 50px);
		  font-weight: 650;
		  line-height: .86;
		  letter-spacing: -.04em;
		  font-variant-numeric: tabular-nums;
		  background: linear-gradient(180deg, var(--nw-text) 34%, color-mix(in srgb, var(--nw-text) 52%, transparent));
		  -webkit-background-clip: text;
		  background-clip: text;
		  -webkit-text-fill-color: transparent;
		}
		.nw-date { display: flex; flex-direction: column; gap: 3px; padding-bottom: 2px; }
		.nw-date b { font-size: 13px; font-weight: 650; letter-spacing: .01em; }
		.nw-date span { font-size: 11px; color: var(--nw-muted); letter-spacing: .04em; }
		.nw-stat { margin-left: auto; display: flex; align-items: center; gap: 14px; padding-bottom: 1px; }
		.nw-updated { text-align: right; }
		.nw-updated b { display: block; font-size: 12.5px; font-weight: 650; }
		.nw-updated span { font-size: 11px; color: var(--nw-muted); font-variant-numeric: tabular-nums; }
		.nw-ring { position: relative; width: 44px; height: 44px; flex: 0 0 auto; }
		.nw-ring svg { display: block; transform: rotate(-90deg); filter: drop-shadow(0 2px 8px color-mix(in srgb, var(--nw-brand) 45%, transparent)); }
		.nw-ring-label {
		  position: absolute; inset: 0; display: grid; place-items: center;
		  font-size: 11px; font-weight: 700; color: var(--nw-muted); font-variant-numeric: tabular-nums;
		}

		/* ── 主舞台：头版版式 ── */
		.nw-stage {
		  flex: 1;
		  min-height: 0;
		  display: grid;
		  gap: var(--nw-gap);
		  grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr) minmax(0, 1.14fr);
		  grid-template-rows: minmax(0, 1.04fr) minmax(0, .96fr);
		  grid-template-areas:
		    "hero hot cn"
		    "world hot tech";
		}

		/* ── 卡片外壳 ── */
		.nw-card {
		  position: relative;
		  display: flex;
		  flex-direction: column;
		  min-width: 0; min-height: 0;
		  border: 1px solid var(--nw-line);
		  border-radius: var(--nw-radius);
		  background: var(--nw-glass);
		  -webkit-backdrop-filter: blur(26px) saturate(175%);
		  backdrop-filter: blur(26px) saturate(175%);
		  box-shadow: inset 0 1px 0 color-mix(in srgb, #fff 34%, transparent),
		              0 26px 60px -38px rgba(0, 0, 0, .50);
		  overflow: hidden;
		  transition: transform .28s cubic-bezier(.2, .8, .2, 1), box-shadow .28s ease, border-color .28s ease;
		}
		.nw-card:hover {
		  transform: translateY(-2px);
		  border-color: color-mix(in srgb, var(--nw-cat, var(--nw-brand)) 32%, var(--nw-line));
		  box-shadow: inset 0 1px 0 color-mix(in srgb, #fff 42%, transparent),
		              0 34px 70px -38px rgba(0, 0, 0, .56);
		}
		.nw-card-head { display: flex; align-items: center; gap: 9px; padding: 12px 15px 9px; }
		.nw-cat {
		  display: flex; align-items: center; gap: 8px;
		  font-size: 12.5px; font-weight: 700; letter-spacing: .05em;
		}
		.nw-cat i {
		  width: 7px; height: 7px; border-radius: 2px;
		  background: var(--nw-cat, var(--nw-brand));
		  box-shadow: 0 0 10px color-mix(in srgb, var(--nw-cat, var(--nw-brand)) 80%, transparent);
		  transform: rotate(45deg);
		}
		.nw-count { margin-left: auto; font-size: 11px; color: var(--nw-muted); font-variant-numeric: tabular-nums; }
		.nw-rule { height: 1px; margin: 0 15px; background: linear-gradient(90deg, var(--nw-line), transparent); }

		.nw-list {
		  flex: 1; min-height: 0;
		  overflow-y: auto;
		  padding: 3px 8px 8px;
		  overscroll-behavior: contain;
		  scrollbar-width: thin;
		}
		.nw-list::-webkit-scrollbar { width: 9px; }
		.nw-list::-webkit-scrollbar-thumb {
		  background: color-mix(in srgb, var(--nw-muted) 30%, transparent);
		  border: 2.5px solid transparent; background-clip: content-box; border-radius: 9px;
		}
		.nw-list::-webkit-scrollbar-thumb:hover { background: color-mix(in srgb, var(--nw-muted) 50%, transparent); background-clip: content-box; }
		.nw-list::-webkit-scrollbar-track { background: transparent; }

		/* ── 快讯行 ── */
		.nw-row {
		  position: relative;
		  display: flex; align-items: flex-start; gap: 10px;
		  padding: 9px 8px 9px 11px;
		  border-radius: 12px;
		  color: inherit; text-decoration: none;
		  transition: background .16s ease;
		  animation: nw-rise .42s cubic-bezier(.2, .8, .2, 1) both;
		  animation-delay: calc(var(--i, 0) * 16ms);
		}
		.nw-row::before {
		  content: "";
		  position: absolute; left: 0; top: 11px; bottom: 11px; width: 2px;
		  border-radius: 2px;
		  background: var(--nw-cat, var(--nw-brand));
		  opacity: 0;
		  transition: opacity .16s ease;
		}
		.nw-row:hover { background: color-mix(in srgb, var(--nw-cat, var(--nw-brand)) 10%, transparent); }
		.nw-row:hover::before { opacity: .95; }
		@keyframes nw-rise { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }

		.nw-row-body { flex: 1; min-width: 0; }
		.nw-row-title {
		  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
		  font-size: 13px; line-height: 1.45; font-weight: 500; letter-spacing: -.004em;
		}
		.nw-row.stale .nw-row-title { opacity: .58; }
		.nw-row-meta {
		  display: flex; align-items: center; gap: 6px;
		  margin-top: 5px;
		  font-size: 11px; color: var(--nw-muted);
		}
		.nw-src { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 58%; }
		.nw-dot { opacity: .5; }
		.nw-ago { font-variant-numeric: tabular-nums; white-space: nowrap; }
		.nw-ago.fresh { color: var(--nw-ok); font-weight: 650; }
		.nw-ago.warm { color: var(--nw-warn); font-weight: 600; }
		.nw-ago.old { opacity: .8; }

		.nw-thumb {
		  flex: 0 0 46px; width: 46px; height: 46px;
		  border-radius: 10px; overflow: hidden;
		  background: var(--nw-glass-deep);
		  box-shadow: inset 0 0 0 1px var(--nw-line);
		}
		.nw-thumb img { display: block; width: 100%; height: 100%; object-fit: cover; }

		.nw-tag {
		  display: inline-block;
		  margin-right: 5px;
		  padding: 0 4px;
		  border-radius: 4px;
		  font-size: 9.5px; font-weight: 800; line-height: 15px; letter-spacing: .04em;
		  vertical-align: 1px;
		  color: #fff;
		  background: linear-gradient(180deg, #ff6a5e, #ff2d55);
		  box-shadow: 0 2px 8px -2px color-mix(in srgb, #ff2d55 70%, transparent);
		}
		.nw-tag.calm { background: linear-gradient(180deg, #a9b0bd, #7d8592); box-shadow: none; }

		/* ── 全高热榜：光轨 + 巨号名次 ── */
		.nw-card--hot::after {
		  content: "";
		  position: absolute; inset: 0; z-index: 2;
		  border-radius: inherit;
		  padding: 1px;
		  background: conic-gradient(from var(--nw-sweep), transparent 0deg 246deg, color-mix(in srgb, var(--nw-hot) 92%, transparent) 300deg, transparent 344deg);
		  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
		  -webkit-mask-composite: xor;
		  mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
		  mask-composite: exclude;
		  animation: nw-sweep 7s linear infinite;
		  pointer-events: none;
		}
		@keyframes nw-sweep { to { --nw-sweep: 360deg; } }
		.nw-hot {
		  position: relative;
		  display: flex; align-items: flex-start; gap: 10px;
		  padding: 7px 8px 7px 6px;
		  border-radius: 12px;
		  color: inherit; text-decoration: none;
		  transition: background .16s ease;
		  animation: nw-rise .42s cubic-bezier(.2, .8, .2, 1) both;
		  animation-delay: calc(var(--i, 0) * 16ms);
		}
		.nw-hot:hover { background: color-mix(in srgb, var(--nw-hot) 11%, transparent); }
		.nw-hot-num {
		  flex: 0 0 32px;
		  font-size: 20px; font-weight: 800; line-height: 1.15;
		  letter-spacing: -.06em;
		  text-align: center;
		  font-variant-numeric: tabular-nums;
		  color: var(--nw-ink);
		  -webkit-text-stroke: .5px color-mix(in srgb, var(--nw-text) 26%, transparent);
		  transition: transform .2s ease;
		}
		.nw-hot:hover .nw-hot-num { transform: translateY(-1px) scale(1.06); }
		.nw-hot-num.t1 {
		  background: linear-gradient(180deg, #ffd166, #ff8a00);
		  -webkit-background-clip: text; background-clip: text;
		  -webkit-text-fill-color: transparent; -webkit-text-stroke: 0;
		  filter: drop-shadow(0 3px 10px rgba(255, 138, 0, .45));
		}
		.nw-hot-num.t2 {
		  background: linear-gradient(180deg, #f2f5fa, #97a3b7);
		  -webkit-background-clip: text; background-clip: text;
		  -webkit-text-fill-color: transparent; -webkit-text-stroke: 0;
		}
		.nw-hot-num.t3 {
		  background: linear-gradient(180deg, #f6c9a3, #c8753f);
		  -webkit-background-clip: text; background-clip: text;
		  -webkit-text-fill-color: transparent; -webkit-text-stroke: 0;
		}
		.nw-hot-main { flex: 1; min-width: 0; }
		.nw-hot-title {
		  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
		  font-size: 12.5px; line-height: 1.42; font-weight: 550;
		}
		.nw-hot-meta { display: flex; align-items: center; gap: 7px; margin-top: 5px; font-size: 10.5px; color: var(--nw-muted); }
		.nw-heat {
		  position: relative;
		  flex: 0 0 52px; width: 52px; height: 3px;
		  border-radius: 99px;
		  background: color-mix(in srgb, var(--nw-text) 10%, transparent);
		  overflow: hidden;
		}
		.nw-heat i {
		  position: absolute; left: 0; top: 0; bottom: 0;
		  border-radius: 99px;
		  background: linear-gradient(90deg, color-mix(in srgb, var(--nw-hot) 55%, transparent), var(--nw-hot));
		  box-shadow: 0 0 8px color-mix(in srgb, var(--nw-hot) 70%, transparent);
		}
		.nw-heat-num { font-variant-numeric: tabular-nums; white-space: nowrap; }

		/* ── 焦点卡：深色大图 + 巨型标题 ── */
		.nw-hero {
		  position: relative;
		  min-width: 0; min-height: 0;
		  border-radius: var(--nw-radius);
		  overflow: hidden;
		  background:
		    radial-gradient(120% 110% at 100% 0%, color-mix(in srgb, var(--nw-cat, var(--nw-brand)) 58%, #000) 0%, transparent 56%),
		    linear-gradient(158deg, #14151b 0%, #1c1e26 52%, #12131a 100%);
		  box-shadow: 0 34px 80px -40px rgba(0, 0, 0, .62), inset 0 1px 0 rgba(255, 255, 255, .10);
		  isolation: isolate;
		}
		.nw-slide { position: absolute; inset: 0; opacity: 0; transform: translateY(10px) scale(1.006); transition: opacity .72s ease, transform .72s ease; }
		.nw-slide.active { opacity: 1; transform: none; }
		.nw-hero-media { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; transform: scale(1.03); transition: transform 6s ease; }
		.nw-hero:hover .nw-hero-media { transform: scale(1.07); }
		.nw-hero-scrim {
		  position: absolute; inset: 0;
		  background:
		    linear-gradient(180deg, rgba(8, 9, 14, .18) 0%, rgba(8, 9, 14, .46) 42%, rgba(8, 9, 14, .93) 100%),
		    linear-gradient(90deg, rgba(8, 9, 14, .55), transparent 62%);
		}
		.nw-hero-wash {
		  position: absolute; inset: 0;
		  background: radial-gradient(110% 90% at 96% 4%, color-mix(in srgb, var(--nw-cat, var(--nw-brand)) 60%, transparent), transparent 58%);
		  mix-blend-mode: screen;
		  opacity: .55;
		}
		.nw-hero-mark {
		  position: absolute; right: 6px; bottom: -34px;
		  font-size: 168px; font-weight: 900; line-height: 1;
		  letter-spacing: -.07em;
		  color: rgba(255, 255, 255, .07);
		  pointer-events: none;
		}
		.nw-hero-body {
		  position: relative; z-index: 2;
		  height: 100%;
		  display: flex; flex-direction: column; justify-content: flex-end;
		  gap: 9px;
		  padding: 18px 18px 16px;
		  color: #fff;
		}
		.nw-hero-chip {
		  align-self: flex-start;
		  display: inline-flex; align-items: center; gap: 6px;
		  padding: 3px 9px;
		  border-radius: 99px;
		  font-size: 10px; font-weight: 800; letter-spacing: .1em;
		  background: color-mix(in srgb, var(--nw-cat, var(--nw-brand)) 78%, transparent);
		  border: 1px solid rgba(255, 255, 255, .26);
		  -webkit-backdrop-filter: blur(6px);
		  backdrop-filter: blur(6px);
		}
		.nw-hero-link { color: inherit; text-decoration: none; }
		.nw-hero-title {
		  margin: 0;
		  font-size: clamp(20px, 2.02vw, 31px);
		  line-height: 1.2;
		  font-weight: 700;
		  letter-spacing: -.03em;
		  text-wrap: balance;
		  display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden;
		  text-shadow: 0 2px 24px rgba(0, 0, 0, .45);
		}
		.nw-hero-link:hover .nw-hero-title { text-decoration: underline; text-decoration-thickness: 2px; text-underline-offset: 4px; }
		.nw-hero-sub {
		  margin: 0;
		  font-size: 12.5px; line-height: 1.62;
		  color: rgba(255, 255, 255, .74);
		  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
		}
		.nw-hero-foot { display: flex; align-items: center; gap: 8px; font-size: 11.5px; color: rgba(255, 255, 255, .66); }
		.nw-hero-foot .nw-ago.fresh { color: #6ef2a6; }
		.nw-hero-foot .nw-ago.warm { color: #ffd166; }
		.nw-hero-dots { margin-left: auto; display: flex; align-items: center; gap: 5px; }
		.nw-hero-dot {
		  width: 6px; height: 6px; padding: 0;
		  border: 0; border-radius: 99px;
		  background: rgba(255, 255, 255, .32);
		  cursor: pointer;
		  transition: width .28s ease, background .28s ease;
		}
		.nw-hero-dot.active { width: 20px; background: #fff; }
		.nw-hero-timer { position: absolute; top: 0; left: 0; right: 0; height: 2px; background: rgba(255, 255, 255, .12); z-index: 3; }
		.nw-hero-timer i {
		  display: block; height: 100%;
		  background: linear-gradient(90deg, rgba(255, 255, 255, .9), color-mix(in srgb, var(--nw-cat, var(--nw-brand)) 80%, #fff));
		  animation: nw-hero-timer var(--nw-hero-ms, 9000ms) linear forwards;
		}
		@keyframes nw-hero-timer { from { width: 0; } to { width: 100%; } }

		/* ── 底部快讯 ── */
		.nw-ticker {
		  display: flex; align-items: center; gap: 10px;
		  height: 34px;
		  padding: 0 4px 0 11px;
		  border: 1px solid var(--nw-line);
		  border-radius: 12px;
		  background: var(--nw-glass);
		  -webkit-backdrop-filter: blur(20px);
		  backdrop-filter: blur(20px);
		  overflow: hidden;
		}
		.nw-ticker-label {
		  flex: 0 0 auto;
		  display: inline-flex; align-items: center; gap: 6px;
		  font-size: 10px; font-weight: 800; letter-spacing: .16em;
		  color: var(--nw-bad);
		}
		.nw-ticker-label i { width: 5px; height: 5px; border-radius: 50%; background: var(--nw-bad); box-shadow: 0 0 8px var(--nw-bad); }
		.nw-ticker-view {
		  position: relative; flex: 1; min-width: 0; overflow: hidden;
		  -webkit-mask-image: linear-gradient(90deg, transparent, #000 24px, #000 calc(100% - 44px), transparent);
		  mask-image: linear-gradient(90deg, transparent, #000 24px, #000 calc(100% - 44px), transparent);
		}
		.nw-ticker-track { display: inline-flex; gap: 34px; white-space: nowrap; will-change: transform; animation: nw-marquee 96s linear infinite; }
		.nw-ticker:hover .nw-ticker-track { animation-play-state: paused; }
		.nw-ticker-item { font-size: 12px; color: var(--nw-text); text-decoration: none; }
		.nw-ticker-item:hover { color: var(--nw-brand); }
		.nw-ticker-item b { font-size: 10px; font-weight: 800; color: var(--nw-hot); margin-right: 6px; font-variant-numeric: tabular-nums; }
		.nw-ticker-item span { color: var(--nw-muted); }
		@keyframes nw-marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }

		/* ── 状态条 / 骨架 / 进度 ── */
		.nw-alert {
		  display: flex; align-items: center; gap: 10px;
		  padding: 8px 12px;
		  border: 1px solid color-mix(in srgb, var(--nw-bad) 34%, transparent);
		  border-radius: 12px;
		  background: color-mix(in srgb, var(--nw-bad) 10%, transparent);
		  font-size: 12px;
		}
		.nw-alert .nw-alert-text { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
		.nw-progress { position: absolute; top: 0; left: 0; right: 0; height: 2px; z-index: 5; overflow: hidden; }
		.nw-progress::after {
		  content: ""; position: absolute; inset: 0 62% 0 0;
		  background: linear-gradient(90deg, transparent, var(--nw-brand), transparent);
		  animation: nw-slide 1.2s ease-in-out infinite;
		}
		@keyframes nw-slide { from { transform: translateX(-100%); } to { transform: translateX(330%); } }
		.nw-skel { border-radius: var(--nw-radius); border: 1px solid var(--nw-line); background: var(--nw-glass); padding: 16px; overflow: hidden; }
		.nw-skel-line {
		  height: 12px; border-radius: 6px;
		  background: linear-gradient(90deg, color-mix(in srgb, var(--nw-muted) 9%, transparent), color-mix(in srgb, var(--nw-muted) 22%, transparent), color-mix(in srgb, var(--nw-muted) 9%, transparent));
		  background-size: 220% 100%;
		  animation: nw-shimmer 1.5s ease-in-out infinite;
		}
		@keyframes nw-shimmer { from { background-position: 120% 0; } to { background-position: -120% 0; } }
		.nw-empty { padding: 24px 12px; text-align: center; font-size: 12px; color: var(--nw-muted); }
		.nw-status-dot { width: 7px; height: 7px; border-radius: 50%; flex: 0 0 auto; }
		.nw-fallback {
		  display: grid; place-items: center; height: 100%; min-height: 200px; padding: 24px;
		  font-size: 12.5px; color: var(--nw-muted); text-align: center; line-height: 1.7;
		}

		/* ── 偏好编辑器 ── */
		.nw-btn.relative { position: relative; }
		.nw-dotmark {
		  position: absolute; top: 4px; right: 4px;
		  width: 5px; height: 5px; border-radius: 50%;
		  background: var(--nw-ok);
		  box-shadow: 0 0 7px var(--nw-ok);
		}
		.nw-tag.must {
		  background: linear-gradient(180deg, #ffd166, #ff9f0a);
		  color: #4a2f00;
		  box-shadow: 0 2px 8px -2px rgba(255, 159, 10, .65);
		}
		.nw-modal { position: absolute; inset: 0; z-index: 20; display: grid; place-items: center; padding: 18px; }
		.nw-modal-backdrop {
		  position: absolute; inset: 0;
		  background: color-mix(in srgb, #000 44%, transparent);
		  -webkit-backdrop-filter: blur(7px);
		  backdrop-filter: blur(7px);
		}
		.nw-sheet {
		  position: relative;
		  display: flex; flex-direction: column; gap: 12px;
		  width: min(780px, 100%); max-height: 100%; min-height: 0;
		  padding: 16px 18px 14px;
		  border: 1px solid var(--nw-line);
		  border-radius: 18px;
		  background: var(--dsw-alias-bg-overlay, #fff);
		  box-shadow: 0 44px 110px -44px rgba(0, 0, 0, .72);
		}
		.nw-sheet-head { display: flex; align-items: flex-start; gap: 10px; }
		.nw-sheet-head h3 { margin: 0; font-size: 15px; font-weight: 700; letter-spacing: .01em; }
		.nw-sheet-head p { margin: 4px 0 0; font-size: 11.5px; line-height: 1.6; color: var(--nw-muted); }
		.nw-sheet-body { display: grid; grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr); gap: 14px; flex: 1; min-height: 0; }
		.nw-draft {
		  width: 100%; height: 100%; min-height: 220px;
		  padding: 12px 13px;
		  resize: none;
		  border: 1px solid var(--nw-line);
		  border-radius: 12px;
		  background: var(--nw-glass-deep);
		  color: var(--nw-text);
		  font: 12.5px/1.68 ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
		  outline: none;
		  transition: border-color .16s ease, box-shadow .16s ease;
		}
		.nw-draft:focus {
		  border-color: color-mix(in srgb, var(--nw-brand) 55%, var(--nw-line));
		  box-shadow: 0 0 0 3px color-mix(in srgb, var(--nw-brand) 15%, transparent);
		}
		.nw-parse { display: flex; flex-direction: column; gap: 9px; min-height: 0; overflow-y: auto; padding-right: 2px; }
		.nw-parse h4 { margin: 0; font-size: 10px; font-weight: 800; letter-spacing: .14em; text-transform: uppercase; color: var(--nw-muted); }
		.nw-chip-group { display: flex; flex-direction: column; gap: 5px; }
		.nw-chips { display: flex; flex-wrap: wrap; gap: 5px; }
		.nw-chip {
		  padding: 2px 7px; border-radius: 6px;
		  font-size: 11px; line-height: 1.55;
		  background: color-mix(in srgb, var(--nw-brand) 12%, transparent);
		}
		.nw-chip.good { background: color-mix(in srgb, var(--nw-ok) 16%, transparent); }
		.nw-chip.warn { background: color-mix(in srgb, var(--nw-warn) 18%, transparent); }
		.nw-chip.bad { background: color-mix(in srgb, var(--nw-bad) 14%, transparent); }
		.nw-parse-note { margin: 0; font-size: 11px; line-height: 1.65; color: var(--nw-muted); }
		.nw-sheet-foot { display: flex; align-items: center; gap: 8px; }
		.nw-spacer { flex: 1; }
		.nw-toast {
		  position: absolute; left: 50%; bottom: 46px; transform: translateX(-50%);
		  z-index: 21;
		  padding: 6px 13px;
		  border-radius: 99px;
		  font-size: 11.5px; font-weight: 600; color: #fff;
		  background: color-mix(in srgb, var(--nw-ok) 84%, #000);
		  box-shadow: 0 14px 34px -14px rgba(0, 0, 0, .55);
		}
		@media (max-width: 880px) {
		  .nw-sheet-body { grid-template-columns: minmax(0, 1fr); }
		  .nw-draft { min-height: 170px; }
		}

		/* 浅色下玻璃要更实一点，深色下更透 —— 由主题背景亮度决定 */
		@media (prefers-color-scheme: light) {
		  .nw-card, .nw-ticker { background: color-mix(in srgb, var(--dsw-alias-bg-layer-1, #fff) 82%, transparent); }
		}
		@media (prefers-color-scheme: dark) {
		  .nw-card, .nw-ticker { background: color-mix(in srgb, var(--dsw-alias-bg-layer-1, #2c2c2e) 62%, transparent); }
		  .nw-aurora { opacity: .62; }
		}

		/* ── 自适应：窄版面板退成两列 / 单列，舞台内滚动 ── */
		@media (max-width: 1180px) {
		  .nw-stage {
		    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		    grid-template-rows: minmax(0, 1.06fr) minmax(0, .94fr) minmax(0, .94fr);
		    grid-template-areas:
		      "hero hot"
		      "cn hot"
		      "world tech";
		  }
		}
		@media (max-width: 880px) {
		  .nw-stage {
		    display: grid;
		    grid-template-columns: minmax(0, 1fr);
		    grid-template-rows: none;
		    grid-auto-rows: minmax(300px, auto);
		    grid-template-areas: none;
		    overflow-y: auto;
		    padding-right: 2px;
		  }
		  .nw-stage > * { min-height: 300px; grid-area: auto !important; }
		  .nw-masthead { flex-wrap: wrap; }
		}
		@media (max-height: 720px) {
		  .nw-clock { font-size: 34px; }
		  .nw-root { --nw-gap: 10px; }
		}

		@media (prefers-reduced-motion: reduce) {
		  .nw-blob, .nw-ticker-track, .nw-progress::after, .nw-skel-line, .nw-spin, .nw-card--hot::after,
		  .nw-row, .nw-hot, .nw-hero-timer i, .nw-live i { animation: none; }
		  .nw-hero-media { transition: none; }
		}
		`

		/* ────────────────────────────── 工具函数 ────────────────────────────── */

		function pad2(value) {
		  return value < 10 ? `0${value}` : String(value)
		}

		/** 21:07:32 */
		function formatClock(date) {
		  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`
		}

		const WEEKDAYS = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']

		/** 10月18日 星期六 */
		function formatDateLabel(date) {
		  return `${date.getMonth() + 1}月${date.getDate()}日 ${WEEKDAYS[date.getDay()]}`
		}

		/** 把时间戳说成人话。 */
		function relativeTime(iso) {
		  if (iso === null || iso === undefined || iso === '') return ''
		  const time = new Date(iso).getTime()
		  if (!Number.isFinite(time)) return ''
		  const diff = Date.now() - time
		  if (diff <= 30_000) return '刚刚'
		  const minutes = Math.floor(diff / 60_000)
		  if (minutes < 60) return `${minutes} 分钟前`
		  const hours = Math.floor(minutes / 60)
		  if (hours < 24) return `${hours} 小时前`
		  const days = Math.floor(hours / 24)
		  if (days < 30) return `${days} 天前`
		  return `${Math.floor(days / 30)} 个月前`
		}

		/** 新鲜度分级：给时间上色。 */
		function freshness(iso) {
		  if (!iso) return 'old'
		  const time = new Date(iso).getTime()
		  if (!Number.isFinite(time)) return 'old'
		  const minutes = (Date.now() - time) / 60_000
		  if (minutes <= 60) return 'fresh'
		  if (minutes <= 360) return 'warm'
		  return 'old'
		}

		/** 144万 / 1.2亿 */
		function formatHeat(value) {
		  if (value === null || value === undefined || !Number.isFinite(value)) return ''
		  if (value >= 100_000_000) return `${(value / 100_000_000).toFixed(1)}亿`
		  if (value >= 10_000) return `${Math.round(value / 10_000)}万`
		  return String(value)
		}

		/** 取数地址：优先用 Host 注入的启动配置，其次相对路径。 */
		function apiBase() {
		  if (typeof window !== 'undefined') {
		    const boot = window.__DSH_NEWS_WALL__
		    if (boot && typeof boot.api === 'string' && boot.api.length > 0) return boot.api
		  }
		  return DEFAULT_API
		}

		function apiUrl(force) {
		  const base = apiBase()
		  if (!force) return base
		  return `${base}${base.includes('?') ? '&' : '?'}refresh=1`
		}

		/** 绝对地址兜底：页面不是从 HTTP 服务加载时用得上。 */
		function absoluteUrl(force) {
		  if (typeof window === 'undefined') return null
		  const boot = window.__DSH_NEWS_WALL__
		  if (!boot || !Number.isFinite(Number(boot.port))) return null
		  return `http://127.0.0.1:${Number(boot.port)}${apiUrl(force)}`
		}

		/** 偏好端点：优先用启动配置，其次由取数路径推导。 */
		function prefsUrl() {
		  if (typeof window !== 'undefined') {
		    const boot = window.__DSH_NEWS_WALL__
		    if (boot && typeof boot.prefs === 'string' && boot.prefs.length > 0) return boot.prefs
		  }
		  const base = apiBase()
		  return base.endsWith('/feed') ? `${base.slice(0, -5)}/prefs` : DEFAULT_PREFS
		}

		function absolutePrefsUrl() {
		  if (typeof window === 'undefined') return null
		  const boot = window.__DSH_NEWS_WALL__
		  if (!boot || !Number.isFinite(Number(boot.port))) return null
		  return `http://127.0.0.1:${Number(boot.port)}${prefsUrl()}`
		}

		/**
		 * 读写偏好。GET 拿当前文本 + 规则，POST 保存并让 Host 用模型重新解析。
		 * 404 通常意味着 Host 半部还没重启（新端点没注册）。
		 */
		async function requestPrefs(method, body) {
		  const options = { cache: 'no-store', method, headers: { accept: 'application/json' } }
		  if (body !== undefined) {
		    options.headers['content-type'] = 'application/json'
		    options.body = JSON.stringify(body)
		  }
		  let response = null
		  try {
		    response = await fetch(prefsUrl(), options)
		  } catch (networkError) {
		    const fallback = absolutePrefsUrl()
		    if (fallback === null) throw networkError
		    response = await fetch(fallback, options)
		  }
		  if (response.status === 404) throw new Error('偏好服务还没加载 —— 重启一次 App 后再试')
		  if (!response.ok) throw new Error(`偏好接口返回 HTTP ${response.status}`)
		  const payload = await response.json()
		  if (!payload || payload.ok !== true) throw new Error((payload && (payload.message || payload.error)) || '偏好接口返回异常')
		  return payload
		}

		function describeError(error) {
		  if (!error) return '未知错误'
		  const message = typeof error.message === 'string' && error.message.length > 0 ? error.message : String(error)
		  return message.length > 160 ? `${message.slice(0, 159)}…` : message
		}

		function categoryLabel(id) {
		  return CATEGORY_LABEL[id] ?? '要闻'
		}

		function accentOf(id) {
		  return ACCENT[id] ?? 'var(--nw-brand)'
		}

		/** 带「热度」语义的角标用红色，其余用中性灰。 */
		const HOT_TAGS = new Set(['热', '爆', '新', '沸'])

		/* ────────────────────────────── 图标 ────────────────────────────── */

		function PanelIcon(props) {
		  const size = Number(props && props.size) || 18
		  return h(
		    'svg',
		    { className: 'nw-icon', width: size, height: size, viewBox: '0 0 20 20', fill: 'none', 'aria-hidden': 'true', focusable: 'false' },
		    h('rect', { x: 2.7, y: 3.5, width: 14.6, height: 13, rx: 2.7, stroke: 'currentColor', strokeWidth: 1.5 }),
		    h('path', { d: 'M6.1 7.3h7.8M6.1 10.3h7.8M6.1 13.3h4.7', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' }),
		  )
		}

		function RefreshIcon(props) {
		  return h(
		    'svg',
		    { className: props && props.spinning ? 'nw-icon nw-spin' : 'nw-icon', width: 13, height: 13, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true', focusable: 'false' },
		    h('path', { d: 'M13.2 8a5.2 5.2 0 1 1-1.7-3.85', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' }),
		    h('path', { d: 'M13.3 2.2v3.1h-3.1', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' }),
		  )
		}

		function ExpandIcon(props) {
		  const exit = props && props.exit
		  const path = exit
		    ? 'M6.4 2.8v3.6H2.8M9.6 13.2v-3.6h3.6M9.6 2.8v3.6h3.6M6.4 13.2v-3.6H2.8'
		    : 'M2.8 6.4V2.8h3.6M13.2 9.6v3.6H9.6M13.2 6.4V2.8H9.6M2.8 9.6v3.6h3.6'
		  return h(
		    'svg',
		    { className: 'nw-icon', width: 13, height: 13, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true', focusable: 'false' },
		    h('path', { d: path, stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' }),
		  )
		}

		/** 偏好按钮：三条滑杆，macOS「设置」的经典画法。 */
		function GearIcon() {
		  return h(
		    'svg',
		    { className: 'nw-icon', width: 13, height: 13, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true', focusable: 'false' },
		    h('path', { d: 'M2.4 4.6h3.4M9 4.6h4.6M2.4 8h6.2M11.8 8h1.8M2.4 11.4h2.2M7.8 11.4h5.8', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' }),
		    h('circle', { cx: 7.4, cy: 4.6, r: 1.5, stroke: 'currentColor', strokeWidth: 1.4 }),
		    h('circle', { cx: 10.2, cy: 8, r: 1.5, stroke: 'currentColor', strokeWidth: 1.4 }),
		    h('circle', { cx: 6.4, cy: 11.4, r: 1.5, stroke: 'currentColor', strokeWidth: 1.4 }),
		  )
		}

		function CloseIcon() {
		  return h(
		    'svg',
		    { className: 'nw-icon', width: 13, height: 13, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true', focusable: 'false' },
		    h('path', { d: 'M4 4l8 8M12 4l-8 8', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' }),
		  )
		}

		function FlameIcon() {
		  return h(
		    'svg',
		    { className: 'nw-icon', width: 14, height: 14, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true', focusable: 'false' },
		    h('path', {
		      d: 'M8 14.2c2.5 0 4.2-1.7 4.2-4 0-2.6-2.1-4.2-3-6.9-1.1 1.4-1.6 2.6-1.5 3.9.1 1.1.6 1.8.6 1.8s-1.1-.4-1.7-1.6c-.9 1.2-1.5 2.4-1.5 3.7 0 2 1.6 3.1 2.9 3.1Z',
		      fill: 'currentColor',
		      opacity: .9,
		    }),
		  )
		}

		/* ────────────────────────────── 组件 ────────────────────────────── */

		/** 懒加载缩略图：加载失败就不渲染（不留破图）。 */
		function Thumb(props) {
		  const [failed, setFailed] = React.useState(false)
		  if (!props.src || failed) return null
		  return h(
		    'span',
		    { className: 'nw-thumb' },
		    h('img', {
		      src: props.src,
		      alt: '',
		      loading: 'lazy',
		      decoding: 'async',
		      referrerPolicy: 'no-referrer',
		      onError: () => setFailed(true),
		    }),
		  )
		}

		/** 时间片：新鲜度上色。 */
		function Ago(props) {
		  if (!props.iso) return null
		  const level = freshness(props.iso)
		  return h('span', { className: `nw-ago ${level}` }, relativeTime(props.iso))
		}

		/** 一条快讯。 */
		function Row(props) {
		  const item = props.item
		  const stale = freshness(item.publishedAt) === 'old'
		  return h(
		    'a',
		    {
		      className: stale ? 'nw-row stale' : 'nw-row',
		      style: { '--i': Math.min(props.index, 14) },
		      href: item.url || undefined,
		      target: '_blank',
		      rel: 'noreferrer noopener',
		      title: item.summary || item.title,
		    },
		    h(
		      'span',
		      { className: 'nw-row-body' },
		      h(
		        'span',
		        { className: 'nw-row-title' },
		        item.flag === 'must' ? h('span', { className: 'nw-tag must' }, '必看') : null,
		        item.tag ? h('span', { className: `nw-tag ${HOT_TAGS.has(item.tag) ? '' : 'calm'}` }, item.tag) : null,
		        item.title,
		      ),
		      h(
		        'span',
		        { className: 'nw-row-meta' },
		        h('span', { className: 'nw-src' }, item.sourceSubtitle ? `${item.source}·${item.sourceSubtitle}` : item.source),
		        item.publishedAt ? h('span', { className: 'nw-dot' }, '·') : null,
		        h(Ago, { iso: item.publishedAt }),
		        item.lang === 'en' ? h('span', { className: 'nw-tag calm' }, 'EN') : null,
		      ),
		    ),
		    h(Thumb, { src: item.image }),
		  )
		}

		/** 快讯栏目卡。 */
		function FeedCard(props) {
		  const category = props.category
		  const items = category.items || []
		  return h(
		    'section',
		    { className: 'nw-card', style: { gridArea: props.area, '--nw-cat': accentOf(category.id) } },
		    h(
		      'header',
		      { className: 'nw-card-head' },
		      h('span', { className: 'nw-cat' }, h('i'), categoryLabel(category.id)),
		      h('span', { className: 'nw-count' }, `${items.length} 条`),
		    ),
		    h('div', { className: 'nw-rule' }),
		    h(
		      'div',
		      { className: 'nw-list' },
		      items.length === 0
		        ? h('div', { className: 'nw-empty' }, '这个板块暂时没有内容')
		        : items.map((item, index) => h(Row, { key: item.id || `${category.id}-${index}`, item, index })),
		    ),
		  )
		}

		/** 全高热榜。 */
		function HotRail(props) {
		  const category = props.category
		  const items = category.items || []
		  const maxHeat = Math.max(1, ...items.map((item) => (Number.isFinite(item.heat) ? item.heat : 0)))
		  return h(
		    'section',
		    { className: 'nw-card nw-card--hot', style: { gridArea: 'hot', '--nw-cat': 'var(--nw-hot)' } },
		    h(
		      'header',
		      { className: 'nw-card-head' },
		      h('span', { className: 'nw-cat', style: { color: 'var(--nw-hot)' } }, h(FlameIcon), '全网热榜'),
		      h('span', { className: 'nw-count' }, `${items.length} 条 · 实时`),
		    ),
		    h('div', { className: 'nw-rule' }),
		    h(
		      'div',
		      { className: 'nw-list' },
		      items.length === 0
		        ? h('div', { className: 'nw-empty' }, '热榜暂不可用')
		        : items.map((item, index) =>
		            h(
		              'a',
		              {
		                key: item.id || `hot-${index}`,
		                className: 'nw-hot',
		                style: { '--i': Math.min(index, 14) },
		                href: item.url || undefined,
		                target: '_blank',
		                rel: 'noreferrer noopener',
		                title: `${item.title} — ${item.source}`,
		              },
		              h('span', { className: `nw-hot-num ${index < 3 ? `t${index + 1}` : ''}` }, String(index + 1).padStart(2, '0')),
		              h(
		                'span',
		                { className: 'nw-hot-main' },
		                h('span', { className: 'nw-hot-title' }, item.tag ? h('span', { className: 'nw-tag' }, item.tag) : null, item.title),
		                h(
		                  'span',
		                  { className: 'nw-hot-meta' },
		                  Number.isFinite(item.heat) ? h('span', { className: 'nw-heat' }, h('i', { style: { width: `${Math.max(6, Math.round((item.heat / maxHeat) * 100))}%` } })) : null,
		                  Number.isFinite(item.heat) ? h('span', { className: 'nw-heat-num' }, formatHeat(item.heat)) : null,
		                  h('span', { className: 'nw-src' }, item.source),
		                ),
		              ),
		            ),
		          ),
		    ),
		  )
		}

		/** 焦点卡里的一张图（加载失败则不渲染，露出后面的渐变）。 */
		function HeroMedia(props) {
		  const [failed, setFailed] = React.useState(false)
		  if (!props.src || failed) return null
		  return h('img', {
		    className: 'nw-hero-media',
		    src: props.src,
		    alt: '',
		    decoding: 'async',
		    referrerPolicy: 'no-referrer',
		    onError: () => setFailed(true),
		  })
		}

		/** 焦点卡：多张叠放轮播。 */
		function Hero(props) {
		  const items = props.items
		  if (items.length === 0) {
		    return h('div', { className: 'nw-card nw-hero', style: { gridArea: 'hero' } })
		  }
		  const active = Math.min(props.index, items.length - 1)
		  return h(
		    'section',
		    { className: 'nw-hero', style: { gridArea: 'hero', '--nw-cat': accentOf(items[active].category) } },
		    items.map((item, index) =>
		      h(
		        'div',
		        { key: item.id || `hero-${index}`, className: index === active ? 'nw-slide active' : 'nw-slide', style: { '--nw-cat': accentOf(item.category) } },
		        h(HeroMedia, { src: item.image }),
		        h('div', { className: 'nw-hero-scrim' }),
		        h('div', { className: 'nw-hero-wash' }),
		        item.image ? null : h('span', { className: 'nw-hero-mark', 'aria-hidden': 'true' }, categoryLabel(item.category).slice(0, 1)),
		        h(
		          'div',
		          { className: 'nw-hero-body' },
		          h('span', { className: 'nw-hero-chip' }, categoryLabel(item.category)),
		          h(
		            'a',
		            { className: 'nw-hero-link', href: item.url || undefined, target: '_blank', rel: 'noreferrer noopener' },
		            h('h2', { className: 'nw-hero-title' }, item.title),
		            item.summary ? h('p', { className: 'nw-hero-sub' }, item.summary) : null,
		          ),
		          h(
		            'div',
		            { className: 'nw-hero-foot' },
		            h('span', null, item.source),
		            item.publishedAt ? h('span', { className: 'nw-dot' }, '·') : null,
		            h(Ago, { iso: item.publishedAt }),
		            items.length > 1
		              ? h(
		                  'div',
		                  { className: 'nw-hero-dots' },
		                  items.map((_, dotIndex) =>
		                    h('button', {
		                      key: dotIndex,
		                      type: 'button',
		                      className: dotIndex === active ? 'nw-hero-dot active' : 'nw-hero-dot',
		                      onClick: () => props.onSelect(dotIndex),
		                      'aria-label': `第 ${dotIndex + 1} 条焦点`,
		                    }),
		                  ),
		                )
		              : null,
		          ),
		        ),
		      ),
		    ),
		    items.length > 1
		      ? h('div', { className: 'nw-hero-timer' }, h('i', { key: active, style: { '--nw-hero-ms': `${HERO_ROTATE_MS}ms` } }))
		      : null,
		  )
		}

		/** 倒计时环。 */
		function CountdownRing(props) {
		  if (props.seconds === null) {
		    return h('div', { className: 'nw-ring', title: '自动刷新已暂停' }, h('div', { className: 'nw-ring-label' }, '暂停'))
		  }
		  const period = Math.max(1, props.period)
		  const ratio = Math.min(1, Math.max(0, props.seconds / period))
		  const radius = 18
		  const circumference = 2 * Math.PI * radius
		  return h(
		    'div',
		    { className: 'nw-ring', title: '距离下次自动刷新' },
		    h(
		      'svg',
		      { width: 44, height: 44, viewBox: '0 0 44 44' },
		      h('circle', { cx: 22, cy: 22, r: radius, fill: 'none', stroke: 'var(--nw-line)', strokeWidth: 3 }),
		      h('circle', {
		        cx: 22,
		        cy: 22,
		        r: radius,
		        fill: 'none',
		        stroke: 'var(--nw-brand)',
		        strokeWidth: 3,
		        strokeLinecap: 'round',
		        strokeDasharray: circumference,
		        strokeDashoffset: circumference * (1 - ratio),
		        style: { transition: 'stroke-dashoffset 1s linear' },
		      }),
		    ),
		    h('div', { className: 'nw-ring-label' }, props.seconds >= 60 ? `${Math.ceil(props.seconds / 60)}′` : `${props.seconds}s`),
		  )
		}

		/** 源状态浮层。 */
		function SourceDetails(props) {
		  const sources = props.sources || []
		  const failed = sources.filter((source) => !source.ok)
		  const okCount = sources.length - failed.length
		  const tone = failed.length === 0 ? 'var(--nw-ok)' : okCount === 0 ? 'var(--nw-bad)' : 'var(--nw-warn)'
		  return h(
		    'details',
		    { className: 'nw-sources' },
		    h(
		      'summary',
		      { className: 'nw-btn', title: '各源抓取状态' },
		      h('span', { className: 'nw-status-dot', style: { background: tone, boxShadow: `0 0 9px ${tone}` } }),
		      `${okCount}/${sources.length} 源`,
		    ),
		    h(
		      'div',
		      { className: 'nw-src-pop' },
		      sources.map((source) =>
		        h(
		          'div',
		          { className: source.ok ? 'nw-src-row' : 'nw-src-row bad', key: source.id },
		          h('span', { className: 'nw-src-name' }, source.subtitle ? `${source.name}·${source.subtitle}` : source.name),
		          h('span', { className: 'nw-src-meta' }, source.ok ? `${source.count} 条 · ${source.ms}ms` : `失败：${source.error}`),
		        ),
		      ),
		    ),
		  )
		}

		/** 底部快讯。 */
		function Ticker(props) {
		  const items = props.items || []
		  if (items.length === 0) return null
		  const doubled = items.concat(items)
		  return h(
		    'div',
		    { className: 'nw-ticker' },
		    h('span', { className: 'nw-ticker-label' }, h('i'), '快讯'),
		    h(
		      'div',
		      { className: 'nw-ticker-view' },
		      h(
		        'div',
		        { className: 'nw-ticker-track' },
		        doubled.map((item, index) =>
		          h(
		            'a',
		            {
		              className: 'nw-ticker-item',
		              key: `${item.id || item.title}-${index}`,
		              href: item.url || undefined,
		              target: '_blank',
		              rel: 'noreferrer noopener',
		            },
		            h('b', null, String((index % items.length) + 1).padStart(2, '0')),
		            item.title,
		            h('span', null, `  ·  ${item.source}`),
		          ),
		        ),
		      ),
		    ),
		  )
		}

		/** 首屏骨架。 */
		function SkeletonStage() {
		  const areas = ['hero', 'hot', 'cn', 'world', 'tech']
		  return h(
		    'div',
		    { className: 'nw-stage' },
		    areas.map((area, areaIndex) =>
		      h(
		        'div',
		        { className: 'nw-skel', key: area, style: { gridArea: area } },
		        h('div', { className: 'nw-skel-line', style: { width: '42%', marginBottom: 14 } }),
		        h('div', { className: 'nw-skel-line', style: { width: '92%' } }),
		        h('div', { className: 'nw-skel-line', style: { width: '86%', marginTop: 9 } }),
		        h('div', { className: 'nw-skel-line', style: { width: '95%', marginTop: 9 } }),
		        areaIndex < 3 ? h('div', { className: 'nw-skel-line', style: { width: '64%', marginTop: 9 } }) : null,
		      ),
		    ),
		  )
		}

		/** 偏好编辑器：左边写自然语言，右边看 AI 解析出的规则。 */
		function PreferencesSheet(props) {
		  const prefs = props.prefs
		  return h(
		    'div',
		    { className: 'nw-modal' },
		    h('div', { className: 'nw-modal-backdrop', onClick: props.onClose, 'aria-hidden': 'true' }),
		    h(
		      'div',
		      { className: 'nw-sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': '我的偏好' },
		      h(
		        'div',
		        { className: 'nw-sheet-head' },
		        h(
		          'div',
		          { style: { flex: 1, minWidth: 0 } },
		          h('h3', null, '我的偏好'),
		          h('p', null, '用自然语言写你关心什么、不想看什么。保存后 AI 会解析成筛选规则，之后每次刷新都按它校准。'),
		        ),
		        h(
		          'button',
		          { type: 'button', className: 'nw-btn square', title: '关闭（Esc）', onClick: props.onClose },
		          h(CloseIcon),
		        ),
		      ),
		      h(
		        'div',
		        { className: 'nw-sheet-body' },
		        h('textarea', {
		          className: 'nw-draft',
		          value: props.draft,
		          spellCheck: false,
		          autoFocus: true,
		          readOnly: props.busy,
		          placeholder: '例如：我关心 AI 大模型和国内时政，不想看娱乐八卦和体育比分……',
		          onChange: (event) => props.onDraftChange(event.target.value),
		        }),
		        h(
		          'aside',
		          { className: 'nw-parse' },
		          h('h4', null, props.busy ? 'AI 解析中…' : 'AI 解析结果'),
		          h(ProfileChips, { profile: prefs ? prefs.profile : null, busy: props.busy }),
		          prefs && prefs.analysis
		            ? h(
		                'p',
		                { className: 'nw-parse-note' },
		                [
		                  prefs.analysis.source === 'ai' ? 'AI 解析' : prefs.analysis.source === 'none' ? '空偏好（不过滤）' : '离线规则',
		                  prefs.analysis.model,
		                  prefs.analysis.at ? relativeTime(prefs.analysis.at) : null,
		                ].filter(Boolean).join(' · '),
		              )
		            : null,
		          prefs && prefs.analysis && prefs.analysis.error
		            ? h('p', { className: 'nw-parse-note', style: { color: 'var(--nw-warn)' } }, prefs.analysis.error)
		            : null,
		        ),
		      ),
		      props.error ? h('div', { className: 'nw-alert' }, h('span', { className: 'nw-alert-text' }, props.error)) : null,
		      h(
		        'div',
		        { className: 'nw-sheet-foot' },
		        h(
		          'button',
		          {
		            type: 'button',
		            className: 'nw-btn',
		            disabled: props.busy || prefs === null || typeof prefs.defaultText !== 'string',
		            title: '把输入框恢复成默认偏好文本（保存后才生效）',
		            onClick: props.onResetDefault,
		          },
		          '恢复默认',
		        ),
		        h('span', { className: 'nw-spacer' }),
		        h('button', { type: 'button', className: 'nw-btn', onClick: props.onClose }, '取消'),
		        h(
		          'button',
		          { type: 'button', className: 'nw-btn primary', onClick: props.onSave, disabled: props.busy || prefs === null },
		          props.busy ? '解析中…' : '保存并校准',
		        ),
		      ),
		    ),
		  )
		}

		function ProfileChips(props) {
		  if (props.busy) return h('p', { className: 'nw-parse-note' }, '正在让 AI 读你的偏好…')
		  const profile = props.profile
		  if (!profile) return h('p', { className: 'nw-parse-note' }, '还没有解析结果。写好偏好后点「保存并校准」。')
		  return h(
		    'div',
		    { style: { display: 'flex', flexDirection: 'column' } },
		    profile.summary ? h('p', { className: 'nw-parse-note' }, `「${profile.summary}」`) : null,
		    chipGroup('关注', profile.include, 'good'),
		    chipGroup('屏蔽', profile.exclude, 'bad'),
		    chipGroup('语义描述', profile.excludeHints, 'warn'),
		    chipGroup('必看', profile.must, 'warn'),
		    chipGroup('屏蔽源', profile.muteSources, 'bad'),
		    chipGroup('加权源', profile.boostSources, 'good'),
		    chipGroup('板块优先级', profile.preferCategories, ''),
		  )
		}

		function chipGroup(label, list, tone) {
		  if (!Array.isArray(list) || list.length === 0) return null
		  return h(
		    'div',
		    { className: 'nw-chip-group' },
		    h('h4', null, label),
		    h(
		      'div',
		      { className: 'nw-chips' },
		      list.map((term, index) => h('span', { key: `${label}-${index}`, className: `nw-chip ${tone}` }, term)),
		    ),
		  )
		}

		/**
		 * 兜底：面板渲染抛错时给一行可读的原因，而不是整块空白。
		 * （面板在 shell 的 slot 里渲染，出错的信息只能落在面板自己身上。）
		 */
		class PanelBoundary extends React.Component {
		  constructor(props) {
		    super(props)
		    this.state = { error: null }
		  }

		  static getDerivedStateFromError(error) {
		    return { error }
		  }

		  componentDidCatch(error) {
		    console.error('[dsh-news-wall] 面板渲染失败：', error)
		  }

		  render() {
		    if (this.state.error !== null) {
		      const message = this.state.error && this.state.error.message ? this.state.error.message : String(this.state.error)
		      return h('div', { className: 'nw-root' }, h('div', { className: 'nw-fallback' }, `大屏渲染失败：${message}`))
		    }
		    return this.props.children
		  }
		}

		function PanelRoot() {
		  return h(PanelBoundary, null, h(NewsWall))
		}

		/* ────────────────────────────── 大屏主体 ────────────────────────────── */

		/**
		 * 焦点池：三个栏目各取前三条，共 9 个候选，去重后取 5 张。
		 * 有配图的排前面 —— 焦点卡的第一屏最好是一张真图；没有图时用
		 * 深色渐变 + 巨型标题撑版面（同样成立）。
		 */
		function buildFocus(categories) {
		  const byId = {}
		  for (const category of categories) byId[category.id] = category.items || []
		  const flat = [byId.cn || [], byId.world || [], byId.tech || []]
		    .map((list) => list.slice(0, 3))
		    .flat()
		  const ordered = flat.filter((item) => item.image).concat(flat.filter((item) => !item.image))
		  const seen = new Set()
		  const out = []
		  for (const item of ordered) {
		    if (seen.has(item.title)) continue
		    seen.add(item.title)
		    out.push(item)
		    if (out.length >= 5) break
		  }
		  return out
		}

		function NewsWall() {
		  const [data, setData] = React.useState(null)
		  const [error, setError] = React.useState(null)
		  const [loading, setLoading] = React.useState(true)
		  const [refreshing, setRefreshing] = React.useState(false)
		  const [now, setNow] = React.useState(() => Date.now())
		  const [auto, setAuto] = React.useState(true)
		  const [periodMin, setPeriodMin] = React.useState(DEFAULT_REFRESH_MIN)
		  const [nextAt, setNextAt] = React.useState(() => Date.now() + DEFAULT_REFRESH_MIN * 60_000)
		  const [isFullscreen, setIsFullscreen] = React.useState(false)
		  const [heroIndex, setHeroIndex] = React.useState(0)
		  const [prefsOpen, setPrefsOpen] = React.useState(false)
		  const [prefs, setPrefs] = React.useState(null)
		  const [draft, setDraft] = React.useState('')
		  const [prefsBusy, setPrefsBusy] = React.useState(false)
		  const [prefsError, setPrefsError] = React.useState(null)
		  const [notice, setNotice] = React.useState(null)

		  const rootRef = React.useRef(null)
		  const abortRef = React.useRef(null)
		  const aliveRef = React.useRef(true)

		  const load = React.useCallback(async (force) => {
		    if (abortRef.current) abortRef.current.abort()
		    const controller = new AbortController()
		    abortRef.current = controller
		    setRefreshing(true)
		    try {
		      let response = null
		      try {
		        response = await fetch(apiUrl(force), {
		          cache: 'no-store',
		          signal: controller.signal,
		          headers: { accept: 'application/json' },
		        })
		      } catch (networkError) {
		        const fallback = absoluteUrl(force)
		        if (fallback === null) throw networkError
		        response = await fetch(fallback, {
		          cache: 'no-store',
		          signal: controller.signal,
		          headers: { accept: 'application/json' },
		        })
		      }
		      if (!response.ok) throw new Error(`取数接口返回 HTTP ${response.status}`)
		      const payload = await response.json()
		      if (!aliveRef.current) return null
		      setData(payload)
		      setError(payload && payload.ok === false ? '所有新闻源当前都不可用，稍后会自动重试' : null)
		      return payload
		    } catch (caught) {
		      if (caught && caught.name === 'AbortError') return
		      if (!aliveRef.current) return
		      setError(describeError(caught))
		    } finally {
		      if (aliveRef.current) {
		        setRefreshing(false)
		        setLoading(false)
		      }
		    }
		  }, [])

		  React.useEffect(() => {
		    aliveRef.current = true
		    load(false)
		    return () => {
		      aliveRef.current = false
		      if (abortRef.current) abortRef.current.abort()
		    }
		  }, [load])

		  React.useEffect(() => {
		    const id = setInterval(() => setNow(Date.now()), 1000)
		    return () => clearInterval(id)
		  }, [])

		  const generatedAt = data ? data.generatedAt : null
		  React.useEffect(() => {
		    if (!auto) return undefined
		    const period = periodMin * 60_000
		    setNextAt(Date.now() + period)
		    const id = setTimeout(() => load(true), period)
		    return () => clearTimeout(id)
		  }, [auto, periodMin, load, generatedAt])

		  React.useEffect(() => {
		    const onVisible = () => {
		      if (document.visibilityState !== 'visible' || !data) return
		      const age = Date.now() - new Date(data.generatedAt).getTime()
		      if (age > periodMin * 60_000) load(true)
		    }
		    document.addEventListener('visibilitychange', onVisible)
		    return () => document.removeEventListener('visibilitychange', onVisible)
		  }, [data, periodMin, load])

		  React.useEffect(() => {
		    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement))
		    document.addEventListener('fullscreenchange', onChange)
		    return () => document.removeEventListener('fullscreenchange', onChange)
		  }, [])

		  const categories = (data && data.categories) || []
		  const focus = React.useMemo(() => buildFocus(categories), [categories])

		  // 新数据到了，焦点回到第一条
		  React.useEffect(() => {
		    setHeroIndex(0)
		  }, [generatedAt])

		  // 焦点轮播
		  React.useEffect(() => {
		    if (focus.length <= 1) return undefined
		    const id = setInterval(() => setHeroIndex((index) => (index + 1) % focus.length), HERO_ROTATE_MS)
		    return () => clearInterval(id)
		  }, [focus.length, generatedAt])

		  /* ── 偏好：打开 / 保存 ── */
		  const openPrefs = React.useCallback(async () => {
		    setPrefsOpen(true)
		    setPrefsError(null)
		    if (prefs !== null) return
		    setPrefsBusy(true)
		    try {
		      const payload = await requestPrefs('GET')
		      setPrefs(payload)
		      setDraft(payload.text)
		    } catch (caught) {
		      setPrefsError(describeError(caught))
		    } finally {
		      setPrefsBusy(false)
		    }
		  }, [prefs])

		  const savePrefs = React.useCallback(async () => {
		    setPrefsBusy(true)
		    setPrefsError(null)
		    try {
		      const payload = await requestPrefs('POST', { text: draft })
		      setPrefs(payload)
		      setDraft(payload.text)
		      // 校准后立刻取一次新数据，把过滤结果直接报出来
		      const refreshed = await load(true)
		      const filtered = refreshed && refreshed.preferences ? refreshed.preferences.filtered : 0
		      const semanticDropped = refreshed && refreshed.preferences ? refreshed.preferences.semanticDropped : 0
		      setNotice(
		        payload.analysis && payload.analysis.error
		          ? '已保存 · AI 解析降级为离线规则'
		          : `已按偏好校准 · 过滤 ${filtered} 条${semanticDropped > 0 ? `（语义 ${semanticDropped}）` : ''}`,
		      )
		    } catch (caught) {
		      setPrefsError(describeError(caught))
		    } finally {
		      setPrefsBusy(false)
		    }
		  }, [draft, load])

		  // Esc 关闭；提示条自动消失
		  React.useEffect(() => {
		    if (!prefsOpen) return undefined
		    const onKey = (event) => {
		      if (event && event.key === 'Escape') setPrefsOpen(false)
		    }
		    document.addEventListener('keydown', onKey)
		    return () => document.removeEventListener('keydown', onKey)
		  }, [prefsOpen])

		  React.useEffect(() => {
		    if (notice === null) return undefined
		    const id = setTimeout(() => setNotice(null), 3600)
		    return () => clearTimeout(id)
		  }, [notice])

		  const toggleFullscreen = React.useCallback(() => {
		    const node = rootRef.current
		    if (!node) return
		    try {
		      if (document.fullscreenElement) document.exitFullscreen()
		      else if (typeof node.requestFullscreen === 'function') node.requestFullscreen()
		    } catch {
		      /* 被拒绝时静默降级 */
		    }
		  }, [])

		  const clock = new Date(now)
		  const sources = (data && data.sources) || []
		  const stats = (data && data.stats) || { sources: 0, failed: 0, total: 0 }
		  const hot = categories.find((category) => category.id === 'hot')
		  const tickerItems = ((hot && hot.items) || []).slice(0, 14)
		  const secondsToNext = auto && nextAt ? Math.max(0, Math.round((nextAt - now) / 1000)) : null

		  return h(
		    'div',
		    { className: 'nw-root', ref: rootRef },
		    h('div', { className: 'nw-aurora', 'aria-hidden': 'true' }, h('span', { className: 'nw-blob a' }), h('span', { className: 'nw-blob b' }), h('span', { className: 'nw-blob c' })),
		    refreshing ? h('div', { className: 'nw-progress' }) : null,

		    h(
		      'div',
		      { className: 'nw-body' },

		      // 顶栏
		      h(
		        'header',
		        { className: 'nw-top' },
		        h(
		          'div',
		          { className: 'nw-brand' },
		          h('span', { className: 'nw-mark' }, '新'),
		          h('span', { className: 'nw-brand-text' }, h('span', { className: 'nw-brand-title' }, '时事大屏'), h('span', { className: 'nw-brand-sub' }, 'News Wall')),
		        ),
		        h('span', { className: 'nw-live' }, h('i'), 'LIVE'),
		        h(
		          'div',
		          { className: 'nw-actions' },
		          h(
		            'button',
		            {
		              type: 'button',
		              className: 'nw-btn square relative',
		              title: '偏好设置：用自然语言描述你想看什么',
		              onClick: openPrefs,
		            },
		            h(GearIcon),
		            data && data.preferences && data.preferences.active ? h('span', { className: 'nw-dotmark' }) : null,
		          ),
		          h(SourceDetails, { sources }),
		          h(
		            'div',
		            { className: 'nw-seg', title: '自动刷新间隔' },
		            REFRESH_CHOICES.map((minutes) =>
		              h(
		                'button',
		                {
		                  key: minutes,
		                  type: 'button',
		                  className: auto && periodMin === minutes ? 'nw-seg-item active' : 'nw-seg-item',
		                  onClick: () => {
		                    setPeriodMin(minutes)
		                    setAuto(true)
		                  },
		                },
		                `${minutes}m`,
		              ),
		            ),
		          ),
		          h(
		            'button',
		            { type: 'button', className: 'nw-btn', title: auto ? '暂停自动刷新' : '恢复自动刷新', onClick: () => setAuto((value) => !value) },
		            auto ? '自动' : '已暂停',
		          ),
		          h(
		            'button',
		            { type: 'button', className: 'nw-btn primary', onClick: () => load(true), disabled: refreshing },
		            h(RefreshIcon, { spinning: refreshing }),
		            refreshing ? '刷新中' : '刷新',
		          ),
		          h(
		            'button',
		            { type: 'button', className: 'nw-btn square', title: isFullscreen ? '退出全屏' : '全屏显示', onClick: toggleFullscreen },
		            h(ExpandIcon, { exit: isFullscreen }),
		          ),
		        ),
		      ),

		      // 报头
		      h(
		        'div',
		        { className: 'nw-masthead' },
		        h('div', { className: 'nw-clock' }, formatClock(clock)),
		        h('div', { className: 'nw-date' }, h('b', null, formatDateLabel(clock)), h('span', null, '实时新闻聚合 · 自动刷新')), 
		        h(
		          'div',
		          { className: 'nw-stat' },
		          h(
		            'div',
		            { className: 'nw-updated' },
		            h('b', null, data ? `更新于 ${relativeTime(data.generatedAt)}` : '正在加载…'),
		            h('span', null, data
		              ? `${stats.total} 条 · ${stats.sources - stats.failed}/${stats.sources} 源在线`
		                + (data.preferences && data.preferences.active
		                  ? ` · 偏好已生效${data.preferences.filtered > 0
		                    ? `（过滤 ${data.preferences.filtered} 条${data.preferences.semanticDropped > 0 ? `，含语义 ${data.preferences.semanticDropped}` : ''}）`
		                    : ''}`
		                  : '')
		              : '正在向各新闻源取数'),
		          ),
		          h(CountdownRing, { seconds: secondsToNext, period: periodMin * 60 }),
		        ),
		      ),

		      error
		        ? h(
		            'div',
		            { className: 'nw-alert' },
		            h('span', { className: 'nw-alert-text' }, `取数异常：${error}`),
		            h('button', { type: 'button', className: 'nw-btn', onClick: () => load(true) }, '重试'),
		          )
		        : null,

		      // 头版
		      loading && categories.length === 0
		        ? h(SkeletonStage)
		        : h(
		            'main',
		            { className: 'nw-stage' },
		            h(Hero, { items: focus, index: heroIndex, onSelect: setHeroIndex }),
		            hot ? h(HotRail, { category: hot }) : null,
		            ['cn', 'world', 'tech']
		              .map((id) => categories.find((category) => category.id === id))
		              .filter(Boolean)
		              .map((category) => h(FeedCard, { key: category.id, category, area: category.id })),
		          ),

		      h(Ticker, { items: tickerItems }),
		    ),

		    prefsOpen
		      ? h(PreferencesSheet, {
		          prefs,
		          draft,
		          busy: prefsBusy,
		          error: prefsError,
		          onClose: () => setPrefsOpen(false),
		          onDraftChange: setDraft,
		          onSave: savePrefs,
		          onResetDefault: () => {
		            if (prefs && typeof prefs.defaultText === 'string') setDraft(prefs.defaultText)
		          },
		        })
		      : null,
		    notice !== null ? h('div', { className: 'nw-toast' }, notice) : null,
		  )
		}

		/* ────────────────────────────── 插件本体 ────────────────────────────── */

		const name = PACKAGE_ID

		/** 已注册的槽位句柄：重复 apply（HMR / 面板重挂）时先撤掉旧的，保证新代码生效。 */
		let disposers = []

		function disposeSlots() {
		  for (const dispose of disposers) {
		    try {
		      dispose()
		    } catch (error) {
		      console.error('[dsh-news-wall] 卸载旧注册失败：', error)
		    }
		  }
		  disposers = []
		}

		/** 样式只注入一次，卸载时随 effect 一起清掉。 */
		function installStyles(ctx) {
		  if (typeof document === 'undefined' || !document.head) return
		  const previous = document.getElementById(STYLE_ID)
		  if (previous) previous.remove()
		  const node = document.createElement('style')
		  node.id = STYLE_ID
		  node.textContent = CSS
		  document.head.appendChild(node)
		  if (typeof ctx.effect === 'function') {
		    ctx.effect(() => () => node.remove())
		  }
		}

		function registerSlots(slots) {
		  disposeSlots()
		  disposers = [
		    slots.inject('sidebar.panellist', () =>
		      slots.register({ name: 'sidebar.panellist', id: PANEL_ID, order: 61, label: () => '时事大屏' }, PanelIcon),
		    ),
		    slots.inject('main', () => slots.register({ name: 'main', key: PANEL_ID }, PanelRoot)),
		  ]
		}

		function apply(ctx) {
		  installStyles(ctx)
		  if (typeof ctx.get !== 'function') return

		  let attempts = 0
		  let timer = null
		  if (typeof ctx.effect === 'function') {
		    ctx.effect(() => () => {
		      if (timer !== null) clearTimeout(timer)
		      disposeSlots()
		    })
		  }

		  const attempt = () => {
		    const slots = ctx.get('slots')
		    if (slots !== undefined && slots !== null) {
		      try {
		        registerSlots(slots)
		      } catch (error) {
		        console.error('[dsh-news-wall] 注册面板失败：', error)
		      }
		      return
		    }
		    attempts += 1
		    if (attempts <= 40) timer = setTimeout(attempt, 250)
		  }
		  attempt()
		}

		module.exports = { name, apply }
		return module.exports;
	}
});
