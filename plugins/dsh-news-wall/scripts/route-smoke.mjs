/**
 * Host 半部冒烟测试：不依赖 DSH 运行时，用假 ctx 把路由装起来，再用假 req/res 真跑请求。
 *
 * 覆盖：
 *   1. 取数端点：真实抓取、缓存、安全栅栏、index 注入；
 *   2. 偏好端点：GET 取默认值、POST 需要 JSON、保存后用离线规则解析、
 *      偏好生效后取数结果被过滤、清空偏好后恢复全量。
 *
 *   node scripts/route-smoke.mjs
 *
 * 偏好文件写到临时 DSH_HOME，跑完删掉，不碰用户真实偏好。
 */

import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// prefs.mjs 只在调用时读 DSH_HOME，所以这里设置能生效。
const sandboxHome = mkdtempSync(join(tmpdir(), 'dsh-news-wall-smoke-'))
process.env.DSH_HOME = sandboxHome

// 用 lib/（真正安装的产物）跑，而不是 src/：少拷一个模块这种问题只有产物才暴露。
// 想直接验源码：SMOKE_TARGET=src node scripts/route-smoke.mjs
for (const file of ['index.mjs', 'feed.mjs', 'sources.mjs', 'prefs.mjs', 'client.js']) {
  try {
    const source = statSync(new URL(`../src/${file}`, import.meta.url))
    const built = statSync(new URL(`../lib/${file}`, import.meta.url))
    if (source.mtimeMs > built.mtimeMs + 1000) {
      console.log(`⚠ src/${file} 比 lib/ 新，先跑 npm run build 再测`)
    }
  } catch {
    /* 首次构建前不做检查 */
  }
}

const target = process.env.SMOKE_TARGET === 'src' ? '../src/index.mjs' : '../lib/index.mjs'
const { apply, FEED_PATH, PREFS_PATH } = await import(target)

let failures = 0

function check(name, condition, detail = '') {
  const mark = condition ? '✓' : '✗'
  if (!condition) failures += 1
  console.log(`${mark} ${name}${detail ? `  ${detail}` : ''}`)
}

/** 装一遍插件：假 ctx 只实现 apply 真正用到的那几个成员。 */
function install() {
  const routes = []
  const taps = []
  const host = {
    webServer: {
      port: 19387,
      register: (route) => {
        routes.push(route)
        return () => {}
      },
      tapIndex: (transform) => {
        taps.push(transform)
        return () => {}
      },
    },
    effect: (callback) => {
      const disposer = callback()
      return typeof disposer === 'function' ? disposer : () => {}
    },
    // 真实 Cordis ctx 一定有 get；路由里用它可选读取 llm / agentDefaultModel。
    get: () => undefined,
  }
  apply({
    plugin: (fn) => fn(host),
    get: () => undefined,
    effect: () => () => {},
  })
  return { routes, taps }
}

/** 造一个够用的 ServerResponse 替身。 */
function makeRes() {
  const state = { status: 0, headers: null, body: '' }
  return {
    state,
    writeHead(status, headers) {
      state.status = status
      state.headers = headers
    },
    end(body) {
      state.body = body ?? ''
    },
  }
}

/** 造一个可被 `for await` 消费的 IncomingMessage 替身。 */
function makeReq({ method = 'GET', url = FEED_PATH, headers = {}, address = '127.0.0.1', body = undefined } = {}) {
  const request = { method, url, headers, socket: { remoteAddress: address } }
  const chunks = body === undefined ? [] : [Buffer.from(typeof body === 'string' ? body : JSON.stringify(body))]
  request[Symbol.asyncIterator] = async function* iterate() {
    for (const chunk of chunks) yield chunk
  }
  return request
}

function parseBody(res) {
  try {
    return JSON.parse(res.state.body)
  } catch {
    return null
  }
}

const { routes, taps } = install()
const feedRoute = routes.find((route) => route.path === FEED_PATH)
const prefsRoute = routes.find((route) => route.path === PREFS_PATH)

check('注册了取数路由', feedRoute !== undefined, `routes=${routes.length}`)
check('注册了偏好路由', prefsRoute !== undefined)
check('注册了 index 注入', taps.length === 1, `taps=${taps.length}`)
if (feedRoute === undefined || prefsRoute === undefined) {
  console.log('\n路由缺失，后续用例无法继续')
  process.exit(1)
}

