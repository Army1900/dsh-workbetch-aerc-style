/**
 * 时事大屏 · 新闻源定义与解析层
 *
 * 每个源声明：id / 展示名 / 所属板块 / 抓取方式（rss | json | html）/ 地址 / 解析器。
 * 解析器一律输出统一的条目形状：
 *
 *   {
 *     id, title, url, summary, publishedAt, source, sourceId, category, lang,
 *     rank?, heat?, tag?
 *   }
 *
 * 说明：本文件刻意零依赖 —— 不引 XML/HTML 库，用带边界约束的正则解析 RSS/Atom，
 * 用 JSON.parse 解析 JSON 接口，仅对百度热搜这类把 JSON 内嵌在注释里的页面做定点提取。
 */

/** 抓取时使用的浏览器 UA：部分国内源对默认 UA 返回空壳。 */
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15'

/** 板块定义（顺序即大屏列顺序）。 */
export const CATEGORIES = [
  { id: 'cn', label: '国内要闻' },
  { id: 'world', label: '国际时事' },
  { id: 'tech', label: '科技 · AI' },
  { id: 'hot', label: '全网热榜' },
]

/** 每个板块在大屏上展示的最大条数。 */
export const CATEGORY_LIMIT = { cn: 14, world: 12, tech: 16, hot: 20 }

/**
 * 源清单。全部经本机实测可用（见 scripts/probe.mjs），并已剔除若干「看着能用、
 * 其实停更」的源：新华网 RSS 停更于 2022-12、人民网 RSS 停更于 2025-06、
 * 澎湃/财新/联合早报官方 RSS 已下线或需签名。
 */
export const SOURCES = [
  // ── 国内要闻 ────────────────────────────────────────────────
  {
    id: 'chinanews-scroll',
    name: '中国新闻网',
    subtitle: '即时',
    category: 'cn',
    kind: 'rss',
    url: 'https://www.chinanews.com.cn/rss/scroll-news.xml',
  },
  {
    id: 'jiemian',
    name: '界面新闻',
    category: 'cn',
    kind: 'rss',
    url: 'https://a.jiemian.com/index.php?m=article&a=rss',
    // 界面 RSS 里的 <img> 是 2022 年的品牌占位图，不是文章配图 —— 别用。
    images: false,
  },
  {
    id: 'google-news-cn',
    name: 'Google 新闻',
    subtitle: '中文',
    category: 'cn',
    kind: 'rss',
    url: 'https://news.google.com/rss?hl=zh-CN&gl=CN&ceid=CN:zh-Hans',
  },

  // ── 国际时事 ────────────────────────────────────────────────
  {
    id: 'chinanews-world',
    name: '中新网',
    subtitle: '国际',
    category: 'world',
    kind: 'rss',
    url: 'https://www.chinanews.com.cn/rss/world.xml',
  },
  {
    id: 'rfi-cn',
    name: '法广中文',
    subtitle: 'RFI',
    category: 'world',
    kind: 'rss',
    url: 'https://www.rfi.fr/cn/rss',
  },
  {
    id: 'bbc-world',
    name: 'BBC News',
    subtitle: 'World',
    category: 'world',
    kind: 'rss',
    url: 'https://feeds.bbci.co.uk/news/world/rss.xml',
    lang: 'en',
  },
  {
    id: 'dw-cn',
    name: '德国之声',
    subtitle: '中文',
    category: 'world',
    kind: 'rss',
    url: 'https://rss.dw.com/rdf/rss-chi-all',
  },
  {
    id: 'nytimes-cn',
    name: '纽约时报中文网',
    category: 'world',
    kind: 'rss',
    url: 'https://cn.nytimes.com/rss/',
  },

  // ── 科技 · AI ──────────────────────────────────────────────
  {
    id: 'ithome',
    name: 'IT之家',
    category: 'tech',
    kind: 'rss',
    url: 'https://www.ithome.com/rss/',
  },
  {
    id: '36kr',
    name: '36氪',
    category: 'tech',
    kind: 'rss',
    url: 'https://www.36kr.com/feed',
  },
  {
    id: 'qbitai',
    name: '量子位',
    subtitle: 'AI',
    category: 'tech',
    kind: 'rss',
    url: 'https://www.qbitai.com/feed',
  },
  {
    id: 'infoq-cn',
    name: 'InfoQ 中文',
    category: 'tech',
    kind: 'rss',
    url: 'https://www.infoq.cn/feed',
  },
  {
    id: 'sspai',
    name: '少数派',
    category: 'tech',
    kind: 'rss',
    url: 'https://sspai.com/feed',
  },
  {
    id: 'ifanr',
    name: '爱范儿',
    category: 'tech',
    kind: 'rss',
    url: 'https://www.ifanr.com/feed',
  },
  {
    id: 'verge',
    name: 'The Verge',
    category: 'tech',
    kind: 'rss',
    url: 'https://www.theverge.com/rss/index.xml',
    lang: 'en',
  },
  {
    id: 'ars',
    name: 'Ars Technica',
    category: 'tech',
    kind: 'rss',
    url: 'https://feeds.arstechnica.com/arstechnica/index',
    lang: 'en',
  },

  // ── 全网热榜 ────────────────────────────────────────────────
  {
    id: 'weibo-hot',
    name: '微博热搜',
    category: 'hot',
    kind: 'json',
    parse: 'weibo',
    url: 'https://weibo.com/ajax/side/hotSearch',
    headers: { referer: 'https://weibo.com/' },
  },
  {
    id: 'zhihu-hot',
    name: '知乎热榜',
    category: 'hot',
    kind: 'json',
    parse: 'newsnow',
    url: 'https://newsnow.busiyi.world/api/s?id=zhihu',
  },
  {
    id: 'toutiao-hot',
    name: '头条热榜',
    category: 'hot',
    kind: 'json',
    parse: 'toutiao',
    url: 'https://www.toutiao.com/hot-event/hot-board/?origin=toutiao_pc',
  },
  {
    id: 'douyin-hot',
    name: '抖音热点',
    category: 'hot',
    kind: 'json',
    parse: 'newsnow',
    url: 'https://newsnow.busiyi.world/api/s?id=douyin',
  },
  {
    id: 'baidu-hot',
    name: '百度热搜',
    category: 'hot',
    kind: 'html',
    parse: 'baidu',
    url: 'https://top.baidu.com/board?tab=realtime',
  },
]

