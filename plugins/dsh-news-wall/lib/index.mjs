/**
 * 时事大屏 · Host 半部
 *
 * 职责：
 *   1. 取数端点：浏览器半部同源拉取聚合后的新闻（按用户偏好过滤/排序）；
 *   2. 偏好端点：读取/保存用户用自然语言写的偏好，保存时调模型解析成筛选规则；
 *   3. 往 index.html 注入启动配置（端口 + 两个端点路径），让浏览器半部在
 *      非 HTTP 来源下也能用绝对地址兜底。
 *
 * 端点刻意放在 `/api` 之外：`/api` 是框架自己的前缀路由（带鉴权与 RPC 桥），
 * 注册在它下面的精确路由会被前缀匹配先吃掉，浏览器拿不到。
 *
 * 运行时零依赖：`llm` / `agentDefaultModel` 都用 ctx.get 可选读取
 * （取不到就退化成离线关键词解析），`webServer` 走 inject。
 */

import { getFeed, invalidateCache } from './feed.mjs'
import { DEFAULT_TEXT, analyzePreferences, isDefaultText, readPreferences, writePreferences } from './prefs.mjs'

/** Cordis 插件名（loader 诊断用）。 */
export const name = 'dsh-news-wall'

/** 取数端点路径。 */
export const FEED_PATH = '/dsh-news-wall/feed'

/** 偏好端点路径（GET 读取、POST 保存并解析）。 */
export const PREFS_PATH = '/dsh-news-wall/prefs'

/** 注入到页面上的启动配置全局名。 */
const BOOT_GLOBAL = '__DSH_NEWS_WALL__'

/** 偏好文本上限（字符数）：一段 markdown 足够，也防滥用。 */
const TEXT_LIMIT = 20_000

/** 请求体上限。 */
const BODY_LIMIT = 256 * 1024

/** 模型解析超时。 */
const LLM_TIMEOUT_MS = 60_000

/**
 * 插件主体。父级服务要在 fiber 激活后才可见，因此注册逻辑放进子插件里，
 * 由 Cordis 的 inject 机制等 webServer 就绪。
 */
export function apply(ctx) {
  ctx.plugin(installHostApi)
}

installHostApi.inject = ['webServer']
function installHostApi(ctx) {
  const webServer = ctx.webServer
  if (webServer === undefined || webServer === null) return

  // 注册失败不能连累宿主启动：整个大屏是可选功能。
  try {
    ctx.effect(() => webServer.register(makeFeedRoute(ctx)), 'dsh-news-wall: feed api')
  } catch (error) {
    console.error('[dsh-news-wall] 取数端点注册失败：', error)
  }

  try {
    ctx.effect(() => webServer.register(makePrefsRoute(ctx)), 'dsh-news-wall: prefs api')
  } catch (error) {
    console.error('[dsh-news-wall] 偏好端点注册失败：', error)
  }

  try {
    ctx.effect(() => webServer.tapIndex(makeIndexTap(webServer.port)), 'dsh-news-wall: boot config')
  } catch (error) {
    console.error('[dsh-news-wall] 启动配置注入失败：', error)
  }
}

/* ────────────────────────────── 取数端点 ────────────────────────────── */

/** GET /dsh-news-wall/feed[?refresh=1] */
function makeFeedRoute(ctx) {
  return {
    kind: 'exact',
    path: FEED_PATH,
    handler: async (req, res) => {
      const method = req.method ?? 'GET'
      if (method !== 'GET' && method !== 'HEAD') {
        return writeJson(res, 405, { ok: false, error: 'method-not-allowed' })
      }
      if (!trusted(req)) return writeJson(res, 403, { ok: false, error: 'forbidden' })

      let force = false
      try {
        const url = new URL(req.url ?? FEED_PATH, 'http://127.0.0.1')
        force = url.searchParams.get('refresh') === '1'
      } catch {
        force = false
      }

      try {
        // 语义判断要用模型；拿不到就只用关键词结果，不影响出数据。
        let llm = null
        try {
          llm = typeof ctx.get === 'function' ? await createLlmFacade(ctx) : null
        } catch (error) {
          console.error('[dsh-news-wall] 获取模型失败，跳过语义过滤：', error)
        }
        const payload = await getFeed({ force, llm })
        if (method === 'HEAD') {
          res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
          res.end()
          return
        }
        writeJson(res, 200, payload)
      } catch (error) {
        writeJson(res, 502, { ok: false, error: 'feed-failed', message: describe(error) })
      }
    },
  }
}

/* ────────────────────────────── 偏好端点 ────────────────────────────── */

/** GET /dsh-news-wall/prefs  →  当前文本 + 规则 + 解析信息；POST  →  保存并解析 */
function makePrefsRoute(ctx) {
  return {
    kind: 'exact',
    path: PREFS_PATH,
    handler: async (req, res) => {
      const method = req.method ?? 'GET'
      if (method !== 'GET' && method !== 'POST') {
        return writeJson(res, 405, { ok: false, error: 'method-not-allowed' })
      }
      if (!trusted(req)) return writeJson(res, 403, { ok: false, error: 'forbidden' })

      if (method === 'GET') return writeJson(res, 200, snapshot())

      const contentType = String(req.headers['content-type'] ?? '').toLowerCase()
      if (!contentType.startsWith('application/json')) {
        return writeJson(res, 415, { ok: false, error: 'json-required' })
      }

      let body = null
      try {
        body = await readJsonBody(req)
      } catch (error) {
        return writeJson(res, 400, { ok: false, error: 'invalid-body', message: describe(error) })
      }

      const text = body !== null && typeof body === 'object' && typeof body.text === 'string' ? body.text : null
      if (text === null) return writeJson(res, 400, { ok: false, error: 'text-required' })
      if (Array.from(text).length > TEXT_LIMIT) {
        return writeJson(res, 413, { ok: false, error: 'text-too-long', limit: TEXT_LIMIT })
      }

      try {
        const llm = typeof ctx.get === 'function' ? await createLlmFacade(ctx) : null
        const { profile, analysis } = await analyzePreferences(text, llm)
        writePreferences({ text, profile, analysis })
        invalidateCache()
        if (analysis !== null && analysis.error !== null) {
          console.error('[dsh-news-wall] 偏好解析降级：', analysis.error)
        }
        return writeJson(res, 200, snapshot())
      } catch (error) {
        return writeJson(res, 500, { ok: false, error: 'analyze-failed', message: describe(error) })
      }
    },
  }
}

