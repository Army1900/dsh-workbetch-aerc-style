# 时事大屏 · dsh-news-wall

DSH 网页面板插件：**挂在副屏上的 Mac 风格新闻大屏**。侧边栏点一下图标，中央面板是一版实时「头版」—— 深色大图焦点卡轮播 + 全网热榜光轨 + 国内/国际/科技三栏快讯 + 底部快讯跑马灯，**并按你的自然语言偏好过滤和排序**。

## 偏好（AI 校准）

顶栏最左边的滑杆按钮打开「我的偏好」：

- 里面是一段 **markdown**，默认文本已经写好一份（关注时政 / AI / 国际，屏蔽娱乐 / 体育 / 带货，必看灾害预警）。直接改成你自己的话就行。
- 点「保存并校准」→ Host 把这段话交给模型解析成结构化规则：

  ```json
  { "summary": "…", "include": ["芯片"], "exclude": ["娱乐"],
    "must": ["突发"], "preferCategories": ["tech"], "muteSources": [], "boostSources": [] }
  ```

- 解析结果会以标签形式显示在右侧（关注 / 屏蔽 / 必看 / 屏蔽源 / 加权源 / 板块优先级），旁边标注解析来源、模型名与时间。
- **之后每次刷新都按这套规则过滤**：`exclude` 命中直接丢、`must` 命中加 1000 分并打「必看」标记、`include` 每个词 +120（标题命中再 +60）、偏好板块 / 加权源 / 新鲜度小幅加分，最后按分数排序并截断。
- 面板上会显示「偏好已生效（过滤 N）」；清空文本保存 = 回到不过滤。
- **AI 不可用时不会烂掉**：自动退化成离线关键词规则（按 markdown 小节 + 项目符号抠词），并在界面上注明「离线规则」。

规则存在 `$DSH_HOME/news-wall/preferences.json`（人可读、可手改），保存用 tmp + rename；同一条规则集有指纹，偏好一变缓存立即失效。

## 版式

- **焦点卡**：编辑部头版式的大卡。有配图时铺满照片 + 底部渐变压暗；没有图时用深色渐变 + 巨型水印字撑住版面。5 条轮播（9 秒一条），顶部一条进度光轨，右下圆点可手点切换。有配图的条目排在前面。
- **全网热榜**：巨号名次 `01–20`，前三名金银铜渐变、其余描边字；每条带热度条与来源。卡片描边是一圈 7 秒转一圈的锥形光轨。
- **三栏快讯**：国内要闻 / 国际时事 / 科技 · AI。色条标记 + 相对时间上色（1 小时内绿、6 小时内琥珀、更久灰并降透明度）+ 英文源标 `EN`；有配图的条目在右侧出 46px 缩略图；命中「必看」的条目带金色角标。
- **报头**：46px 等宽数字大时钟（秒级跳动）+ 日期 + 「更新于 X 分钟前」+ 倒计时环。
- **底色**：三团缓慢漂移的极光色雾，玻璃卡片浮在上面；`prefers-reduced-motion` 下关掉漂移、跑马灯与轮播动画。

## 刷新

默认 5 分钟自动刷新（可切 1/5/15 分钟，可暂停），随时可点「刷新」立即拉取；回到前台且数据过期时自动补一次；Host 侧 120 秒缓存兜底（按偏好指纹区分）。

## 安装状态

已装进 `desktop` profile（App 正在用的就是它）：`~/.dsh/profiles/desktop/node_modules/dsh-news-wall` 是指向本目录的软链，profile 的 `cordis.patch.yml` 里有 `- insert: [{ id: news-wall, name: dsh-news-wall }]`。

改完源码执行 `npm run build`，然后刷新页面。**只改 Client 半部时刷新页面即可；改了 Host 半部（取数 / 解析 / 偏好）需要重启 App。** 客户端会重复 apply（HMR / 面板重挂），插件里先撤旧注册再注册，保证新代码生效。

## 架构

