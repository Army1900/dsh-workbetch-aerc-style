/**
 * 时事大屏 · 用户偏好（Host 半部）
 *
 * 用户只写自然语言（一段 markdown），保存时交给模型解析成结构化规则：
 *
 *   { summary, include[], exclude[], must[], preferCategories[], muteSources[], boostSources[] }
 *
 * 之后每次取数都用这套规则**过滤 + 排序**（纯字符串子串匹配，确定性、无额外开销），
 * 所以「校准」发生在保存时，而「按偏好筛」发生在每次刷新。
 *
 * AI 不可用时退化为离线关键词规则，功能不中断。
 *
 * 存储：$DSH_HOME/news-wall/preferences.json（人可读、可手改；写完 tmp+rename）。
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** 默认偏好文本（用户第一次打开编辑器看到的内容）。 */
export const DEFAULT_TEXT = `# 我的新闻偏好

用日常语言写你关心什么、不想看什么就行，保存后 AI 会把它解析成筛选规则。

## 我关注
- 国内时政要闻、重要政策与人事变动
- AI 大模型、芯片半导体、机器人等硬科技进展
- 国际局势：中美关系、地缘冲突、全球经济

## 我不想看
- 娱乐八卦、明星绯闻
- 体育赛事比分
- 电商带货、营销软文

## 必看
- 突发：地震、台风、暴雨等灾害预警

## 备注
- 标题党降权，优先权威媒体与首发消息`

/** 让模型只吐 JSON 的系统提示。 */
const PROFILE_SYSTEM_PROMPT = `你是新闻资讯的偏好解析器。用户会用自然语言（markdown）描述自己关心什么、不想看什么。
把它解析成严格的 JSON，只输出 JSON 本身：不要解释、不要代码围栏、不要多余文字。

JSON 结构：
{
  "summary": "一句话概括用户偏好，不超过 40 字",
  "include": ["感兴趣的主题或关键词，2-8 个字，8-16 个"],
  "exclude": ["不想看的『标题里真会出现的词』，2-6 个字，0-16 个"],
  "excludeHints": ["把 exclude 展开成具体描述，每条 10-30 字，0-8 条"],
  "must": ["必须置顶的关键词，0-8 个"],
  "preferCategories": ["按优先级排列，取值只能是 cn / world / tech / hot 的子集"],
  "muteSources": ["要完全屏蔽的来源名，0-6 个"],
  "boostSources": ["要加权的来源名，0-6 个"]
}

要求：
- include / exclude 都要短，能被标题直接子串匹配，不要写整句；
- **exclude 必须写标题里真会出现的词**，例如「明星」「恋情」「官宣」「综艺」「塌房」「演唱会」「比分」「转会」；
  不要写「娱乐八卦」「体育赛事」这种类别名 —— 标题里几乎不会出现这几个字，匹配不到；
- excludeHints 写这类内容的具体形态，供之后逐条判断标题用，
  例如「明星恋情婚变与绯闻；综艺节目与影视剧口碑；演唱会与粉丝互撕；体育赛事比分与转会」；
- 同类词合并（「AI」「大模型」「人工智能」保留 1-2 个最常见的即可）；
- exclude 不要与 include 冲突；真冲突时以 exclude 为准，并在 summary 里说明；
- 用户说「都行 / 随便 / 没想法」时，各数组留空，summary 写「无特别偏好」。`

const LIMITS = {
  include: 16,
  exclude: 16,
  must: 8,
  sources: 8,
  hints: 8,
  /** 单个关键词的最大字数，过长就没法做子串匹配了。 */
  termChars: 24,
  /** 单条语义提示的最大字数。 */
  hintChars: 80,
}

/** 允许的板块 id。 */
export const CATEGORY_IDS = ['cn', 'world', 'tech', 'hot']

/* ────────────────────────────── 存储 ────────────────────────────── */

function stateDirectory() {
  const home = typeof process.env.DSH_HOME === 'string' && process.env.DSH_HOME.length > 0
    ? process.env.DSH_HOME
    : join(homedir(), '.dsh')
  return join(home, 'news-wall')
}

function stateFile() {
  return join(stateDirectory(), 'preferences.json')
}

/** 进程内缓存：读盘一次，保存后原地替换。 */
let cached = null

/**
 * 读取当前偏好。
 * @returns {{ text: string, profile: object|null, analysis: object|null }}
 */