// ── 文本工具 ──────────────────────────────────────────────────

/** 常见命名实体（够用即可，数字实体走通用分支）。 */
const ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ensp: ' ',
  emsp: ' ',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  middot: '·',
  ldquo: '“',
  rdquo: '”',
  lsquo: '‘',
  rsquo: '’',
  laquo: '«',
  raquo: '»',
  copy: '©',
}

/** 解码 XML/HTML 实体，含十进制与十六进制数字实体。 */
export function decodeEntities(input) {
  return String(input).replace(/&(#[xX]?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (match, body) => {
    if (body[0] === '#') {
      const hex = body[1] === 'x' || body[1] === 'X'
      const code = Number.parseInt(hex ? body.slice(2) : body.slice(1), hex ? 16 : 10)
      if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return match
      try {
        return String.fromCodePoint(code)
      } catch {
        return match
      }
    }
    const known = ENTITIES[body.toLowerCase()]
    return known === undefined ? match : known
  })
}

/** 去掉 CDATA 包装。 */
function unwrapCdata(value) {
  const match = /^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/.exec(value)
  return match ? match[1] : value
}

/** 去标签（含 script/style），供摘要使用。 */
function stripTags(value) {
  return String(value)
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
}

/** 标题/摘要清洗：解码 → 去标签 → 再解码 → 折叠空白。 */
export function cleanText(value) {
  const once = decodeEntities(unwrapCdata(String(value)))
  const stripped = stripTags(once)
  return decodeEntities(stripped).replace(/\s+/g, ' ').trim()
}

/** 按最大长度截断（按码点计数，避免截断代理对）。 */
export function truncate(value, max) {
  const chars = Array.from(value)
  if (chars.length <= max) return value
  return `${chars.slice(0, max - 1).join('').trimEnd()}…`
}

/** 抓取全部匹配的子块（如所有 <item> 或 <entry>）。 */
function blocks(xml, tag) {
  const pattern = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'gi')
  const found = []
  let match
  while ((match = pattern.exec(xml)) !== null) found.push(match[1])
  return found
}

