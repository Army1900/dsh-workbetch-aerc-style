# 安装指南

本文件是 `dsh-workbetch-aerc-style` 的统一安装说明，面向人和 AI 安装代理。集合本身只包含三个插件；`dsh-e2e-dev-sdd` 是独立仓库，**源码不进入本集合**，由安装代理单独下载、构建和挂载。

## 0. 前置条件

- DeepSeek Harness Web / Desktop 0.2.x；本集合的插件按当前 Desktop profile 验证。
- Node.js >= 20；只有 `dsh-e2e-dev-sdd` 需要 `pnpm` 安装依赖/构建。
- 能访问 GitHub 上的两个仓库：
  - `git@github.com:Army1900/dsh-workbetch-aerc-style.git`（本集合）
  - `git@github.com:Army1900/dsh-e2e-dev-sdd.git`（SDD，独立安装）
  - `git@github.com:Army1900/openmind.git`（OpenMind 技能集合，蜘蛛点子使用）
- 桌面版的 profile 由应用管理，`dsh --profile desktop` 会被拒绝；不要用 `dsh plugin --profile desktop`。优先使用 DSH 的 Plugin Manager（AI 使用 `plugin_manager` 工具；GUI 里是插件管理里的安装 bundle）。

约定以下变量：

```sh
WORKBENCH_DIR="$HOME/WorkSpace-dsh/dsh-workbetch-aerc-style"
DSH_HOME="${DSH_HOME:-$HOME/.dsh}"
PROFILE_DIR="$DSH_HOME/profiles/desktop"   # Web profile 换成 profiles/web
EXTERNAL_DIR="$HOME/WorkSpace-dsh/external"
SDD_DIR="$EXTERNAL_DIR/dsh-e2e-dev-sdd"
OPENMIND_DIR="$EXTERNAL_DIR/openmind"
```

手动改 `package.json` 或 `cordis.patch.yml` 之前，先备份两个文件：

```sh
cd "$PROFILE_DIR"
cp package.json "package.json.bak-$(date +%Y%m%d-%H%M%S)"
cp cordis.patch.yml "cordis.patch.yml.bak-$(date +%Y%m%d-%H%M%S)"
```

桌面版改完 profile 后要**完全退出并重新打开应用**；只刷新页面不够。Client 插件热更新只需要刷新页面。

## 1. 获取集合

```sh
git clone git@github.com:Army1900/dsh-workbetch-aerc-style.git "$WORKBENCH_DIR"
cd "$WORKBENCH_DIR"
node scripts/verify.mjs
```

期望 `PASS: 62/62 checks passed.`。如果目录已存在，先 `git pull --ff-only`，再跑一次校验。

## 2. 安装集合内的三个插件

| 插件 | 安装方式 | 说明 |
| --- | --- | --- |
| `dsh-scifi-industrial` | `install_bundle` | AERC 主题 bundle；它会禁用并重新声明宿主 `ui-sidebar` |
| `dsh-digital-spider` | `install_bundle` | 桌面宠物 bundle；有 Host 端点和 `shell.overlay` Client |
| `dsh-news-wall` | profile patch + package link | 没有 `dsh.bundle.patch`，不能当 bundle 安装 |

### 2.1 主题和宠物（bundle）

用 Plugin Manager 的 `install_bundle`，target 分别是：

```text
$WORKBENCH_DIR/plugins/dsh-scifi-industrial
$WORKBENCH_DIR/plugins/dsh-digital-spider
```

AI 安装代理使用 `plugin_manager` 工具；GUI 用户使用插件管理的「安装 bundle」并选择上述目录。

- 如果返回 `already-installed`：先 `remove_bundle` 对应 bundle，再 `install_bundle` 新路径。不要同时保留旧路径和新路径。
- 安装结果应为 `application: applied`。随后用 `Config.listConfigs` 的 `entry` 查询确认 `packageDir` 在 `$WORKBENCH_DIR/plugins/...` 下。
- 主题会接管侧栏；如果侧栏空白，按 [主题 README](plugins/dsh-scifi-industrial/README.md) 检查 patch，别只删文件。
- 宠物安装/更新 Client 后，当前页面可能需要刷新一次才会重新挂载 `shell.overlay`。刷新后访问 `GET /dsh-digital-spider/state` 应返回 200。