export function readPreferences() {
  if (cached !== null) return cached
  cached = { text: DEFAULT_TEXT, profile: null, analysis: null }
  try {
    const file = stateFile()
    if (existsSync(file)) {
      const parsed = JSON.parse(readFileSync(file, 'utf8'))
      if (parsed !== null && typeof parsed === 'object' && typeof parsed.text === 'string' && parsed.text.trim().length > 0) {
        cached = {
          text: parsed.text,
          profile: normalizeProfile(parsed.profile),
          analysis: normalizeAnalysis(parsed.analysis),
        }
      }
    }
  } catch (error) {
    console.error('[dsh-news-wall] 读取偏好失败，用默认值：', error)
  }
  return cached
}

/** 落盘（tmp + rename，避免写一半断电留下坏文件）。 */
function persist(next) {
  cached = next
  try {
    const directory = stateDirectory()
    mkdirSync(directory, { recursive: true })
    const target = stateFile()
    const temporary = `${target}.${process.pid}.tmp`
    writeFileSync(temporary, `${JSON.stringify({
      version: 1,
      text: next.text,
      profile: next.profile,
      analysis: next.analysis,
      updatedAt: new Date().toISOString(),
    }, null, 2)}\n`, 'utf8')
    renameSync(temporary, target)
  } catch (error) {
    console.error('[dsh-news-wall] 保存偏好失败（本次仅在内存生效）：', error)
  }
}

/** 保存一份新偏好（不改动分析结果）。 */
export function writePreferences(patch) {
  const current = readPreferences()
  const next = {
    text: typeof patch.text === 'string' ? patch.text : current.text,
    profile: 'profile' in patch ? patch.profile : current.profile,
    analysis: 'analysis' in patch ? patch.analysis : current.analysis,
  }
  persist(next)
  return next
}

/** 当前偏好是否是默认文本。 */
export function isDefaultText(text) {
  return String(text).trim() === DEFAULT_TEXT.trim()
}

/* ────────────────────────────── 解析 ────────────────────────────── */

function stringList(value, max) {
  if (!Array.isArray(value)) return []
  const out = []
  const seen = new Set()
  for (const entry of value) {
    if (typeof entry !== 'string') continue
    const term = entry.trim().toLowerCase().replace(/\s+/g, ' ')
    if (term.length < 2 || Array.from(term).length > LIMITS.termChars) continue
    if (seen.has(term)) continue
    seen.add(term)
    out.push(term)
    if (out.length >= max) break
  }
  return out
}

/** 语义提示比关键词长，单独收敛。 */
function hintList(value, max) {
  if (!Array.isArray(value)) return []
  const out = []
  const seen = new Set()
  for (const entry of value) {
    if (typeof entry !== 'string') continue
    const hint = entry.trim().replace(/\s+/g, ' ')
    if (hint.length < 4 || Array.from(hint).length > LIMITS.hintChars) continue
    if (seen.has(hint)) continue
    seen.add(hint)
    out.push(hint)
    if (out.length >= max) break
  }
  return out
}

/** 把任意来源的对象收敛成可用的规则集；没有有效内容时返回 null。 */
export function normalizeProfile(value) {
  if (value === null || typeof value !== 'object') return null
  const profile = {
    summary: typeof value.summary === 'string' ? value.summary.trim().slice(0, 80) : '',
    include: stringList(value.include, LIMITS.include),
    exclude: stringList(value.exclude, LIMITS.exclude),
    excludeHints: hintList(value.excludeHints, LIMITS.hints),
    must: stringList(value.must, LIMITS.must),
    preferCategories: Array.isArray(value.preferCategories)
      ? value.preferCategories.filter((id) => typeof id === 'string' && CATEGORY_IDS.includes(id)).slice(0, CATEGORY_IDS.length)
      : [],
    muteSources: stringList(value.muteSources, LIMITS.sources),
    boostSources: stringList(value.boostSources, LIMITS.sources),
  }
  const meaningful = profile.include.length + profile.exclude.length + profile.must.length
    + profile.preferCategories.length + profile.muteSources.length + profile.boostSources.length
  if (meaningful === 0 && profile.summary.length === 0) return null
  return profile
}

function normalizeAnalysis(value) {
  if (value === null || typeof value !== 'object') return null
  return {
    ok: value.ok === true,
    source: value.source === 'ai' ? 'ai' : value.source === 'none' ? 'none' : 'heuristic',
    model: typeof value.model === 'string' ? value.model : null,
    at: typeof value.at === 'string' ? value.at : null,
    error: typeof value.error === 'string' ? value.error : null,
  }
}