// ── 取数端点（真实抓取）─────────────────────────────────────────────────
console.log('\n真实抓取中（约 3-6 秒）…')
const res = makeRes()
await feedRoute.handler(makeReq(), res)
check('状态码 200', res.state.status === 200, `status=${res.state.status}`)

let payload = parseBody(res)
if (payload === null) check('响应是合法 JSON', false)
else {
  check('ok = true', payload.ok === true)
  check('四个板块齐全', Array.isArray(payload.categories) && payload.categories.length === 4, `categories=${payload.categories?.length}`)
  check('拿到了条目', payload.stats.total > 30, `total=${payload.stats.total}`)
  check('多数源可用', payload.stats.failed <= 2, `failed=${payload.stats.failed}/${payload.stats.sources}`)
  check('条目字段完整', payload.categories[0].items.every((item) => typeof item.title === 'string' && typeof item.id === 'string'))
  check('榜单带热度与名次', payload.categories.find((c) => c.id === 'hot').items.some((item) => Number.isFinite(item.rank)))
  check('响应头禁止缓存', res.state.headers?.['cache-control'] === 'no-store')
  check('未设偏好时不过滤', payload.preferences.active === false && payload.preferences.filtered === 0)
}

// ── 缓存 ──────────────────────────────────────────────────────────────
const cached = makeRes()
const cachedStart = Date.now()
await feedRoute.handler(makeReq(), cached)
const cachedMs = Date.now() - cachedStart
check('二次请求命中缓存', parseBody(cached)?.cached === true && cachedMs < 800, `${cachedMs}ms`)

// ── 安全栅栏 ──────────────────────────────────────────────────────────
const crossSite = makeRes()
await feedRoute.handler(makeReq({ headers: { 'sec-fetch-site': 'cross-site' } }), crossSite)
check('跨站请求被拒（403）', crossSite.state.status === 403, `status=${crossSite.state.status}`)

const remote = makeRes()
await feedRoute.handler(makeReq({ address: '10.0.0.8' }), remote)
check('非回环地址被拒（403）', remote.state.status === 403, `status=${remote.state.status}`)

const notGet = makeRes()
await feedRoute.handler(makeReq({ method: 'POST' }), notGet)
check('取数端点非 GET/HEAD 被拒（405）', notGet.state.status === 405, `status=${notGet.state.status}`)

const sameSite = makeRes()
await feedRoute.handler(makeReq({ headers: { 'sec-fetch-site': 'same-origin' } }), sameSite)
check('同源请求放行（200）', sameSite.state.status === 200, `status=${sameSite.state.status}`)

// ── 偏好端点：读取默认值 ───────────────────────────────────────────────
console.log('')
const prefsGet = makeRes()
await prefsRoute.handler(makeReq({ url: PREFS_PATH }), prefsGet)
const defaults = parseBody(prefsGet)
check('偏好 GET 200', prefsGet.state.status === 200, `status=${prefsGet.state.status}`)
check('首次返回默认文本', defaults !== null && defaults.isDefault === true && typeof defaults.defaultText === 'string')
check('默认文本是 markdown', Boolean(defaults && defaults.defaultText.includes('##')))
check('默认还没有规则', defaults !== null && defaults.profile === null)

// ── 偏好端点：请求校验 ─────────────────────────────────────────────────
const wrongType = makeRes()
await prefsRoute.handler(
  makeReq({ method: 'POST', url: PREFS_PATH, headers: { 'content-type': 'text/plain' }, body: 'hi' }),
  wrongType,
)
check('非 JSON 请求体被拒（415）', wrongType.state.status === 415, `status=${wrongType.state.status}`)

const noText = makeRes()
await prefsRoute.handler(
  makeReq({ method: 'POST', url: PREFS_PATH, headers: { 'content-type': 'application/json' }, body: { nope: 1 } }),
  noText,
)
check('缺 text 被拒（400）', noText.state.status === 400, `status=${noText.state.status}`)

const crossSitePrefs = makeRes()
await prefsRoute.handler(
  makeReq({ method: 'POST', url: PREFS_PATH, headers: { 'content-type': 'application/json', 'sec-fetch-site': 'cross-site' }, body: { text: 'x' } }),
  crossSitePrefs,
)
check('偏好端点跨站被拒（403）', crossSitePrefs.state.status === 403, `status=${crossSitePrefs.state.status}`)

