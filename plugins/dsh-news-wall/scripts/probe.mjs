/**
 * 数据层自检：真实抓一遍全部新闻源，打印可用性、条数、耗时与最新一条的时龄。
 *
 *   node scripts/probe.mjs            正常抓取
 *   node scripts/probe.mjs --dump 6   额外打印每个板块前 6 条标题
 */

import { getFeed } from '../src/feed.mjs'
import { SOURCES } from '../src/sources.mjs'

const dumpCount = (() => {
  const index = process.argv.indexOf('--dump')
  if (index === -1) return 0
  return Number.parseInt(process.argv[index + 1] ?? '5', 10) || 5
})()

const started = Date.now()
const payload = await getFeed({ force: true })
const elapsed = Date.now() - started

const pad = (value, width) => String(value).padEnd(width, ' ')
const padStart = (value, width) => String(value).padStart(width, ' ')

console.log(`\n抓取完成：${elapsed}ms  条目 ${payload.stats.total}  ` +
  `源 ${payload.stats.sources - payload.stats.failed}/${payload.stats.sources} 可用\n`)

console.log(`${pad('源', 18)}${pad('板块', 7)}${padStart('条数', 5)}${padStart('耗时', 8)}  最新时龄 / 状态`)
console.log('─'.repeat(84))

for (const source of payload.sources) {
  const meta = SOURCES.find((item) => item.id === source.id)
  let freshness = '—'
  if (source.ok) {
    // 该源最新一条的时龄（热榜无时间，标记为「实时」）。
    const ages = payload.categories
      .flatMap((category) => category.items)
      .filter((item) => item.sourceId === source.id && item.publishedAt !== null)
      .map((item) => Date.now() - new Date(item.publishedAt).getTime())
    if (ages.length > 0) {
      const hours = Math.min(...ages) / 3_600_000
      freshness = hours < 1 ? `${Math.round(hours * 60)} 分钟前` : `${hours.toFixed(1)} 小时前`
    } else {
      freshness = meta?.category === 'hot' ? '实时热榜' : '无时间字段'
    }
  } else {
    freshness = `✗ ${source.error}`
  }
  console.log(
    `${pad(source.name + (source.subtitle ? `·${source.subtitle}` : ''), 18)}` +
    `${pad(source.category, 7)}${padStart(source.count, 5)}${padStart(`${source.ms}ms`, 8)}  ${freshness}`,
  )
}

console.log('')
for (const category of payload.categories) {
  console.log(`【${category.label}】 ${category.items.length} 条`)
  for (const item of category.items.slice(0, dumpCount)) {
    const heat = item.heat === null || item.heat === undefined ? '' : ` · ${formatHeat(item.heat)}`
    const tag = item.tag ? `[${item.tag}]` : ''
    console.log(`  ${tag}${item.title}  — ${item.source}${heat}`)
  }
  console.log('')
}

function formatHeat(value) {
  if (value >= 100_000_000) return `${(value / 100_000_000).toFixed(1)}亿`
  if (value >= 10_000) return `${Math.round(value / 10_000)}万`
  return String(value)
}