/** 从模型输出里抠出 JSON（容忍 ```json 围栏与前后废话）。 */
export function parseProfileJson(raw) {
  if (typeof raw !== 'string' || raw.trim().length === 0) return null
  let text = raw.trim()
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(text)
  if (fence !== null) text = fence[1].trim()
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end <= start) return null
  try {
    return normalizeProfile(JSON.parse(text.slice(start, end + 1)))
  } catch {
    return null
  }
}

/** 标题/正文里是否命中任一关键词。 */
function matchesAny(haystack, terms) {
  if (!Array.isArray(terms) || terms.length === 0) return false
  for (const term of terms) {
    if (haystack.includes(term)) return true
  }
  return false
}

function countMatches(haystack, terms) {
  if (!Array.isArray(terms) || terms.length === 0) return 0
  let count = 0
  for (const term of terms) {
    if (haystack.includes(term)) count += 1
  }
  return count
}

/* ────────────────────────────── 离线兜底解析 ────────────────────────────── */

const FILLER = /^(我|我们|想|要|关注|关心|喜欢|爱看|不想|不要|别看|不看|屏蔽|排除|讨厌|优先|重点|必看|置顶|等|相关|方面|内容|新闻|消息|资讯|一些|更多|最好|希望|可以|都行|随便)+/g

function classifyHeading(line) {
  const heading = line.replace(/^#+\s*/, '')
  if (/不|屏蔽|排除|讨厌|别看|不想/.test(heading)) return 'exclude'
  if (/必看|重点|优先|置顶|紧急/.test(heading)) return 'must'
  if (/关注|喜欢|关心|兴趣|想看|在意/.test(heading)) return 'include'
  return null
}

function extractTerms(phrase) {
  const cleaned = phrase.replace(FILLER, '').replace(/[。；;！!？?]+$/g, '').trim()
  if (cleaned.length === 0) return []
  const parts = cleaned.split(/[\s、,，/|·]+/).map((part) => part.trim()).filter(Boolean)
  const terms = []
  for (const part of parts) {
    if (Array.from(part).length >= 2 && Array.from(part).length <= LIMITS.termChars) terms.push(part)
  }
  return terms.length > 0 ? terms : [cleaned]
}

/**
 * AI 不可用时的兜底：按 markdown 的小节语义 + 项目符号抠关键词。
 * 短词效果好，长句会弱一些 —— 这是降级路径，不是主路径。
 */
export function analyzeHeuristic(text) {
  const buckets = { include: [], exclude: [], must: [] }
  let section = 'include'
  for (const rawLine of String(text).split('\n')) {
    const line = rawLine.trim()
    if (line.length === 0) continue
    if (line.startsWith('#')) {
      const next = classifyHeading(line)
      if (next !== null) section = next
      continue
    }
    if (!/^([-*·]|\d+[.、)])\s*/.test(line)) continue
    const body = line.replace(/^([-*·]|\d+[.、)])\s*/, '').trim()
    if (body.length === 0) continue
    for (const phrase of body.split(/[；;。]+/)) {
      for (const term of extractTerms(phrase)) {
        if (buckets[section].length < LIMITS[section]) buckets[section].push(term)
      }
    }
  }
  return normalizeProfile({
    summary: describeHeuristic(buckets),
    include: buckets.include,
    exclude: buckets.exclude,
    must: buckets.must,
    preferCategories: [],
    muteSources: [],
    boostSources: [],
  })
}

function describeHeuristic(buckets) {
  const parts = []
  if (buckets.include.length > 0) parts.push(`关注 ${buckets.include.slice(0, 3).join('、')}`)
  if (buckets.exclude.length > 0) parts.push(`屏蔽 ${buckets.exclude.slice(0, 3).join('、')}`)
  if (buckets.must.length > 0) parts.push(`置顶 ${buckets.must.slice(0, 2).join('、')}`)
  return parts.length > 0 ? `离线规则：${parts.join('；')}` : '无特别偏好'
}

/* ────────────────────────────── 分析入口 ────────────────────────────── */

/**
 * 解析一段自然语言偏好。
 *
 * @param {string} text 用户写的 markdown
 * @param {{ complete: (system: string, user: string) => Promise<string>, label?: string } | null} llm
 * @returns {Promise<{ profile: object|null, analysis: object }>}
 */