/** 偏好快照：客户端编辑器与角标都用它。 */
function snapshot() {
  const prefs = readPreferences()
  return {
    ok: true,
    text: prefs.text,
    isDefault: isDefaultText(prefs.text),
    defaultText: DEFAULT_TEXT,
    profile: prefs.profile,
    analysis: prefs.analysis,
  }
}

/* ────────────────────────────── 模型调用 ────────────────────────────── */

/**
 * 建一个「把一段文本交给模型、拿回文本」的门面。
 * 任何一环不可用（没有 llm 服务 / 没有模型）都返回 null，
 * 由 analyzePreferences 退化成离线规则。
 */
async function createLlmFacade(ctx) {
  const llm = ctx.get('llm')
  if (llm === undefined || llm === null) return null
  const selection = await resolveModel(ctx, llm)
  if (selection === null) return null

  return {
    label: `${selection.provider}/${selection.model}`,
    async complete(system, user, options = {}) {
      let output = ''
      const stream = llm.stream({
        provider: selection.provider,
        model: selection.model,
        system,
        messages: [{ role: 'user', content: [{ type: 'text', text: user }] }],
        temperature: 0,
        maxTokens: options.maxTokens ?? 900,
        signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
      })
      for await (const chunk of stream) {
        if (chunk === null || typeof chunk !== 'object') continue
        if (chunk.type === 'text-delta' && typeof chunk.text === 'string') output += chunk.text
        if (chunk.type === 'finish' && chunk.reason && chunk.reason.kind !== 'stop' && output.trim().length === 0) {
          const failure = chunk.reason.failure
          throw new Error(`模型未返回内容（${chunk.reason.kind}${failure && failure.message ? `：${failure.message}` : ''}）`)
        }
      }
      return output
    },
  }
}

/** 默认模型 → 第一个可用 provider 的第一个模型。 */
async function resolveModel(ctx, llm) {
  try {
    const selector = ctx.get('agentDefaultModel')
    if (selector !== undefined && selector !== null && typeof selector.currentSelection === 'function') {
      const selection = selector.currentSelection()
      if (selection !== null && typeof selection === 'object'
        && typeof selection.provider === 'string' && selection.provider.length > 0
        && typeof selection.model === 'string' && selection.model.length > 0) {
        return { provider: selection.provider, model: selection.model }
      }
    }
  } catch (error) {
    console.error('[dsh-news-wall] 读取默认模型失败：', error)
  }

  try {
    const providers = await Promise.resolve(llm.listProviders())
    for (const provider of Array.isArray(providers) ? providers : []) {
      const id = provider !== null && typeof provider === 'object' ? provider.id : null
      if (typeof id !== 'string' || id.length === 0) continue
      const models = await llm.listModels(id)
      const first = Array.isArray(models) ? models[0] : null
      const modelId = first !== null && typeof first === 'object' ? first.id : null
      if (typeof modelId === 'string' && modelId.length > 0) return { provider: id, model: modelId }
    }
  } catch (error) {
    console.error('[dsh-news-wall] 枚举模型失败：', error)
  }

  return null
}

/* ────────────────────────────── 工具 ────────────────────────────── */

async function readJsonBody(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > BODY_LIMIT) throw new Error('body too large')
    chunks.push(buffer)
  }
  const text = Buffer.concat(chunks).toString('utf8')
  if (text.trim().length === 0) return {}
  return JSON.parse(text)
}

/**
 * 只服务本机：socket 必须是回环地址，且不是跨站页面发起的请求
 * （跨站请求带 `sec-fetch-site: cross-site`，可挡住任意网页读取本机聚合结果）。
 */
function trusted(req) {
  const address = req.socket?.remoteAddress ?? ''
  const loopback =
    address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1' || address === '::ffff:7f00:1'
  if (!loopback) return false
  const site = req.headers['sec-fetch-site']
  if (typeof site === 'string' && site.toLowerCase() === 'cross-site') return false
  return true
}

function writeJson(res, status, body) {
  const text = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(text),
    'cache-control': 'no-store',
    'referrer-policy': 'no-referrer',
  })
  res.end(text)
}

function describe(error) {
  if (error instanceof Error) return error.message.length > 160 ? `${error.message.slice(0, 159)}…` : error.message
  return String(error).slice(0, 160)
}

/** 往 index.html 的 <head> 里塞一行启动配置。 */
function makeIndexTap(port) {
  const config = JSON.stringify({
    api: FEED_PATH,
    prefs: PREFS_PATH,
    port: Number.isFinite(Number(port)) ? Number(port) : null,
  })
  const tag = `<script>window.${BOOT_GLOBAL}=${config}</script>`
  return (html) => {
    if (typeof html !== 'string' || html.includes(BOOT_GLOBAL)) return html
    if (/<head(\s[^>]*)?>/i.test(html)) {
      return html.replace(/<head(\s[^>]*)?>/i, (match) => `${match}${tag}`)
    }
    return `${tag}${html}`
  }
}