### 2.2 新闻大屏（profile patch 安装）

`dsh-news-wall` 没有 `dsh.bundle.patch`，它靠 profile 的插入行加载，并靠 profile 依赖解析包。**不要对它调用 `install_bundle`。**

1. 让 profile 能解析包（桌面版由应用管理 `node_modules`，用链接）：

```sh
ln -sfn "$WORKBENCH_DIR/plugins/dsh-news-wall" "$PROFILE_DIR/node_modules/dsh-news-wall"
```

2. 在 `$PROFILE_DIR/package.json` 的 `dependencies` 中加入（已存在就改成这个路径）：

```json
"dsh-news-wall": "link:/absolute/path/to/dsh-workbetch-aerc-style/plugins/dsh-news-wall"
```

3. 在 `$PROFILE_DIR/cordis.patch.yml` 中保留/加入：

```yaml
- insert:
    - id: news-wall
      name: dsh-news-wall
```

4. 完全退出并重开应用。侧栏/面板应出现 News Wall。若 profile 里已经存在 `news-wall` 的插入行，不要重复插入。

新闻大屏的 `lib/` 是构建产物；改 `src/` 后：

```sh
cd "$WORKBENCH_DIR/plugins/dsh-news-wall"
node scripts/build.mjs
```

## 3. 单独安装 dsh-e2e-dev-sdd（AI 下载，源码不入库）

`dsh-e2e-dev-sdd` 有自己的仓库和发布节奏，**不要**把它的源码复制进 `dsh-workbetch-aerc-style`。安装代理把它下载到 `$EXTERNAL_DIR`，再单独挂载。

### 3.1 下载

```sh
mkdir -p "$EXTERNAL_DIR"
git clone git@github.com:Army1900/dsh-e2e-dev-sdd.git "$SDD_DIR"
# 已存在时：
# git -C "$SDD_DIR" pull --ff-only
```

仓库已提交跨平台构建产物 `lib/`（`lib/index.js`、`lib/client.js`），全新 clone 通常不需要构建。它的运行时依赖需要安装：

```sh
cd "$SDD_DIR"
pnpm install --frozen-lockfile
```

> 只有在 `lib/index.js` / `lib/client.js` 缺失，或你改了 `src/` 后，才运行 `pnpm build`。仓库的 README 里还有 Web profile、Windows 和手工桌面挂载的细节；冲突时以 SDD 自己的 README 为准。

### 3.2 安装（优先 Plugin Manager）

SDD 是标准 bundle，包含 `dsh.bundle.patch`。用 `install_bundle`，target 为：

```text
$SDD_DIR
```

- 如果返回 `already-installed` 且它本来就是 bundle 安装：先 `remove_bundle` 对应 bundle，再安装新路径；或者保留现有有效安装不重复装。
- 当前 profile 如果已经有手工的 `e2e-dev-sdd` 插入行/软链，**不要用 `remove_bundle`/`install_bundle` 叠加第二套**；要么继续用手工安装，要么先备份并清理旧软链、旧依赖和旧插入行，再改成 bundle 安装。只能保留一种。
- 安装后完全退出并重开应用，侧栏应出现「项目开发」分组和五个阶段入口。

### 3.3 桌面版手工挂载（Plugin Manager 不可用时的备选）

先按第 0 节备份 `package.json` 和 `cordis.patch.yml`，然后：

```sh
ln -sfn "$SDD_DIR" "$PROFILE_DIR/node_modules/dsh-e2e-dev-sdd"
```

在 `$PROFILE_DIR/package.json` 的 `dependencies` 中加入：

```json
"dsh-e2e-dev-sdd": "link:/absolute/path/to/dsh-e2e-dev-sdd"
```

在 `$PROFILE_DIR/cordis.patch.yml` 末尾加入（如果还没有）：

```yaml
- insert:
    - id: e2e-dev-sdd
      name: dsh-e2e-dev-sdd
```

