/**
 * 时事大屏 · 聚合与缓存层
 *
 * 并发抓取全部源 → 逐源解析 → 板块内轮转交错（避免单一来源霸屏）→ 标题指纹去重
 * → 截断到板块上限 → 写入带 TTL 的内存缓存。
 *
 * 缓存策略：
 *   - 命中 TTL（默认 120s）直接返回，`cached: true`；
 *   - 未命中则真实抓取，同一时刻只允许一次抓取（并发请求共享同一 Promise）；
 *   - 全部源失败时退回上一份好数据，并标记 `staleReason`。
 */

import {
  CATEGORIES,
  CATEGORY_LIMIT,
  SOURCES,
  fetchSource,
  fingerprint,
  parsePayload,
} from './sources.mjs'
import { applyPreferences, profileKey, readPreferences } from './prefs.mjs'
import { classifyTitles } from './semantic.mjs'

/** 缓存有效期：大屏 5 分钟一刷，抓取侧留 2 分钟兜底。 */
export const CACHE_TTL_MS = 120_000

/** 单源超时。 */
const SOURCE_TIMEOUT_MS = 12_000

/** 单源最多保留多少条进入板块池。 */
const MAX_PER_SOURCE = 30

/** 最近一次成功抓取的快照。 */
let cache = null

/** 正在进行的抓取（并发去重）。 */
let inflight = null

/** 当前缓存年龄（毫秒），无缓存时为 null。 */
export function cacheAgeMs() {
  return cache === null ? null : Date.now() - cache.at
}

/** 偏好变了就丢掉缓存：下一次请求按新规则重新组装。 */
export function invalidateCache() {
  cache = null
}

/**
 * 取回大屏数据。
 * @param {{ force?: boolean, llm?: object|null }} [options]
 *   force=true 跳过缓存强制抓取；llm 是语义判断用的模型门面（可为 null）
 */
export async function getFeed(options = {}) {
  const force = options.force === true
  const llm = options.llm ?? null
  const prefs = readPreferences()
  const key = profileKey(prefs.profile)
  if (!force && cache !== null && cache.key === key && Date.now() - cache.at < CACHE_TTL_MS) {
    return { ...cache.payload, cached: true, cacheAgeMs: Date.now() - cache.at }
  }
  if (inflight !== null) return inflight
  const pending = refresh(prefs, llm).finally(() => {
    inflight = null
  })
  inflight = pending
  return pending
}

/** 真实抓取一次并组装响应。 */
async function refresh(prefs, llm) {
  const results = await Promise.all(SOURCES.map(loadSource))
  const profile = prefs.profile ?? null
  const active = profile !== null

  const categories = dedupeImages(
    CATEGORIES.map((category) => {
      const limit = CATEGORY_LIMIT[category.id] ?? 12
      const lists = results
        .filter((result) => result.source.category === category.id && result.items.length > 0)
        .map((result) => result.items)
      // 有偏好时先捞一个更大的候选池，过滤掉一批之后仍然够填满板块。
      const pooled = interleave(lists, active ? Math.min(60, limit * 4) : limit)
      return { id: category.id, label: category.label, items: active ? pooled : sinkStale(pooled) }
    }),
  )

  const applied = active ? applyPreferences(categories, profile) : { categories, filtered: 0, pinned: 0 }

  // 关键词挡不住「嫁金钗口碑发酵」这种不带类别名的娱乐标题，
  // 所以对每个板块的前排候选再做一层语义判断（按标题缓存，重复刷新不再调模型）。
  const windows = active && llm !== null
    ? applied.categories.flatMap((category) => category.items.slice(0, (CATEGORY_LIMIT[category.id] ?? 12) + 6))
    : []
  const verdict = windows.length > 0
    ? await classifyTitles(windows, { profile, profileKey: profileKey(profile), llm })
    : null

  const finalCategories = applied.categories.map((category) => {
    const limit = CATEGORY_LIMIT[category.id] ?? 12
    const window = category.items.slice(0, limit + 6)
    const kept = verdict === null ? window : window.filter((item) => !verdict.dropIds.has(item.id))
    return { ...category, items: kept.slice(0, limit) }
  })

  const semantic = {
    available: llm !== null,
    judged: verdict !== null ? verdict.judged : 0,
    dropped: verdict !== null ? verdict.dropped : 0,
    cached: verdict !== null ? verdict.cached : 0,
    failed: verdict !== null ? verdict.failed : false,
    // 失败原因要能被接口读出来，不然只能翻日志（宿主根本没落日志）
    error: verdict !== null ? (verdict.error ?? null) : (llm === null ? '没有可用的模型' : null),
  }

  const sources = results.map((result) => ({
    id: result.source.id,
    name: result.source.name,
    subtitle: result.source.subtitle ?? '',
    category: result.source.category,
    ok: result.ok,
    count: result.items.length,
    ms: result.ms,
    error: result.error ?? null,
  }))

  const total = finalCategories.reduce((sum, category) => sum + category.items.length, 0)
  const payload = {
    ok: total > 0,
    generatedAt: new Date().toISOString(),
    cached: false,
    cacheAgeMs: 0,
    ttlSeconds: Math.round(CACHE_TTL_MS / 1000),
    categories: finalCategories,
    sources,
    preferences: {
      active,
      summary: profile !== null ? profile.summary : '',
      analyzedAt: prefs.analysis !== null ? prefs.analysis.at : null,
      source: prefs.analysis !== null ? prefs.analysis.source : null,
      // 关键词丢弃 + 语义丢弃，给界面一个总数
      filtered: applied.filtered + semantic.dropped,
      keywordFiltered: applied.filtered,
      semanticDropped: semantic.dropped,
      semantic,
      pinned: applied.pinned,
    },
    stats: {
      total,
      sources: sources.length,
      failed: sources.filter((source) => !source.ok).length,
    },
  }

  if (total > 0) {
    cache = { at: Date.now(), key: profileKey(profile), payload }
    return payload
  }

  // 全部阵亡：能退回旧数据就退回，避免大屏闪成空白。
  if (cache !== null) {
    return { ...cache.payload, cached: true, cacheAgeMs: Date.now() - cache.at, staleReason: 'all-sources-failed' }
  }
  return payload
}