/** 取第一个命中标签的内部文本。 */
function firstTag(block, names) {
  for (const name of names) {
    const pattern = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i')
    const match = pattern.exec(block)
    if (match) return match[1]
  }
  return ''
}

/** 链接：优先 RSS 的 <link> 文本，其次 Atom 的 <link href>，最后 <guid>。 */
function linkOf(block) {
  const rssLink = /<link(?:\s[^>]*)?>([\s\S]*?)<\/link>/i.exec(block)
  if (rssLink) {
    const value = cleanText(rssLink[1])
    if (/^https?:\/\//i.test(value)) return value
  }
  const atomLink = /<link\b[^>]*\bhref=["']([^"']+)["']/i.exec(block)
  if (atomLink) return decodeEntities(atomLink[1]).trim()
  const guid = /<guid\b[^>]*>([\s\S]*?)<\/guid>/i.exec(block)
  if (guid) {
    const value = cleanText(guid[1])
    if (/^https?:\/\//i.test(value)) return value
  }
  return ''
}

/** 发布时间：兼容 RSS/Atom/DC 的多种字段名。 */
function dateOf(block) {
  for (const name of ['pubDate', 'published', 'updated', 'dc:date', 'date', 'lastBuildDate']) {
    const raw = firstTag(block, [name])
    if (!raw) continue
    const value = cleanText(raw)
    if (!value) continue
    const parsed = new Date(value)
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString()
  }
  return null
}

/** 明显不是配图的地址：追踪像素、统计、矢量/动图、超长内联数据。 */
const IMAGE_DENY = /(feedburner|doubleclick|googletagmanager|google-analytics|analytics|\/pixel|stat\.)|\/1x1|spacer\.(gif|png)|\.(svg|gif)(\?|$)/i

/** 归一化图片地址：补协议、修重复协议头（界面会给出 `https:https://…`）。 */
function normalizeImageUrl(value) {
  if (typeof value !== 'string') return null
  let url = decodeEntities(value).trim()
  if (url.length === 0 || url.length > 512) return null
  // 去掉重复的协议前缀：https:https://x → https://x
  url = url.replace(/^(?:https?:)+(?=https?:\/\/)/i, '')
  if (url.startsWith('//')) url = `https:${url}`
  if (!/^https?:\/\//i.test(url)) return null
  if (IMAGE_DENY.test(url)) return null
  return url
}

/**
 * 从一条 feed 条目里找出配图，依次尝试：
 * enclosure → media:content / media:thumbnail → 正文里的第一个 <img>。
 * 拿不到就返回 null（上游大部分条目本来就没有图）。
 */
function imageOf(block) {
  const enclosure = /<enclosure\b[^>]*\burl=["']([^"']+)["']/i.exec(block)
  if (enclosure) {
    const url = normalizeImageUrl(enclosure[1])
    if (url !== null) return url
  }
  const media = /<media:(?:content|thumbnail)\b[^>]*\burl=["']([^"']+)["']/i.exec(block)
  if (media) {
    const url = normalizeImageUrl(media[1])
    if (url !== null) return url
  }
  const body = firstTag(block, ['content:encoded', 'content', 'description', 'summary'])
  if (body) {
    const img = /<img\b[^>]*\bsrc=["']([^"']+)["']/i.exec(body)
    if (img) {
      const url = normalizeImageUrl(img[1])
      if (url !== null) return url
    }
  }
  return null
}

/** RSS 2.0 / Atom 通用解析。 */
function parseFeed(xml, source) {
  let items = blocks(xml, 'item')
  if (items.length === 0) items = blocks(xml, 'entry')

  const out = []
  for (const block of items) {
    const title = cleanText(firstTag(block, ['title']))
    if (!title) continue
    const summaryRaw = cleanText(firstTag(block, ['description', 'summary', 'content:encoded', 'content']))
    const summary = summaryRaw === title ? '' : truncate(summaryRaw, 180)
    out.push({
      title: truncate(title, 120),
      url: linkOf(block),
      summary,
      publishedAt: dateOf(block),
      image: source.images === false ? null : imageOf(block),
    })
  }

  // 绝大多数源按时间倒序，但个别源顺序混乱：有时间的按时间排，没时间的保持原序。
  const dated = out.filter((item) => item.publishedAt !== null)
  if (dated.length >= Math.ceil(out.length / 2)) {
    out.sort((a, b) => String(b.publishedAt ?? '').localeCompare(String(a.publishedAt ?? '')))
  }
  return out.map((item) => ({ ...item, ...stamp(item, source) }))
}

/** 头条热榜 JSON。 */
function parseToutiao(json, source) {
  const list = Array.isArray(json?.data) ? json.data : []
  return list
    .filter((row) => typeof row?.Title === 'string' && row.Title.length > 0)
    .map((row, index) => ({
      title: cleanText(row.Title),
      url: typeof row.Url === 'string' ? row.Url : '',
      summary: '',
      publishedAt: null,
      rank: index + 1,
      heat: toNumber(row.HotValue),
      tag: tagOfToutiao(row.Label),
      ...stamp(null, source),
    }))
}

function tagOfToutiao(label) {
  if (label === 'hot') return '热'
  if (label === 'new') return '新'
  if (typeof label === 'string' && label.length > 0) return '荐'
  return ''
}

/** 微博热搜 JSON。 */
function parseWeibo(json, source) {
  const list = Array.isArray(json?.data?.realtime) ? json.data.realtime : []
  return list
    .map((row, index) => {
      const word = cleanText(row?.note ?? row?.word ?? '')
      if (!word) return null
      const query = cleanText(row?.word_scheme ?? row?.word ?? word)
      return {
        title: word,
        url: `https://s.weibo.com/weibo?q=${encodeURIComponent(`#${query}#`)}`,
        summary: '',
        publishedAt: null,
        rank: index + 1,
        heat: toNumber(row?.num ?? row?.raw_hot),
        tag: cleanText(row?.label_name ?? ''),
        ...stamp(null, source),
      }
    })
    .filter(Boolean)
}

/**
 * newsnow 聚合接口（知乎/抖音等站内热榜的公共镜像）。
 * 形状：{ status, id, updatedTime, items: [{ id, title, url, extra: { info } }] }
 * 其中 extra.info 是「3158 万热度」这类人类可读热度，需要抠出数字。
 */
function parseNewsnow(json, source) {
  const list = Array.isArray(json?.items) ? json.items : []
  return list
    .filter((row) => typeof row?.title === 'string' && row.title.length > 0)
    .map((row, index) => ({
      title: cleanText(row.title),
      url: typeof row.url === 'string' ? row.url : typeof row.mobileUrl === 'string' ? row.mobileUrl : '',
      summary: '',
      publishedAt: null,
      rank: index + 1,
      heat: heatFromInfo(row?.extra?.info),
      tag: '',
      ...stamp(null, source),
    }))
}

/** 从「3158 万热度」这类文案里换算成数字。 */
function heatFromInfo(info) {
  if (typeof info !== 'string') return null
  const match = /([\d.]+)\s*(亿|万)?/.exec(info)
  if (!match) return null
  const value = Number.parseFloat(match[1])
  if (!Number.isFinite(value)) return null
  if (match[2] === '亿') return Math.round(value * 100_000_000)
  if (match[2] === '万') return Math.round(value * 10_000)
  return Math.round(value)
}

/** 百度热搜：JSON 内嵌在 HTML 注释 <!--s-data:{...}--> 中。 */
function parseBaidu(html, source) {
  const match = /<!--s-data:([\s\S]*?)-->/.exec(html)
  if (!match) return []
  let parsed
  try {
    parsed = JSON.parse(match[1])
  } catch {
    return []
  }
  const card = parsed?.data?.cards?.[0]
  const list = Array.isArray(card?.content) ? card.content : []
  return list
    .filter((row) => typeof row?.word === 'string' && row.word.length > 0)
    .map((row, index) => ({
      title: cleanText(row.word),
      url: typeof row.url === 'string' ? row.url : typeof row.rawUrl === 'string' ? row.rawUrl : '',
      summary: truncate(cleanText(row.desc ?? ''), 120),
      publishedAt: null,
      rank: index + 1,
      heat: toNumber(row.hotScore),
      tag: '',
      ...stamp(null, source),
    }))
}

function toNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value.replace(/[^\d.]/g, ''))
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

/** 补齐来源标记与稳定 id。 */
function stamp(item, source) {
  const stableKey = item?.url || item?.title || ''
  return {
    id: `${source.id}:${hash(stableKey)}`,
    source: source.name,
    sourceSubtitle: source.subtitle ?? '',
    sourceId: source.id,
    category: source.category,
    lang: source.lang ?? 'zh',
  }
}

/** 标题归一化用的指纹：去掉空白、标点与全角符号。 */
export function fingerprint(title) {
  return String(title)
    .toLowerCase()
    .replace(/[\s\u3000]/g, '')
    .replace(/[!-/:-@[-`{-~。，、；：？！“”‘’（）《》【】…—·]/g, '')
}

/** 32 位 FNV-1a，仅用于生成稳定 id（非加密用途）。 */
function hash(value) {
  let h = 0x811c9dc5
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(36)
}

/** 按声明的方式解析响应体。 */
export function parsePayload(source, payload) {
  if (source.kind === 'rss') return parseFeed(payload, source)
  if (source.kind === 'html') return parseBaidu(payload, source)
  let json
  try {
    json = JSON.parse(payload)
  } catch {
    return []
  }
  if (source.parse === 'weibo') return parseWeibo(json, source)
  if (source.parse === 'newsnow') return parseNewsnow(json, source)
  return parseToutiao(json, source)
}

// ── 网络层 ────────────────────────────────────────────────────

/** 把 charset 名归一化到 TextDecoder 认识的名字。 */
function normalizeCharset(value) {
  if (typeof value !== 'string' || value.length === 0) return 'utf-8'
  const name = value.trim().toLowerCase()
  if (name === 'gb2312' || name === 'gb-2312') return 'gbk'
  if (name === 'utf8') return 'utf-8'
  return name
}

/** 从 content-type 或 XML 声明里嗅探字符集。 */
function sniffCharset(contentType, head) {
  const fromHeader = /charset=["']?([\w-]+)/i.exec(contentType ?? '')
  if (fromHeader) return normalizeCharset(fromHeader[1])
  const fromXml = /<\?xml[^>]*encoding=["']([\w-]+)["']/i.exec(head)
  if (fromXml) return normalizeCharset(fromXml[1])
  const fromMeta = /charset=["']?([\w-]+)/i.exec(head)
  if (fromMeta) return normalizeCharset(fromMeta[1])
  return 'utf-8'
}

/**
 * 带超时、重定向与字符集嗅探的文本抓取。
 *
 * 本机 DNS 被本地代理接管，个别站点会间歇性 TLS 抖动，因此失败重试一次
 * （400ms 退避）；两次都失败才向上抛，由聚合层记为该源不可用。
 *
 * @param {object} source 源定义
 * @param {number} timeoutMs 单次尝试超时毫秒
 * @returns {Promise<{ text: string, status: number, ms: number }>}
 */
export async function fetchSource(source, timeoutMs) {
  const started = Date.now()
  try {
    const result = await requestOnce(source, timeoutMs)
    return { ...result, ms: Date.now() - started }
  } catch (firstError) {
    await sleep(400)
    try {
      const result = await requestOnce(source, timeoutMs)
      return { ...result, ms: Date.now() - started }
    } catch {
      throw firstError
    }
  }
}

/** 单次请求 + 解码。 */
async function requestOnce(source, timeoutMs) {
  const response = await fetch(source.url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      'user-agent': UA,
      accept:
        source.kind === 'html'
          ? 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
          : 'application/rss+xml,application/atom+xml,application/xml,application/json,text/html;q=0.8,*/*;q=0.5',
      'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
      ...(source.headers ?? {}),
    },
  })
  const buffer = Buffer.from(await response.arrayBuffer())
  const head = buffer.subarray(0, 400).toString('latin1')
  const charset = sniffCharset(response.headers.get('content-type'), head)
  let text
  try {
    text = new TextDecoder(charset, { fatal: false }).decode(buffer)
  } catch {
    text = buffer.toString('utf8')
  }
  // 钛媒体等源会在 XML 前带上空白/BOM，统一清掉，避免下游 JSON/XML 解析踩坑。
  return { text: text.replace(/^\uFEFF/, '').trimStart(), status: response.status }
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}