桌面版必须完全退出重开。Web profile 可以使用 SDD README 里的 `dsh plugin --profile web add ...` / `github:Army1900/dsh-e2e-dev-sdd`；桌面版不要用这条命令。

## 4. 安装 OpenMind 技能集合（蜘蛛点子用）

`dsh-digital-spider` 在生成点子时会读取本地 OpenMind 技能集合。自动点子走两轮模型调用：第一轮只做技能路由（7 个技能，选一个技能和模式），第二轮按该技能自己的输出契约生成诗/梦境/反转/类比等形态。会话收尾会触发，空闲时也会低频自己冒（首次约 2.5–4.5 分钟，之后约 8–14 分钟）；状态面板里也可以手动指定形态。**OpenMind 不是 DSH bundle，不要 `install_bundle`；它只是集合外的一份 Markdown 数据。**

```sh
mkdir -p "$EXTERNAL_DIR"
git clone git@github.com:Army1900/openmind.git "$OPENMIND_DIR"
find "$OPENMIND_DIR/plugins" -name SKILL.md | wc -l
# 期望：7
```

不需要构建，也没有运行时依赖。蜘蛛按以下顺序自动发现：

1. 插件配置 `openmindDir`；
2. 环境变量 `DSH_OPENMIND_DIR`；
3. `$DSH_HOME/openmind`；
4. `$HOME/WorkSpace-dsh/external/openmind`（本节默认路径）；
5. `$HOME/WorkSpace/external/openmind`。

如果克隆到别处，设置 `DSH_OPENMIND_DIR`，或在插件配置里写 `openmindDir`。源码不进入 `dsh-workbetch-aerc-style`；仓库的 `.gitignore` 已忽略 `external/`，防止误提交。

验证：`GET /dsh-digital-spider/state` 的 `openmind.available` 应为 `true`，`skillCount` 为 `7`；否则看第 7 节。

## 5. 验证

```sh
cd "$WORKBENCH_DIR"
node scripts/verify.mjs

python3 - <<'PY'
import os
p = os.path.expanduser('~/.dsh/profiles/desktop/node_modules')
for name in ['dsh-scifi-industrial', 'dsh-digital-spider', 'dsh-news-wall', 'dsh-e2e-dev-sdd']:
    path = os.path.join(p, name)
    print(name, '->', os.path.realpath(path), 'exists=', os.path.exists(path))
PY
```

检查项：

- 四个包都能解析，三个集合插件指向 `$WORKBENCH_DIR/plugins/...`，SDD 指向 `$SDD_DIR`。
- 主题/启动序列、News Wall、Digital Spider 可见；SDD 的「项目开发」分组可见。
- `GET /dsh-digital-spider/state` 返回 200，`running` 字段正常；`openmind.available` 为 `true`，`skillCount` 为 7。
- `POST /dsh-digital-spider/idea` 带 `sessionId` + `skill` + `mode` 时返回 `format: 3` 的技能形态（例如 `poetic-essence` 的 `artifact.poem / attribution / interpretation / implication`）；不带 `skill` 的自动请求会先做一轮路由再生成。自动点子来自会话收尾，不再由 7 分钟随机定时器抽会话。
- 如果宠物在插件重载后消失，刷新页面；如果 SDD/主题在 profile 改动后不生效，完全退出重开应用。
- 安装后如果出现两个同名插入行或两个依赖链接，先还原备份，只保留一个。

## 6. 更新与卸载

- 集合更新：`git -C "$WORKBENCH_DIR" pull --ff-only` → `node scripts/verify.mjs` → 对改动的 bundle 执行 `remove_bundle`/`install_bundle` → 刷新页面或重开应用。
- 新闻大屏更新：拉取后按 2.2 重新链接；改了 `src/` 要重新 build。
- SDD 更新：`git -C "$SDD_DIR" pull --ff-only` → `pnpm install --frozen-lockfile` → 需要时 `pnpm build` → `remove_bundle`/`install_bundle` 或重开应用。**不要把 SDD 目录复制进 workbench。**
- OpenMind 更新：`git -C "$OPENMIND_DIR" pull --ff-only` 即可；蜘蛛在下次点子生成时重新读取，无需重启。
- 卸载 bundle：`remove_bundle`；手工挂载的新闻/SDD：还原 `package.json` / `cordis.patch.yml` 备份并删除对应 `node_modules` 链接。`.sdd/` 项目数据属于 workspace，不要随插件卸载删除。