export async function analyzePreferences(text, llm) {
  const trimmed = String(text ?? '').trim()
  const at = new Date().toISOString()
  if (trimmed.length === 0) {
    return { profile: null, analysis: { ok: true, source: 'none', model: null, at, error: null } }
  }

  if (llm !== null && llm !== undefined) {
    try {
      const raw = await llm.complete(PROFILE_SYSTEM_PROMPT, trimmed)
      const profile = parseProfileJson(raw)
      if (profile !== null) {
        return { profile, analysis: { ok: true, source: 'ai', model: llm.label ?? null, at, error: null } }
      }
      return {
        profile: analyzeHeuristic(trimmed),
        analysis: { ok: true, source: 'heuristic', model: llm.label ?? null, at, error: '模型返回的内容不是可用的 JSON，已用离线规则' },
      }
    } catch (error) {
      return {
        profile: analyzeHeuristic(trimmed),
        analysis: { ok: true, source: 'heuristic', model: llm.label ?? null, at, error: `AI 解析失败（${describeError(error)}），已用离线规则` },
      }
    }
  }

  return {
    profile: analyzeHeuristic(trimmed),
    analysis: { ok: true, source: 'heuristic', model: null, at, error: '没有可用的模型，已用离线规则' },
  }
}

function describeError(error) {
  if (error instanceof Error) return error.message.length > 100 ? `${error.message.slice(0, 99)}…` : error.message
  return String(error).slice(0, 100)
}

/* ────────────────────────────── 过滤与排序 ────────────────────────────── */

function timeOf(item) {
  const time = item.publishedAt === null || item.publishedAt === undefined ? NaN : new Date(item.publishedAt).getTime()
  return Number.isFinite(time) ? time : 0
}

function freshnessBonus(publishedAt) {
  const time = publishedAt === null || publishedAt === undefined ? NaN : new Date(publishedAt).getTime()
  if (!Number.isFinite(time)) return 0
  const minutes = (Date.now() - time) / 60_000
  if (minutes <= 60) return 60
  if (minutes <= 360) return 30
  if (minutes <= 1440) return 10
  return 0
}

/**
 * 按规则过滤 + 排序每个板块。
 *
 * - `muteSources` 里的源整条丢弃；
 * - 命中 `exclude` 丢弃；
 * - 命中 `must` 加 1000 分并打上 flag；
 * - 命中 `include` 每个 +120（标题命中再 +60）；
 * - `preferCategories` / `boostSources` / 新鲜度做小幅加权。
 *
 * @param {Array<{ id: string, label: string, items: object[] }>} categories
 * @param {object|null} profile
 * @returns {{ categories: object[], filtered: number, pinned: number }}
 */
export function applyPreferences(categories, profile) {
  if (profile === null || profile === undefined) return { categories, filtered: 0, pinned: 0 }

  const mute = new Set(profile.muteSources)
  const boost = new Set(profile.boostSources)
  const categoryBonus = new Map(profile.preferCategories.map((id, index) => [id, Math.max(0, 3 - index) * 30]))

  let filtered = 0
  let pinned = 0

  const next = categories.map((category) => {
    const bonus = categoryBonus.get(category.id) ?? 0
    const scored = []
    for (const item of category.items) {
      if (mute.has(item.sourceId)) {
        filtered += 1
        continue
      }
      const title = String(item.title ?? '').toLowerCase()
      const haystack = `${title} ${String(item.summary ?? '').toLowerCase()}`
      if (matchesAny(haystack, profile.exclude)) {
        filtered += 1
        continue
      }
      const must = matchesAny(haystack, profile.must)
      let score = 0
      if (must) {
        score += 1000
        pinned += 1
      }
      score += Math.min(3, countMatches(haystack, profile.include)) * 120
      score += Math.min(2, countMatches(title, profile.include)) * 60
      score += bonus
      if (boost.has(item.sourceId)) score += 80
      score += freshnessBonus(item.publishedAt)
      scored.push({ item: must ? { ...item, flag: 'must' } : item, score })
    }
    scored.sort((a, b) => b.score - a.score || timeOf(b.item) - timeOf(a.item))
    return { ...category, items: scored.map((entry) => entry.item) }
  })

  return { categories: next, filtered, pinned }
}

/** 规则集的指纹：用于让缓存随偏好失效。 */
export function profileKey(profile) {
  if (profile === null || profile === undefined) return 'none'
  return JSON.stringify(profile)
}
