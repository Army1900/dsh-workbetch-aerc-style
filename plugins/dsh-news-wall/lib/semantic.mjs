/**
 * 时事大屏 · 语义过滤（Host 半部）
 *
 * 关键词只能挡住字面命中：`exclude: ["娱乐八卦"]` 挡不住「嫁金钗口碑发酵」。
 * 所以在关键词过滤之后再加一层 —— 把候选标题交给模型逐条判断是否属于
 * 「不想看」的类别，命中的丢掉。
 *
 * 成本控制：
 *   - 结果按「规则指纹 + 标题」缓存到磁盘，同一批新闻第二次刷新不再调模型；
 *   - 每次刷新最多判 96 条新标题（约 3 个批次），且只判各板块前排的候选；
 *   - 整体有预算上限，超时/失败就保留关键词结果，不影响出数据。
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** 单批标题数：批次越小，模型越不容易写散。 */
const BATCH_SIZE = 24

/** 单次刷新最多判多少条新标题。 */
const MAX_NEW_PER_REFRESH = 96

/** 缓存上限（超出后丢弃最早的）。 */
const CACHE_LIMIT = 1500

/** 整个语义阶段的时间预算。 */
const DEFAULT_BUDGET_MS = 25_000

function stateDirectory() {
  const home = typeof process.env.DSH_HOME === 'string' && process.env.DSH_HOME.length > 0
    ? process.env.DSH_HOME
    : join(homedir(), '.dsh')
  return join(home, 'news-wall')
}

function cacheFile() {
  return join(stateDirectory(), 'semantic-cache.json')
}

/** 标题指纹：同一标题在不同源、不同轮次都能命中缓存。 */
function titleKey(title) {
  const text = String(title).replace(/\s+/g, '').toLowerCase()
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(36)
}

/** 进程内缓存：{ profileKey, entries: Map<titleKey, true|false> }，true = 丢弃。 */
let memory = null

function loadCache(profileKey) {
  if (memory !== null && memory.profileKey === profileKey) return memory
  const entries = new Map()
  try {
    const file = cacheFile()
    if (existsSync(file)) {
      const parsed = JSON.parse(readFileSync(file, 'utf8'))
      // 规则一变，旧判断全部作废：同一个标题在新偏好下可能是想看的。
      if (parsed !== null && typeof parsed === 'object' && parsed.profileKey === profileKey && parsed.entries !== null && typeof parsed.entries === 'object') {
        for (const [key, value] of Object.entries(parsed.entries)) entries.set(key, value === 1)
      }
    }
  } catch (error) {
    console.error('[dsh-news-wall] 读取语义缓存失败，忽略：', error)
  }
  memory = { profileKey, entries }
  return memory
}

function persistCache(state) {
  try {
    const directory = stateDirectory()
    mkdirSync(directory, { recursive: true })
    let keys = [...state.entries.keys()]
    if (keys.length > CACHE_LIMIT) {
      const drop = keys.slice(0, keys.length - CACHE_LIMIT)
      for (const key of drop) state.entries.delete(key)
      keys = keys.slice(drop.length)
    }
    const entries = {}
    for (const [key, dropped] of state.entries) entries[key] = dropped ? 1 : 0
    const target = cacheFile()
    const temporary = `${target}.${process.pid}.tmp`
    writeFileSync(temporary, `${JSON.stringify({ version: 1, profileKey: state.profileKey, entries })}\n`, 'utf8')
    renameSync(temporary, target)
  } catch (error) {
    console.error('[dsh-news-wall] 写入语义缓存失败（不影响出数据）：', error)
  }
}

/** 用户提到娱乐类时，才把娱乐的具体形态写进提示词 —— 避免误伤没提这事的用户。 */
function mentions(profile, words) {
  const haystack = [...profile.exclude, ...(profile.excludeHints ?? []), profile.summary ?? ''].join(' ')
  return words.some((word) => haystack.includes(word))
}