// ── 偏好端点：保存 + 解析（无 LLM → 离线规则）──────────────────────────
const MARKDOWN = [
  '# 测试偏好',
  '',
  '## 我关注',
  '- 芯片、半导体',
  '',
  '## 我不想看',
  '- 中国、体育',
].join('\n')

const saved = makeRes()
await prefsRoute.handler(
  makeReq({ method: 'POST', url: PREFS_PATH, headers: { 'content-type': 'application/json' }, body: { text: MARKDOWN } }),
  saved,
)
const savedPayload = parseBody(saved)
check('保存偏好 200', saved.state.status === 200, `status=${saved.state.status}`)
check('文本已回写', savedPayload !== null && savedPayload.text === MARKDOWN)
check('不再是默认文本', savedPayload !== null && savedPayload.isDefault === false)
check(
  '离线规则抓到关注词',
  savedPayload?.profile?.include?.includes('芯片') === true,
  JSON.stringify(savedPayload?.profile?.include ?? []),
)
check(
  '离线规则抓到屏蔽词',
  savedPayload?.profile?.exclude?.includes('中国') === true,
  JSON.stringify(savedPayload?.profile?.exclude ?? []),
)
check('解析来源标为离线', savedPayload !== null && savedPayload.analysis?.source === 'heuristic', savedPayload?.analysis?.source)

const persisted = join(sandboxHome, 'news-wall', 'preferences.json')
let persistedOk = false
try {
  persistedOk = JSON.parse(readFileSync(persisted, 'utf8')).text === MARKDOWN
} catch {
  persistedOk = false
}
check('偏好已落盘', persistedOk, persisted)

// ── 偏好生效：取数结果被过滤 ───────────────────────────────────────────
console.log('\n按偏好重新取数中（约 3-6 秒）…')
const filtered = makeRes()
await feedRoute.handler(makeReq({ url: `${FEED_PATH}?refresh=1` }), filtered)
const filteredPayload = parseBody(filtered)
check('偏好生效', filteredPayload?.preferences?.active === true, JSON.stringify(filteredPayload?.preferences))
check('确实过滤掉了条目', (filteredPayload?.preferences?.filtered ?? 0) > 0, `filtered=${filteredPayload?.preferences?.filtered}`)
const titles = filteredPayload ? filteredPayload.categories.flatMap((category) => category.items.map((item) => item.title)) : []
check('结果里没有屏蔽词', titles.length > 0 && titles.every((title) => !title.includes('中国')), `titles=${titles.length}`)

// ── 清空偏好：恢复全量 ─────────────────────────────────────────────────
const cleared = makeRes()
await prefsRoute.handler(
  makeReq({ method: 'POST', url: PREFS_PATH, headers: { 'content-type': 'application/json' }, body: { text: '' } }),
  cleared,
)
check('清空后没有规则', parseBody(cleared)?.profile === null)

const clearedFeed = makeRes()
await feedRoute.handler(makeReq({ url: `${FEED_PATH}?refresh=1` }), clearedFeed)
check('清空后不再过滤', parseBody(clearedFeed)?.preferences?.active === false)

// ── AI 路径：假模型返回带围栏的 JSON，验证解析与来源标记 ──────────────
const AI_JSON = {
  summary: '只看芯片与国际局势，屏蔽娱乐',
  include: ['芯片', '半导体', '地缘'],
  exclude: ['娱乐', '明星'],
  must: ['突发'],
  preferCategories: ['tech', 'world'],
  muteSources: [],
  boostSources: [],
}
const aiRoutes = []
const aiHost = {
  webServer: {
    port: 19388,
    register: (route) => {
      aiRoutes.push(route)
      return () => {}
    },
    tapIndex: () => () => {},
  },
  effect: (callback) => {
    callback()
    return () => {}
  },
  get: (name) => {
    if (name === 'agentDefaultModel') return { currentSelection: () => ({ provider: 'fake', model: 'fake-model' }) }
    if (name === 'llm') {
      return {
        listProviders: () => [{ id: 'fake' }],
        listModels: async () => [{ id: 'fake-model' }],
        // 模型经常把 JSON 包在 ```json 围栏里，解析必须容错
        stream: async function* stream() {
          yield { type: 'block-start', index: 0, blockType: 'text' }
          yield { type: 'text-delta', index: 0, text: '```json\n' }
          yield { type: 'text-delta', index: 0, text: JSON.stringify(AI_JSON) }
          yield { type: 'text-delta', index: 0, text: '\n```' }
          yield { type: 'finish', reason: { kind: 'stop' } }
        },
      }
    }
    return undefined
  },
}
apply({ plugin: (fn) => fn(aiHost), get: () => undefined, effect: () => () => {} })
const aiPrefsRoute = aiRoutes.find((route) => route.path === PREFS_PATH)
check('AI 路径：偏好路由已注册', aiPrefsRoute !== undefined)