/** 抓取并解析单个源，失败不抛出，只记录。 */
async function loadSource(source) {
  try {
    const { text, status, ms } = await fetchSource(source, SOURCE_TIMEOUT_MS)
    if (status < 200 || status >= 300) throw new Error(`HTTP ${status}`)
    const items = parsePayload(source, text).slice(0, MAX_PER_SOURCE)
    if (items.length === 0) throw new Error('解析结果为空')
    return { source, ok: true, items, ms }
  } catch (error) {
    return { source, ok: false, items: [], ms: 0, error: describeError(error) }
  }
}

/** 板块内多源轮转交错取前 N 条，并按标题指纹去重。 */
function interleave(lists, limit) {
  const seen = new Set()
  const out = []
  let index = 0
  while (out.length < limit) {
    let progressed = false
    for (const list of lists) {
      const item = list[index]
      if (item === undefined) continue
      progressed = true
      const key = fingerprint(item.title)
      if (key.length === 0 || seen.has(key)) continue
      seen.add(key)
      out.push(item)
      if (out.length >= limit) break
    }
    if (!progressed) break
    index += 1
  }
  return out
}

/** 同一张配图只保留第一次出现：占位图重复铺满版面，比没有图更糟。 */
function dedupeImages(categories) {
  const used = new Set()
  return categories.map((category) => ({
    ...category,
    items: category.items.map((item) => {
      if (typeof item.image !== 'string') return item
      if (used.has(item.image)) return { ...item, image: null }
      used.add(item.image)
      return item
    }),
  }))
}

/** 超过这个时龄的条目沉到板块末尾（无时间字段的热榜不受影响）。 */
const MAX_AGE_HOURS = 36

/**
 * 把陈旧条目沉底：轮转交错保证了来源多样，但慢源会把几天前的稿子带到前排，
 * 这里稳定地把它们挪到末尾 —— 既保留多样性，又不让大屏顶格出现旧闻。
 */
function sinkStale(items) {
  const cutoff = Date.now() - MAX_AGE_HOURS * 3_600_000
  const fresh = []
  const stale = []
  for (const item of items) {
    const time = item.publishedAt === null ? null : new Date(item.publishedAt).getTime()
    if (time === null || !Number.isFinite(time) || time >= cutoff) fresh.push(item)
    else stale.push(item)
  }
  return [...fresh, ...stale]
}

/** 把异常压成一行可展示的短文案。 */
function describeError(error) {
  if (error instanceof Error) {
    if (error.name === 'TimeoutError') return '请求超时'
    if (error.name === 'AbortError') return '已取消'
    const message = error.message || error.name
    return message.length > 120 ? `${message.slice(0, 119)}…` : message
  }
  return String(error).slice(0, 120)
}
