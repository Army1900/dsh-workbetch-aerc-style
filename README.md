# DSH Workbench · AERC Style

> 仓库源名：`dsh-workbetch-aerc-style`

**安装请看 [INSTALL.md](INSTALL.md)**：包含集合三个插件、独立 SDD 插件、验证和给 AI 安装代理的步骤。

AERC 风格的 DeepSeek Harness 工作站插件集合。三个插件仍然是**各自独立安装**的：主题与宠物是 bundle 包，新闻大屏目前通过 profile 的 `cordis.patch.yml` 插入行 + package 链接安装。本仓库是它们的统一源码与维护入口；不要把仓库根目录当成一个 bundle 安装。

## 插件

| 目录 | 包名 | 类型 | 说明 |
| --- | --- | --- | --- |
| `plugins/dsh-scifi-industrial` | `dsh-scifi-industrial` | 主题 bundle | AERC 重工业终端主题：启动序列、常驻机架、侧栏 chrome 接管、观测状态条。注意它会在 patch 里禁用宿主 `ui-sidebar` 并重新声明侧栏；停用/回退说明见插件自己的 README。 |
| `plugins/dsh-news-wall` | `dsh-news-wall` | 面板插件（profile patch 安装） | Mac 风格时事大屏：多源新闻聚合、偏好解析、Host 端点 + 浏览器面板。`lib/` 是构建产物，`src/` 是源。 |
| `plugins/dsh-digital-spider` | `dsh-digital-spider` | 宠物 overlay | 俯视八足宠物：`ORGANIC` 有机步态与 `CYBER` 足尖抓页、伸缩腿的不规律爬行两种动效，可在状态面板切换；远距目标会开信息流虫洞。 |

## 目录

```text
.
├── plugins/
│   ├── dsh-scifi-industrial/   # 主题 bundle
│   ├── dsh-news-wall/          # 新闻面板（profile patch）
│   └── dsh-digital-spider/     # 桌面宠物 bundle
├── scripts/
│   └── verify.mjs              # 集合级校验
├── plugins.json                # 插件清单（维护用，不是 DSH bundle）
├── package.json                # 集合仓库脚本，无运行时依赖
├── INSTALL.md                  # 统一安装指南
└── README.md
```

每个插件内部仍然有自己的 `package.json` 和 README；bundle 插件另有 `cordis.patch.yml`、`locale/*.json` 和 `icon.svg`。

## 配套仓库（不在本集合）

`dsh-e2e-dev-sdd` 是独立仓库 `git@github.com:Army1900/dsh-e2e-dev-sdd.git`，**不把源码放进本集合**。安装代理按 [INSTALL.md](INSTALL.md) 第 3 节把它克隆到集合外的目录，安装依赖后单独挂载；workbench 仓库只负责记录安装步骤，不记录 SDD 源码。

## 安装

统一安装指南见 [INSTALL.md](INSTALL.md)。要点：

- `dsh-scifi-industrial`、`dsh-digital-spider` 用 Plugin Manager 的 `install_bundle` 安装各自目录。
- `dsh-news-wall` 没有 `dsh.bundle.patch`，按 profile 的 `cordis.patch.yml` 插入行 + package link 安装，不能当 bundle 装。
- `dsh-e2e-dev-sdd` 由安装 AI 单独下载到集合外，不复制进本仓库。
- 不要在仓库根目录执行 `install_bundle`；profile 绝对路径和链接属于本机状态，不提交。

## 维护

```bash
node scripts/verify.mjs
# 或
npm run verify
```

校验内容：

- `plugins.json` 清单与三个插件目录一致；
- 每个插件的 `package.json` 名称、版本、bundle patch（bundle 类型）、Client 导出、locale `meta` 与图标（存在时校验）；
- 所有 `.js` / `.mjs` / `.cjs` 的 `node --check`；
- 所有 JSON 可解析。

### 新闻大屏需要构建

`dsh-news-wall` 的浏览器半部由 `scripts/build.mjs` 打包进 `lib/client.js`：

```bash
cd plugins/dsh-news-wall
node scripts/build.mjs
```

改完 `src/` 后要重新构建并把 `lib/` 一起提交；其他两个插件是普通源码，无构建步骤。

### 版本

三个插件版本各自独立（见各自 `package.json`）。修改某个插件时只提升该插件的版本；本仓库不会把它们合并成一个包，也不会锁死 DSH 版本——以当前 profile 安装的 Harness 版本和 Plugin Manager 的结果为准。

## AERC 共同语言

- 色彩：烟黑 / 骨白 / 氧化铁 / 国际安全橙，少量传感器青。
- 结构：1px 结构线、危险条纹、实心钢印、编号与观测语汇。
- 交互：主题、新闻大屏与蜘蛛共享同一套 HUD 边框、等宽标签和危险橙强调色，但各自保持可独立停用。

## 许可

各插件 `package.json` 标记为 MIT；新增文件沿用同一许可。