const aiSaved = makeRes()
await aiPrefsRoute.handler(
  makeReq({ method: 'POST', url: PREFS_PATH, headers: { 'content-type': 'application/json' }, body: { text: MARKDOWN } }),
  aiSaved,
)
const aiPayload = parseBody(aiSaved)
check('AI 路径：保存 200', aiSaved.state.status === 200, `status=${aiSaved.state.status}`)
check('AI 路径：来源标为 ai', aiPayload?.analysis?.source === 'ai', aiPayload?.analysis?.source)
check('AI 路径：记录了模型名', aiPayload?.analysis?.model === 'fake/fake-model', aiPayload?.analysis?.model)
check('AI 路径：围栏 JSON 被解析', aiPayload?.profile?.include?.join(',') === '芯片,半导体,地缘', JSON.stringify(aiPayload?.profile?.include))
check('AI 路径：must 保留', aiPayload?.profile?.must?.includes('突发') === true, JSON.stringify(aiPayload?.profile?.must))
check('AI 路径：板块优先级保留', aiPayload?.profile?.preferCategories?.join(',') === 'tech,world', JSON.stringify(aiPayload?.profile?.preferCategories))
check('AI 路径：摘要写入', aiPayload?.profile?.summary === AI_JSON.summary, aiPayload?.profile?.summary)

// ── 语义过滤：关键词之外，让模型逐条看标题 ───────────────────────────
const semanticRoutes = []
let classifyCalls = 0
const semanticHost = {
  webServer: {
    port: 19389,
    register: (route) => {
      semanticRoutes.push(route)
      return () => {}
    },
    tapIndex: () => () => {},
  },
  effect: (callback) => {
    callback()
    return () => {}
  },
  get: (name) => {
    if (name === 'agentDefaultModel') return { currentSelection: () => ({ provider: 'fake', model: 'fake-model' }) }
    if (name === 'llm') {
      return {
        listProviders: () => [{ id: 'fake' }],
        listModels: async () => [{ id: 'fake-model' }],
        // 分类调用：把每批的第 0 条判为「丢弃」
        stream: async function* stream() {
          classifyCalls += 1
          yield { type: 'text-delta', index: 0, text: '{"drop":[0]}' }
          yield { type: 'finish', reason: { kind: 'stop' } }
        },
      }
    }
    return undefined
  },
}
apply({ plugin: (fn) => fn(semanticHost), get: () => undefined, effect: () => () => {} })
const semanticFeedRoute = semanticRoutes.find((route) => route.path === FEED_PATH)
check('语义过滤：取数路由已注册', semanticFeedRoute !== undefined)

const semanticRes = makeRes()
await semanticFeedRoute.handler(makeReq({ url: `${FEED_PATH}?refresh=1` }), semanticRes)
const semanticPayload = parseBody(semanticRes)
check('语义过滤已启用', semanticPayload?.preferences?.semantic?.available === true, JSON.stringify(semanticPayload?.preferences?.semantic))
check('语义判断调用了模型', classifyCalls > 0, `calls=${classifyCalls}`)
check('语义丢掉了条目', (semanticPayload?.preferences?.semanticDropped ?? 0) > 0, `dropped=${semanticPayload?.preferences?.semanticDropped}`)
check(
  '过滤总数包含语义丢弃',
  (semanticPayload?.preferences?.filtered ?? 0) > (semanticPayload?.preferences?.keywordFiltered ?? 0),
  `filtered=${semanticPayload?.preferences?.filtered} keyword=${semanticPayload?.preferences?.keywordFiltered}`,
)