```
src/index.mjs    Host 半部：取数端点 /dsh-news-wall/feed、偏好端点 /dsh-news-wall/prefs、index 启动配置注入
src/prefs.mjs    偏好：默认文本、落盘、模型解析（严格 JSON）、离线兜底、过滤排序评分
src/feed.mjs     聚合层：并发抓取 → 轮转交错 → 标题去重 → 配图去重 → 按偏好过滤排序 → 120s 缓存
src/sources.mjs  数据源层：21 个源 + RSS/Atom/RDF/JSON/内嵌 JSON 解析 + 字符集嗅探 + 配图提取
src/client.js    Client 半部：侧边栏图标 + 中央面板 + 偏好编辑器，全部 UI 在这里
scripts/         build（构建）/ probe（探源）/ route-smoke（接口 + 偏好全链路自检）
```

**为什么取数走 Host**：浏览器直连这些新闻站会被 CORS 挡住，部分接口还要自定义 UA / Referer；偏好解析也要用 Host 侧的模型服务。Host 同源出 JSON 端点，客户端只发同源请求。

**为什么端点不在 `/api` 下**：`/api` 是框架自己的前缀路由（带鉴权与 RPC 桥），注册在它下面的精确路由会被前缀匹配先吃掉。因此用 `/dsh-news-wall/*`，并做了「回环地址 + 非跨站」栅栏。

**为什么偏好存文件而不是存储服务**：`storageDomain.open()` 要求 zod schema，会给这个零依赖插件引入跨 profile 的运行时依赖；一段偏好用 `$DSH_HOME` 下的 JSON 更稳、也方便你直接看和改。

**为什么不用打包器**：DSH 的客户端模块表只提供 `react` / `react-dom` / `cordis` / `dsh-client-ui-slots` 等少数平台模块，其余都要内联。本插件除 `react` 外零依赖，`scripts/build.mjs` 用一段 banner/footer 把 `src/client.js` 包成 `window.__ModuleLoader__.load({ id, factory })` 即可。

## 数据源（21 个，全部本机实测）

| 板块 | 源 |
| --- | --- |
| 国内要闻 | 中国新闻网·即时、界面新闻、Google 新闻中文 |
| 国际时事 | 中新网·国际、法广中文 RFI、BBC News World、德国之声中文、纽约时报中文网 |
| 科技 · AI | IT之家、36氪、量子位、InfoQ 中文、少数派、爱范儿、The Verge、Ars Technica |
| 全网热榜 | 微博热搜、知乎热榜、头条热榜、抖音热点、百度热搜 |

已剔除的「看着能用、其实停更」的源：新华网 RSS（停更于 2022-12）、人民网 RSS（停更于 2025-06）、澎湃/财新官方 RSS（下线或需签名）、联合早报（≈1 年前）、聚合 API `vvhan` / `tenapi` / `alapi`（全部不可用或需令牌）。

**配图**：从 `enclosure` → `media:content` / `media:thumbnail` → 正文首个 `<img>` 依次提取，剔除追踪像素与矢量图；同一张图全站只保留一次。某个源的图不可信时在源定义里加 `images: false` —— 界面新闻 RSS 给的是 2022 年的品牌占位图，已关。

## 自检

```bash
node scripts/probe.mjs --dump 4     # 逐源可用性、耗时、最新一条时龄
node scripts/route-smoke.mjs        # 取数 + 偏好 + AI 路径 + 栅栏，40+ 项断言
```

`route-smoke` 会把偏好写进临时 `DSH_HOME`，跑完删掉，不碰你的真实偏好。

## 扩展

- **加一个源**：往 `SOURCES` 里加一行（`kind` 选 `rss` / `json` / `html`，必要时 `headers`、`images: false`），RSS 不用写解析器。
- **加一个板块**：`CATEGORIES` 加一项 + `CATEGORY_LIMIT` 配上限，客户端网格会自动多一格（`grid-template-areas` 需要补一行）。
- **加一条规则**：`prefs.mjs` 的 `PROFILE_SYSTEM_PROMPT` 加字段 + `normalizeProfile` 收敛 + `applyPreferences` 里计分，客户端 `ProfileChips` 里加一组标签即可。
- **换成全屏浮层**：`main` 面板的 key 与 `sidebar.panellist` 的 id 都是 `news-wall`，改 `registerSlots()` 即可换槽位。