function buildSystemPrompt(profile) {
  const lines = [
    '你是新闻筛选器。用户不想看到某几类内容，你要从编号标题里挑出属于这些类别的。',
    '',
    `用户不想看：${profile.exclude.length > 0 ? profile.exclude.join('、') : '（无）'}`,
    `进一步说明：${Array.isArray(profile.excludeHints) && profile.excludeHints.length > 0 ? profile.excludeHints.join('；') : '（无）'}`,
    `用户想看（只用于边界判断，不要因此保留无关内容）：${profile.include.length > 0 ? profile.include.join('、') : '（无）'}`,
    '',
    '判定原则：',
    '- 只在明确的「不想看」类别上丢弃；拿不准就保留；',
  ]
  if (mentions(profile, ['娱乐', '明星', '八卦', '综艺', '影视', '绯闻', '热剧'])) {
    lines.push('- 娱乐类包括：明星恋情婚变绯闻、综艺节目、影视剧与票房口碑、演唱会、塌房与粉丝争端、网红八卦')
  }
  if (mentions(profile, ['体育', '赛事', '比分', '球'])) {
    lines.push('- 体育类包括：赛事赛果比分、球队球员转会与花边')
  }
  lines.push('- 不要因为标题里有「AI」「科技」就判为想看；也不要因为出现「电影」「剧」就一定判为娱乐（可能是产业政策或技术报道）')
  lines.push('')
  lines.push('只输出 JSON，形如 {"drop":[0,3,7]}，序号从 0 开始；没有要丢的就输出 {"drop":[]}。')
  return lines.join('\n')
}

/**
 * 从模型输出里抠出要丢弃的序号。
 *
 * 模型不一定老实吐 `{"drop":[...]}`：可能包围栏、换键名、吐裸数组，
 * 甚至输出「0 丢弃 / 1 保留」这种逐行结论。这里依次兼容，全失败才返回 null。
 */
export function parseDropIndexes(raw, count) {
  if (typeof raw !== 'string' || raw.trim().length === 0) return null
  let text = raw.trim()
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(text)
  if (fence !== null) text = fence[1].trim()

  const indexes = new Set()
  const push = (value) => {
    const index = typeof value === 'number' ? value : Number.parseInt(String(value).replace(/[^\d-]/g, ''), 10)
    if (Number.isInteger(index) && index >= 0 && index < count) indexes.add(index)
  }

  // 1) 标准 JSON：裸数组、常见键名、或「只有一个数组值」的对象
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end <= start) {
    // 可能直接吐了个裸数组：[1,4]
    try {
      const parsed = JSON.parse(text)
      if (Array.isArray(parsed)) {
        parsed.forEach(push)
        return indexes
      }
    } catch {
      /* 落到文本兜底 */
    }
  }
  if (start !== -1 && end > start) {
    try {
      const parsed = JSON.parse(text.slice(start, end + 1))
      if (Array.isArray(parsed)) {
        parsed.forEach(push)
        return indexes
      }
      if (parsed !== null && typeof parsed === 'object') {
        for (const key of ['drop', 'drop_indexes', 'dropIndexes', 'indices', 'exclude', '丢弃', '删除', '不看']) {
          if (Array.isArray(parsed[key])) {
            parsed[key].forEach(push)
            return indexes
          }
        }
        // 形如 {"0":"丢弃","3":"保留"} 的映射
        const numeric = Object.entries(parsed).filter(([key]) => /^\d+$/.test(key))
        if (numeric.length > 0) {
          for (const [key, value] of numeric) {
            if (/丢|不看|排除|drop|exclude|true/i.test(String(value))) push(key)
          }
          return indexes
        }
        const arrays = Object.values(parsed).filter(Array.isArray)
        if (arrays.length === 1) {
          arrays[0].forEach(push)
          return indexes
        }
        if (Object.keys(parsed).length === 0) return indexes
      }
    } catch {
      /* 落到文本兜底 */
    }
  }

  // 2) 原文里带 drop/丢弃 的方括号列表
  const arrayLike = /(?:drop|丢弃|删除|不看|排除)\w*\s*[:：]?\s*\[([^\]]*)\]/i.exec(text)
  if (arrayLike !== null) {
    for (const token of arrayLike[1].split(/[,，\s]+/)) {
      if (token.length > 0) push(token)
    }
    return indexes
  }

  // 2b) 「丢弃：0,3」这种不带方括号的
  const colonList = /(?:drop|丢弃|删除|不看|排除)\w*\s*[:：]\s*([\d,，\s]+)/i.exec(text)
  if (colonList !== null) {
    for (const token of colonList[1].split(/[,，\s]+/)) {
      if (token.length > 0) push(token)
    }
    return indexes
  }

  // 3) 逐行结论：「0 丢弃」「2: 不看」
  let sawLine = false
  for (const match of text.matchAll(/^\s*(\d+)\s*[:：.\-—)]?\s*(.+)$/gm)) {
    sawLine = true
    if (/丢|不看|排除|drop|exclude/i.test(match[2])) push(match[1])
  }
  if (sawLine) return indexes

  return null
}