// ── 语义缓存：同一标题第二轮不再调模型 ────────────────────────────────
const semanticModule = await import(process.env.SMOKE_TARGET === 'src' ? '../src/semantic.mjs' : '../lib/semantic.mjs')
const unitProfile = {
  summary: '',
  include: ['芯片'],
  exclude: ['明星'],
  excludeHints: ['明星恋情与绯闻'],
  must: [],
  preferCategories: [],
  muteSources: [],
  boostSources: [],
}
const cacheItems = [
  { id: 'a', title: '某明星官宣恋情', source: '微博热搜' },
  { id: 'b', title: '英伟达市值下滑', source: '知乎热榜' },
]
let unitCalls = 0
const unitLlm = {
  complete: async () => {
    unitCalls += 1
    return '{"drop":[0]}'
  },
}
const firstPass = await semanticModule.classifyTitles(cacheItems, { profile: unitProfile, profileKey: 'unit-key', llm: unitLlm })
const secondPass = await semanticModule.classifyTitles(cacheItems, { profile: unitProfile, profileKey: 'unit-key', llm: unitLlm })
check('语义缓存：首轮判了 2 条', firstPass.judged === 2, `judged=${firstPass.judged}`)
check('语义缓存：首轮丢掉第 0 条', firstPass.dropIds.has('a') && !firstPass.dropIds.has('b'))
check('语义缓存：次轮不再调模型', unitCalls === 1 && secondPass.judged === 0, `calls=${unitCalls} judged=${secondPass.judged}`)
check('语义缓存：次轮命中缓存', secondPass.cached === 2, `cached=${secondPass.cached}`)
check('语义缓存：次轮结论一致', secondPass.dropIds.has('a') && !secondPass.dropIds.has('b'))

// ── 解析容错：模型不一定老实吐 {"drop":[...]} ─────────────────────────
const parserCases = [
  ['标准 JSON', '{"drop":[0,3]}', [0, 3]],
  ['围栏内空数组', '```json\n{"drop":[]}\n```', []],
  ['换键名', '{"drop_indexes":[2]}', [2]],
  ['裸数组', '[1,4]', [1, 4]],
  ['散文包裹', '好的，结果如下：\n{"drop":[2]}', [2]],
  ['逐行结论', '0 丢弃\n1 保留\n2 不看', [0, 2]],
  ['索引映射', '{"0":"丢弃","1":"保留"}', [0]],
  ['方括号兜底', '需要丢弃的有：drop: [1, 3]', [1, 3]],
  ['拒答', '抱歉，我无法完成该请求。', null],
]
for (const [name, raw, expected] of parserCases) {
  const parsed = semanticModule.parseDropIndexes(raw, 5)
  const actual = parsed === null ? null : [...parsed]
  check(`解析：${name}`, JSON.stringify(actual) === JSON.stringify(expected), JSON.stringify(actual))
}

// ── 模型给不出可解析结果时：不抛错、不误删、带原因 ────────────────────
let garbageCalls = 0
const garbageLlm = {
  complete: async () => {
    garbageCalls += 1
    return '抱歉，我无法完成该请求。'
  },
}
const garbagePass = await semanticModule.classifyTitles(cacheItems, {
  profile: unitProfile,
  profileKey: 'unit-garbage',
  llm: garbageLlm,
})
check('语义失败：不抛错', garbagePass.failed === true)
check('语义失败：带可读原因', typeof garbagePass.error === 'string' && garbagePass.error.length > 0, garbagePass.error)
check('语义失败：解析失败后重试一次', garbageCalls === 2, `calls=${garbageCalls}`)
check('语义失败：不误删条目', garbagePass.dropIds.size === 0)

// ── index 注入 ────────────────────────────────────────────────────────
const html = taps[0]('<html><head><title>t</title></head><body></body></html>')
check('注入脚本带端口', html.includes('"port":19387'), html.slice(0, 140))
check('注入脚本带两个端点', html.includes(FEED_PATH) && html.includes(PREFS_PATH))
check('只注入一次', taps[0](html) === html)

rmSync(sandboxHome, { recursive: true, force: true })

console.log(failures === 0 ? '\n全部通过' : `\n${failures} 项未通过`)
process.exit(failures === 0 ? 0 : 1)