## 7. 故障排查

- `already-installed`：先 `remove_bundle`，再 `install_bundle`；不要并行保留多个路径。
- 侧栏空白：主题 patch 同时禁用了 `ui-sidebar`；检查 `dsh-scifi-industrial` 是否 active，按它的 README 还原，不要只删 Client。
- Client 插件不出现：先刷新页面；仍不出现再检查 plugin manager 的客户端 bundle 状态。
- 桌面 profile 改动不生效：完全退出应用再开，不是刷新浏览器。
- SDD 构建/启动失败：确认 Node >= 20、`pnpm install` 成功、`lib/index.js` 与 `lib/client.js` 存在、DSH 版本满足 `>=0.2.0-rc.1`。
- 蜘蛛点子没有用上 OpenMind：确认 `$OPENMIND_DIR/plugins/*/skills/*/SKILL.md` 至少 7 个、`GET /state` 的 `openmind.available` 为 true；路径不对时设置 `DSH_OPENMIND_DIR` 或插件 `openmindDir`。OpenMind 不是 bundle，不要用 `install_bundle` 安装。
- 网络导致 GitHub SSH 22 端口断开时，推送/拉取可以临时使用 `ssh.github.com:443`；安装本身优先用本地 clone，不要在目标机器上重复下载大依赖。

## 8. 给 AI 安装代理的提示词

把下面这段直接交给安装 AI（它应能使用 Plugin Manager / `plugin_manager` 工具）：

```text
请按 <WORKBENCH_DIR>/INSTALL.md 安装 AERC 工作站插件。要求：
1. 先确认 DSH 版本和 profile（desktop 由应用管理），备份 profile 的 package.json 与 cordis.patch.yml；不要用 dsh plugin --profile desktop。
2. 安装 dsh-scifi-industrial 和 dsh-digital-spider：优先 plugin_manager 的 install_bundle，target 使用集合里的绝对路径；遇到 already-installed 先 remove_bundle 再装。
3. 按 2.2 节处理 dsh-news-wall 的 profile patch + package link；它没有 bundle patch，不要对它 install_bundle；不要重复插入 news-wall 行。
4. 把 dsh-e2e-dev-sdd 克隆到 <EXTERNAL_DIR>/dsh-e2e-dev-sdd，不要复制进 dsh-workbetch-aerc-style；执行 pnpm install --frozen-lockfile；lib/ 已提交，只有缺失或改过 src/ 才 pnpm build；然后用 install_bundle 安装，或按 SDD README 的桌面手工挂载，二选一，不要叠加。
5. 把 openmind 克隆到 <EXTERNAL_DIR>/openmind，不要复制进 dsh-workbetch-aerc-style，也不要 install_bundle；它只是蜘蛛读的 Markdown 技能集合。确认 `find <OPENMIND_DIR>/plugins -name SKILL.md | wc -l` 为 7，并确认蜘蛛 state 的 openmind.available 为 true。
6. 每一步报告 install_bundle / remove_bundle 的结果、profile 链接和验证结果；最后确认四个包可解析、蜘蛛 state 200 且 openmind 为 7 个技能、SDD 分组可见。桌面 profile 改动后完全退出重开应用，Client 改动后刷新页面。
7. 不要修改与安装无关的文件；不要把 SDD/OpenMind 源码、.sdd 项目数据或本机 profile 状态提交到 workbench 仓库。
```

## 9. 本集合包含什么

```text
plugins/dsh-scifi-industrial/   AERC 主题 bundle
plugins/dsh-news-wall/          News Wall（profile patch 安装）
plugins/dsh-digital-spider/     Digital Spider bundle
scripts/verify.mjs              集合校验
plugins.json                    插件清单
```

`dsh-e2e-dev-sdd` 与 `openmind` **不在**上述目录中；它们只作为独立仓库按第 3、4 节安装，源码不进入本集合。