/**
 * 对一批条目做语义判断。
 *
 * @param {Array<{ id: string, title: string, source: string }>} items 候选条目
 * @param {object} options
 * @param {object} options.profile 规则集（要用 exclude / excludeHints / include / summary）
 * @param {string} options.profileKey 规则指纹
 * @param {{ complete: (system: string, user: string) => Promise<string> } | null} options.llm
 * @param {number} [options.budgetMs]
 * @returns {Promise<{ dropIds: Set<string>, judged: number, dropped: number, cached: number, failed: boolean }>}
 */
export async function classifyTitles(items, options) {
  const llm = options.llm ?? null
  const profile = options.profile ?? null
  const empty = { dropIds: new Set(), judged: 0, dropped: 0, cached: 0, failed: false, error: null }
  if (llm === null || profile === null || !Array.isArray(items) || items.length === 0) {
    return { ...empty, failed: llm === null, error: llm === null ? '没有可用的模型' : null }
  }

  const state = loadCache(String(options.profileKey ?? 'none'))
  const dropIds = new Set()
  let cached = 0
  let droppedFromCache = 0

  // 1) 先吃掉缓存
  const pending = []
  for (const item of items) {
    const key = titleKey(item.title)
    if (state.entries.has(key)) {
      cached += 1
      if (state.entries.get(key) === true) {
        dropIds.add(item.id)
        droppedFromCache += 1
      }
      continue
    }
    if (pending.length < MAX_NEW_PER_REFRESH) pending.push({ item, key })
  }

  if (pending.length === 0) {
    return { dropIds, judged: 0, dropped: droppedFromCache, cached, failed: false, error: null }
  }

  // 2) 分批判断新标题（解析失败重试一次，连续两批失败就收手）
  const system = buildSystemPrompt(profile)
  const reminder = '上一次回答无法解析。请只输出 JSON：{"drop":[...]}，序号从 0 开始，不要任何解释。'
  const deadline = Date.now() + (options.budgetMs ?? DEFAULT_BUDGET_MS)
  let judged = 0
  let failed = false
  let error = null
  let consecutiveFailures = 0

  for (let offset = 0; offset < pending.length; offset += BATCH_SIZE) {
    if (Date.now() > deadline) {
      failed = true
      error = error ?? '语义判断超出时间预算'
      break
    }
    const batch = pending.slice(offset, offset + BATCH_SIZE)
    const numbered = batch
      .map((entry, index) => `${index}. ${String(entry.item.title).slice(0, 80)}（${entry.item.source ?? ''}）`)
      .join('\n')
    const ask = `待判断标题：\n${numbered}`

    let indexes = null
    try {
      const raw = await llm.complete(system, ask, { maxTokens: 1600 })
      indexes = parseDropIndexes(raw, batch.length)
      if (indexes === null) {
        const retry = await llm.complete(`${system}\n\n${reminder}`, ask, { maxTokens: 1600 })
        indexes = parseDropIndexes(retry, batch.length)
        if (indexes === null) {
          error = error ?? `模型输出无法解析：${String(raw).replace(/\s+/g, ' ').slice(0, 90)}`
        }
      }
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught)
      error = error ?? `模型调用失败：${message.slice(0, 140)}`
      indexes = null
    }

    if (indexes === null) {
      failed = true
      consecutiveFailures += 1
      if (consecutiveFailures >= 2) break
      continue
    }

    consecutiveFailures = 0
    batch.forEach((entry, index) => {
      const isDrop = indexes.has(index)
      state.entries.set(entry.key, isDrop)
      judged += 1
      if (isDrop) dropIds.add(entry.item.id)
    })
  }

  persistCache(state)
  if (failed && error !== null) console.error('[dsh-news-wall] 语义判断降级：', error)

  return {
    dropIds,
    judged,
    // dropIds 同时包含缓存命中与新判定的
    dropped: dropIds.size,
    cached,
    failed,
    error,
  }
}
