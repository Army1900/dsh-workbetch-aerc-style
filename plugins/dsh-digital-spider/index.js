/**
 * 数字蜘蛛 · Host 半部
 *
 * 这只宠物看不见的东西都在这里读：
 *   1. 会话推进：订阅 `api-session/status` / `api-session/activity`，
 *      再经 `sessionQuery` 补标题与最近一句助手回复；
 *   2. 定时任务：读 `schedule.catalog()`，到点前 2 分钟与触发时各推一次事件；
 *   3. 点子：会话收尾后等 2 秒，读这个会话的标题与最近用户/助手片段，
 *      加载本地 OpenMind 技能集合，选 1-2 个技能一起交给默认模型，
 *      输出结构化 JSON（title / suggestion / rationale / skill）；
 *      自动点子失败时不硬凑，手动按钮保留本地模板兜底。
 *
 * 浏览器半部不碰任何 Host 私有对象：它只轮询本插件自己的两个端点
 *   GET  /dsh-digital-spider/state
 *   POST /dsh-digital-spider/idea
 * 所以刷新页面、切换主题、甚至重开浏览器都不会打断这只蜘蛛。
 *
 * 端点刻意放在 `/api` 之外：`/api` 是框架的前缀路由，精确路由会被它先吃掉。
 * 只服务回环地址与同源页面；不落盘、不额外注册工具、不写会话日志。
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join } from 'node:path'

export const name = 'dsh-digital-spider'

/** 浏览器半部要能取到状态，所以等 Web 载体就绪。 */
export const inject = ['webServer']

export const STATE_PATH = '/dsh-digital-spider/state'
export const IDEA_PATH = '/dsh-digital-spider/idea'

/** 巡游节拍：状态推送、任务倒计时、点子生成都靠这一个 tick。 */
const TICK_MS = 4_000
/** 内存里保留的宠物事件条数。 */
const MAX_EVENTS = 32
/** 快照里最多带多少个会话。 */
const MAX_SESSIONS = 28
/** 定时任务目录刷新间隔。 */
const SCHEDULE_REFRESH_MS = 30_000
/** 会话列表刷新间隔。 */
const SESSION_LIST_REFRESH_MS = 120_000
/** 缺少标题时的补读间隔。 */
const TITLE_REFRESH_MS = 45_000
/** 任务触发前多久开始提醒。 */
const SCHEDULE_LEAD_MS = 120_000
/** 触发后仍保留提醒的宽限窗口。 */
const SCHEDULE_GRACE_MS = 90_000
/** 同一会话的「收尾」提醒最小间隔，避免每轮都跑一趟。 */
const SESSION_REST_COOLDOWN_MS = 120_000
/** 超过这个时间没有活动的「running」记录视为陈旧，不再计入推进中。 */
const RUNNING_STALE_MS = 12 * 60 * 60_000
/** 两次自动点子之间的最小间隔。 */
const IDEA_GAP_MS = 2 * 60_000
/** 同一会话的点子冷却，避免每次收尾都冒。 */
const SESSION_IDEA_COOLDOWN_MS = 20 * 60_000
/** 收尾后等几秒再生成，让最后一条消息落盘。 */
const IDEA_DEBOUNCE_MS = 2_000
/** 太短的会话不生成点子。 */
const IDEA_MIN_SESSION_MS = 45_000
/** openmind 技能目录扫描缓存。 */
const OPENMIND_CACHE_MS = 30_000
const OPENMIND_MAX_SKILL_CHARS = 2_600
const OPENMIND_MAX_IDEAS = 20
/** 单次推演最多读多少上下文。 */
const IDEA_CONTEXT_CHARS = 700
const IDEA_MAX_TOKENS = 900
const BODY_LIMIT = 16 * 1024

/* ────────────────────────────── 插件入口 ────────────────────────────── */

export function apply(ctx, config = {}) {
  const state = createState(ctx, config)

  /* 进程退出时让在途的异步工作安静下来。 */
  ctx.effect(() => () => {
    state.disposed = true
    if (state.pendingIdeaTimer) {
      clearTimeout(state.pendingIdeaTimer)
      state.pendingIdeaTimer = null
    }
  }, 'digital-spider: disposal flag')

  /* 会话与任务事件。全部是 fire-and-forget，监听器只更新内存。 */
  ctx.effect(() => {
    const disposers = []
    const on = (name, listener) => {
      try {
        const off = ctx.on(name, listener)
        if (typeof off === 'function') disposers.push(off)
      } catch (error) {
        console.error(`[digital-spider] 订阅 ${name} 失败：`, error)
      }
    }

    on('api-session/added', (summary) => {
      upsertSummary(state, summary)
    })

    on('api-session/status', (sessionId, running) => {
      handleStatus(state, sessionId, running === true)
    })

    on('api-session/activity', (sessionId, updatedAt) => {
      const record = ensureRecord(state, sessionId)
      record.updatedAt = Number(updatedAt) || Date.now()
    })

    on('api-session/removed', (sessionId) => {
      const record = state.sessions.get(sessionId)
      if (record) record.running = false
    })

    on('schedule/changed', () => {
      state.scheduleDirty = true
    })

    return () => {
      for (const off of disposers) {
        try {
          off()
        } catch {
          /* 单个 disposer 失败不影响其余清理。 */
        }
      }
    }
  }, 'digital-spider: host event feed')

  /* 浏览器端点。 */
  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'exact',
        path: STATE_PATH,
        handler: (req, res) => handleState(state, req, res),
      }),
    'digital-spider: state route',
  )

  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'exact',
        path: IDEA_PATH,
        handler: (req, res) => handleIdea(state, req, res),
      }),
    'digital-spider: idea route',
  )

  /* 暖机 + 常驻节拍。 */
  ctx.effect(() => {
    const warm = setTimeout(() => {
      void refreshSessionList(state)
      void refreshSchedules(state, true)
    }, 1_200)
    const timer = setInterval(() => tick(state), TICK_MS)
    return () => {
      clearTimeout(warm)
      clearInterval(timer)
    }
  }, 'digital-spider: patrol timer')
}

/* ────────────────────────────── 状态 ────────────────────────────── */

function createState(ctx, config) {
  const state = {
    ctx,
    disposed: false,
    seq: 0,
    events: [],
    sessions: new Map(),
    schedules: [],
    scheduleAt: 0,
    scheduleReading: false,
    scheduleDirty: true,
    pendingFires: new Map(),
    announced: new Map(),
    listAt: 0,
    listReading: false,
    titlesAt: 0,
    titlesReading: false,
    startedAt: Date.now(),
    seenRunning: new Map(),
    lastRestAt: new Map(),
    idea: null,
    ideas: [],
    ideaBusy: false,
    nextIdeaAt: 0,
    lastIdeaBySession: new Map(),
    pendingIdeaSession: null,
    pendingIdeaTimer: null,
    openmindDir: typeof config?.openmindDir === 'string' ? config.openmindDir : '',
    openmind: null,
    openmindAt: 0,
  }
  refreshOpenmind(state, true)
  return state
}

function service(ctx, name) {
  try {
    return typeof ctx.get === 'function' ? ctx.get(name) : undefined
  } catch {
    return undefined
  }
}

/* ────────────────────────────── 会话 ────────────────────────────── */

function upsertSummary(state, summary) {
  if (!summary || typeof summary !== 'object') return
  const id = summary.sessionId
  if (typeof id !== 'string' || id.length === 0) return

  const previous = state.sessions.get(id)
  const subagent =
    summary.origin === 'subagent' ||
    typeof summary.parentSessionId === 'string' ||
    previous?.subagent === true

  const updatedAt = Number(summary.updatedAt) || previous?.updatedAt || 0
  const stale = updatedAt > 0 && Date.now() - updatedAt > RUNNING_STALE_MS

  const next = {
    id,
    title: previous?.title ?? '',
    running: summary.running === true && !stale,
    updatedAt,
    createdAt: previous?.createdAt || 0,
    blank: typeof summary.blank === 'boolean' ? summary.blank === true : previous?.blank === true,
    subagent,
    cwd: typeof summary.cwd === 'string' ? summary.cwd : previous?.cwd,
    titleTriedAt: previous?.titleTriedAt || 0,
  }
  state.sessions.set(id, next)
}

function ensureRecord(state, id) {
  let record = state.sessions.get(id)
  if (!record) {
    record = {
      id,
      title: '',
      running: false,
      updatedAt: Date.now(),
      createdAt: 0,
      blank: false,
      subagent: false,
      titleTriedAt: 0,
    }
    state.sessions.set(id, record)
  }
  return record
}

function isInteresting(state, id) {
  const record = state.sessions.get(id)
  if (!record) return true
  if (record.subagent) return false
  if (record.blank) return false
  return true
}

function titleOf(state, id) {
  const record = state.sessions.get(id)
  return record && typeof record.title === 'string' ? record.title : ''
}

function handleStatus(state, sessionId, running) {
  if (typeof sessionId !== 'string' || sessionId.length === 0) return
  const record = ensureRecord(state, sessionId)
  const wasRunning = record.running === true
  record.running = running
  record.updatedAt = Date.now()

  if (running && !wasRunning) {
    state.seenRunning.set(sessionId, Date.now())
    return
  }

  if (!running && wasRunning) {
    const startedAt = state.seenRunning.get(sessionId) || 0
    state.seenRunning.delete(sessionId)
    if (!isInteresting(state, sessionId)) return
    /* 极短的一闪（例如排队中取消）不值得跑一趟。 */
    if (Date.now() - startedAt < 4_000) return
    if (Date.now() - (state.lastRestAt.get(sessionId) || 0) < SESSION_REST_COOLDOWN_MS) return
    state.lastRestAt.set(sessionId, Date.now())
    emitSessionRest(state, sessionId)
  }
}

function emitSessionRest(state, sessionId) {
  if (state.disposed) return
  const record = state.sessions.get(sessionId)
  if (!record || record.running || record.subagent) return
  scheduleRestIdea(state, sessionId)
}

/**
 * 收尾后不要立刻推演，等最后一条消息落盘；同一会话有冷却，
 * 太短的会话不生成，避免把每轮问答都变成点子。
 */
function scheduleRestIdea(state, sessionId) {
  if (state.disposed || state.ideaBusy) return
  const record = state.sessions.get(sessionId)
  if (!record || record.running || record.subagent || !record.title) return
  const now = Date.now()
  const started = Number(record.createdAt) || 0
  if (started > 0 && (Number(record.updatedAt) || now) - started < IDEA_MIN_SESSION_MS) return
  if (now < state.nextIdeaAt) return
  if (now - (state.lastIdeaBySession.get(sessionId) || 0) < SESSION_IDEA_COOLDOWN_MS) return

  state.pendingIdeaSession = sessionId
  if (state.pendingIdeaTimer) clearTimeout(state.pendingIdeaTimer)
  state.pendingIdeaTimer = setTimeout(() => {
    state.pendingIdeaTimer = null
    const id = state.pendingIdeaSession
    state.pendingIdeaSession = null
    if (id && !state.disposed) void produceIdea(state, 'rest', id)
  }, IDEA_DEBOUNCE_MS)
}

async function refreshSessionList(state) {
  if (state.listReading || state.disposed) return
  const controller = service(state.ctx, 'sessionController')
  const query = service(state.ctx, 'sessionQuery')
  const hasController = Boolean(controller && typeof controller.list === 'function')
  const hasQuery = Boolean(query && typeof query.listSessions === 'function')
  if (!hasController && !hasQuery) return

  state.listReading = true
  try {
    /* `sessionController.list` 是唯一带 running 的权威列表；
       `agents.list()` 只说明 Agent 还活着，不代表它正在跑，不能用它当 running。 */
    const visible = new Set()
    if (hasController) {
      let value = null
      let listed = false
      try {
        value = await controller.list({}, AbortSignal.timeout(8_000))
        listed = Boolean(value && Array.isArray(value.items))
      } catch (error) {
        console.error('[digital-spider] 读取会话列表失败：', error)
      }
      const items = value && Array.isArray(value.items) ? value.items : []
      for (const summary of items) {
        if (!summary || typeof summary.sessionId !== 'string') continue
        if (summary.origin === 'subagent' || typeof summary.parentSessionId === 'string') continue
        visible.add(summary.sessionId)
        upsertSummary(state, summary)
      }
      /* 只有列表真的读成功时才把缺席的会话降为 idle；
         一次超时不能把正在跑的会话误判成结束。 */
      if (listed) {
        for (const record of state.sessions.values()) {
          if (!visible.has(record.id)) record.running = false
        }
      }
    }

    /* 持久化目录只用来补 createdAt / cwd；它没有 running 语义。 */
    if (hasQuery) {
      try {
        const records = await query.listSessions()
        const rows = []
        for (const record of Array.isArray(records) ? records : []) {
          const header = record && record.header
          if (!header || typeof header.id !== 'string') continue
          if (header.origin === 'subagent') continue
          if (typeof header.delegationDepth === 'number' && header.delegationDepth > 0) continue
          rows.push({
            id: header.id,
            createdAt: Number(header.createdAt) || 0,
            cwd: typeof header.cwd === 'string' ? header.cwd : undefined,
            live: record.live === true,
          })
        }
        rows.sort((a, b) => b.createdAt - a.createdAt)
        for (const row of rows.slice(0, 80)) {
          const previous = state.sessions.get(row.id)
          if (previous) {
            if (!previous.createdAt) previous.createdAt = row.createdAt
            if (!previous.cwd && row.cwd) previous.cwd = row.cwd
            continue
          }
          state.sessions.set(row.id, {
            id: row.id,
            title: '',
            running: false,
            updatedAt: row.createdAt,
            createdAt: row.createdAt,
            blank: false,
            subagent: false,
            cwd: row.cwd,
            titleTriedAt: 0,
          })
        }
      } catch (error) {
        console.error('[digital-spider] 读取持久化会话目录失败：', error)
      }
    }

    state.listAt = Date.now()
  } finally {
    state.listReading = false
  }
  void refreshTitles(state, true)
}

async function refreshTitles(state, force) {
  if (state.titlesReading || state.disposed) return
  if (!force && Date.now() - state.titlesAt < TITLE_REFRESH_MS) return
  const query = service(state.ctx, 'sessionQuery')
  if (!query || typeof query.readTitleSnapshots !== 'function') return

  const ids = []
  for (const record of state.sessions.values()) {
    if (record.title) continue
    if (record.subagent) continue
    if (Date.now() - (record.titleTriedAt || 0) < 15_000) continue
    ids.push(record.id)
    if (ids.length >= 40) break
  }
  if (ids.length === 0) {
    state.titlesAt = Date.now()
    return
  }

  state.titlesReading = true
  for (const id of ids) {
    const record = state.sessions.get(id)
    if (record) record.titleTriedAt = Date.now()
  }
  try {
    const results = await query.readTitleSnapshots(ids)
    for (const result of Array.isArray(results) ? results : []) {
      if (!result || result.status !== 'fulfilled' || !result.value) continue
      const snapshot = result.value
      const title =
        snapshot.title && typeof snapshot.title.title === 'string' ? snapshot.title.title.trim() : ''
      if (!title) continue
      const id =
        (typeof result.sessionId === 'string' && result.sessionId) ||
        (snapshot.session && typeof snapshot.session.id === 'string' ? snapshot.session.id : '')
      const record = state.sessions.get(id)
      if (record) record.title = clip(title, 80)
    }
    state.titlesAt = Date.now()
  } catch (error) {
    console.error('[digital-spider] 补读会话标题失败：', error)
  } finally {
    state.titlesReading = false
  }
}

async function lastMessageText(state, sessionId, type, maxChars) {
  const query = service(state.ctx, 'sessionQuery')
  if (!query || typeof query.filterEvents !== 'function') return ''
  const docs = await query.filterEvents(sessionId, [{ kind: 'type', values: [type] }])
  if (!Array.isArray(docs) || docs.length === 0) return ''
  for (let index = docs.length - 1; index >= 0; index -= 1) {
    const text = docs[index] && typeof docs[index].text === 'string' ? docs[index].text.trim() : ''
    if (text.length > 0) return clip(text, maxChars)
  }
  return ''
}

/* ────────────────────────────── 定时任务 ────────────────────────────── */

async function refreshSchedules(state, force) {
  if (state.scheduleReading || state.disposed) return
  if (!force && Date.now() - state.scheduleAt < SCHEDULE_REFRESH_MS) return
  const schedule = service(state.ctx, 'schedule')
  if (!schedule || typeof schedule.catalog !== 'function') {
    state.schedules = []
    state.scheduleAt = Date.now()
    return
  }

  state.scheduleReading = true
  try {
    const rows = await schedule.catalog()
    const next = []
    for (const row of Array.isArray(rows) ? rows : []) {
      if (!row || row.status !== 'active') continue
      const at = Date.parse(row.scheduledAt)
      if (!Number.isFinite(at)) continue
      next.push({
        id: String(row.id),
        title: clip(String(row.title || ''), 80),
        kind: String(row.kind || ''),
        scheduledAt: String(row.scheduledAt),
        at,
        sessionId: typeof row.sessionId === 'string' ? row.sessionId : '',
      })
    }
    next.sort((a, b) => a.at - b.at)
    state.schedules = next.slice(0, 16)
    state.scheduleAt = Date.now()
  } catch (error) {
    console.error('[digital-spider] 读取定时任务失败：', error)
    state.scheduleAt = Date.now()
  } finally {
    state.scheduleReading = false
  }
}

function remember(state, key) {
  state.announced.set(key, Date.now())
}

function remembered(state, key) {
  return state.announced.has(key)
}

function pruneAnnouncements(state, now) {
  if (state.announced.size < 400) return
  for (const [key, at] of state.announced) {
    if (now - at > 6 * 60 * 60_000) state.announced.delete(key)
  }
}

function checkSchedules(state, now) {
  for (const task of state.schedules) {
    const remaining = task.at - now
    const soonKey = `soon:${task.id}:${task.scheduledAt}`
    if (remaining > 0 && remaining <= SCHEDULE_LEAD_MS && !remembered(state, soonKey)) {
      remember(state, soonKey)
      state.pendingFires.set(task.id, task)
      pushEvent(state, 'schedule-soon', {
        taskId: task.id,
        title: task.title,
        scheduledAt: task.scheduledAt,
        sessionId: task.sessionId,
      })
    }
    if (remaining <= 0) {
      state.pendingFires.set(task.id, task)
    }
  }

  for (const [id, task] of state.pendingFires) {
    if (now < task.at) continue
    if (now - task.at > SCHEDULE_GRACE_MS) {
      state.pendingFires.delete(id)
      continue
    }
    const fireKey = `fire:${task.id}:${task.scheduledAt}`
    if (!remembered(state, fireKey)) {
      remember(state, fireKey)
      pushEvent(state, 'schedule-now', {
        taskId: task.id,
        title: task.title,
        scheduledAt: task.scheduledAt,
        sessionId: task.sessionId,
      })
    }
    state.pendingFires.delete(id)
  }
}

/* ────────────────────────────── 点子 ────────────────────────────── */

function pushEvent(state, kind, data) {
  if (state.disposed) return
  state.seq += 1
  const event = {
    id: `${Date.now().toString(36)}-${state.seq}`,
    kind,
    at: Date.now(),
    ...data,
  }
  state.events.push(event)
  if (state.events.length > MAX_EVENTS) {
    state.events.splice(0, state.events.length - MAX_EVENTS)
  }
}

async function produceIdea(state, trigger, requestedSessionId) {
  if (state.ideaBusy || state.disposed) return null
  state.ideaBusy = true
  state.nextIdeaAt = Date.now() + IDEA_GAP_MS

  try {
    const openmind = refreshOpenmind(state, true)
    const pick = await pickIdeaSession(state, requestedSessionId)
    if (!pick) return null
    const context = await readIdeaContext(state, pick.id)
    if (!context.userText && !context.assistantText) return null

    const skills = selectOpenmindSkills(openmind?.skills || [], pick.title, context)
    let payload = null
    let source = 'model'
    try {
      payload = await generateModelIdea(state, pick.title, context, skills)
    } catch (error) {
      console.error('[digital-spider] 模型推演失败：', error)
    }

    /* 自动点子宁可不冒，也不要硬凑一句通用话；手动按钮保留本地模板兜底。 */
    if (!payload) {
      if (trigger !== 'manual') return null
      payload = localIdeaPayload(pick.title, context, skills)
      source = 'local'
    }
    if (!payload) return null

    const idea = buildIdea(payload, pick, source, trigger, skills)
    state.idea = idea
    state.ideas.push(idea)
    if (state.ideas.length > OPENMIND_MAX_IDEAS) {
      state.ideas.splice(0, state.ideas.length - OPENMIND_MAX_IDEAS)
    }
    state.lastIdeaBySession.set(pick.id, Date.now())

    pushEvent(state, 'idea', {
      ideaId: idea.id,
      title: idea.title,
      text: idea.text,
      ideaTitle: idea.ideaTitle,
      suggestion: idea.suggestion,
      rationale: idea.rationale,
      skill: idea.skill,
      skillReason: idea.skillReason,
      sessionId: idea.sessionId,
      sessionTitle: idea.sessionTitle,
      source: idea.source,
      trigger: idea.trigger,
      format: 2,
    })
    return idea
  } catch (error) {
    console.error('[digital-spider] 生成点子失败：', error)
    return null
  } finally {
    state.ideaBusy = false
  }
}

async function pickIdeaSession(state, requestedSessionId) {
  if (requestedSessionId) {
    const record = state.sessions.get(requestedSessionId)
    if (record && !record.subagent) return record
  }
  if (state.sessions.size === 0 || Date.now() - state.listAt > SESSION_LIST_REFRESH_MS) {
    await refreshSessionList(state)
  }
  const list = [...state.sessions.values()].filter(
    (record) => record && !record.subagent && (record.title || record.updatedAt),
  )
  list.sort(
    (a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0),
  )
  return list.find((record) => record.title) || list[0] || null
}

async function readIdeaContext(state, sessionId) {
  let userText = ''
  let assistantText = ''
  try {
    userText = await lastMessageText(state, sessionId, 'user/message', IDEA_CONTEXT_CHARS)
  } catch {
    userText = ''
  }
  try {
    assistantText = await lastMessageText(state, sessionId, 'assistant/message', 500)
  } catch {
    assistantText = ''
  }
  return { userText, assistantText }
}

async function generateModelIdea(state, title, context, selectedSkills) {
  const llm = service(state.ctx, 'llm')
  if (!llm || typeof llm.stream !== 'function') return null
  const selection = await resolveModel(state.ctx, llm)
  if (!selection) return null

  const allSkills = state.openmind?.skills?.length ? state.openmind.skills : selectedSkills
  const catalog = allSkills
    .map((skill) => `- ${skill.name}: ${skill.description}`)
    .join('\n')
  const selected = selectedSkills.length > 0 ? selectedSkills : allSkills.slice(0, 1)
  const allowed = selected.map((skill) => skill.name)
  const bodies = selected
    .map((skill) => `## ${skill.name}\n${skill.body}`)
    .join('\n\n')

  const lines = [
    '你是一只趴在用户桌面上的数字蜘蛛，负责从一个刚结束的会话里冒出一个具体、可执行的点子。',
    '你会使用 OpenMind 思维技能，但输出必须是落在用户刚才工作上的下一步，不是技能说明。',
    '',
    'OpenMind 技能目录（帮助判断该用什么思维方式）：',
    catalog || '- act-on-ground: 把已确认的结论落成下一步。',
    '',
    '本轮重点参考的技能（skill 字段只能从这些名字里选）：',
    bodies || '（没有加载到 OpenMind，按 act-on-ground 的方式处理）',
    '',
    '只输出一个 JSON 对象，不要代码围栏、不要解释、不要 Markdown。字段格式：',
    '{"title":"点子标题，8-40字","suggestion":"具体下一步，20-100字","rationale":"为什么现在做/依据，15-80字","skill":"' +
      (allowed[0] || 'act-on-ground') +
      '","skillReason":"为什么用这个技能，10-60字"}',
    '要求：title 不要直接复述会话标题；suggestion 必须能马上动手；rationale 引用会话里的具体事实；skill 必须是 ' +
      allowed.join('/') +
      ' 之一。',
    '',
    `会话标题：${title || '未命名会话'}`,
  ]
  if (context.userText) lines.push(`用户最近说：${context.userText}`)
  if (context.assistantText) lines.push(`助手最近回复：${context.assistantText}`)
  lines.push('', 'JSON：')

  let text = ''
  const stream = llm.stream({
    provider: selection.provider,
    model: selection.model,
    system: '你是简洁、务实的中文创意观察器。只输出一个合法 JSON 对象。',
    messages: [{ role: 'user', content: [{ type: 'text', text: lines.join('\n') }] }],
    temperature: 0.8,
    maxTokens: IDEA_MAX_TOKENS,
    signal: AbortSignal.timeout(45_000),
  })

  for await (const chunk of stream) {
    if (!chunk || typeof chunk !== 'object') continue
    if (chunk.type === 'text-delta' && typeof chunk.text === 'string') text += chunk.text
    if (chunk.type === 'finish' && chunk.reason && chunk.reason.kind !== 'stop' && text.trim().length === 0) {
      return null
    }
  }
  return parseIdeaPayload(text, allowed)
}

async function resolveModel(ctx, llm) {
  try {
    const selector = service(ctx, 'agentDefaultModel')
    const selection = selector && typeof selector.currentSelection === 'function' ? selector.currentSelection() : null
    if (
      selection &&
      typeof selection.provider === 'string' &&
      selection.provider.length > 0 &&
      typeof selection.model === 'string' &&
      selection.model.length > 0
    ) {
      return { provider: selection.provider, model: selection.model }
    }
  } catch {
    /* 继续枚举 provider。 */
  }

  try {
    const providers = await Promise.resolve(llm.listProviders())
    for (const provider of Array.isArray(providers) ? providers : []) {
      const id = provider && typeof provider.id === 'string' ? provider.id : ''
      if (!id) continue
      const models = await llm.listModels(id)
      const first = Array.isArray(models) ? models[0] : null
      const modelId = first && typeof first.id === 'string' ? first.id : ''
      if (modelId) return { provider: id, model: modelId }
    }
  } catch (error) {
    console.error('[digital-spider] 枚举可用模型失败：', error)
  }
  return null
}

function cleanField(value, limit) {
  if (typeof value !== 'string') return ''
  return clip(
    value
      .replace(/\s+/g, ' ')
      .replace(/^["'「『]+|["'」』]+$/g, '')
      .trim(),
    limit,
  )
}

function parseIdeaPayload(raw, allowed) {
  if (typeof raw !== 'string') return null
  const text = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  let data
  try {
    data = JSON.parse(text.slice(start, end + 1))
  } catch {
    return null
  }
  const title = cleanField(data.title, 64)
  const suggestion = cleanField(data.suggestion, 220)
  const rationale = cleanField(data.rationale, 180)
  if (title.length < 4 || suggestion.length < 8) return null
  const names = Array.isArray(allowed) ? allowed : []
  const skill = names.find((name) => name === data.skill) || names[0] || ''
  return {
    title,
    suggestion,
    rationale: rationale || '基于刚才会话的收尾内容。',
    skill,
    skillReason: cleanField(data.skillReason, 120),
  }
}

function formatIdeaText(payload, sessionTitle) {
  const lines = [payload.title, payload.suggestion]
  if (payload.rationale) lines.push('', `为什么：${payload.rationale}`)
  if (payload.skill) lines.push(`技能：${payload.skill}`)
  if (sessionTitle) lines.push(`来自：${sessionTitle}`)
  return lines.join('\n')
}

function buildIdea(payload, record, source, trigger, skills) {
  const sessionTitle = record.title || ''
  return {
    id: `idea-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    ideaTitle: payload.title,
    suggestion: payload.suggestion,
    rationale: payload.rationale,
    skill: payload.skill || '',
    skillReason: payload.skillReason || '',
    text: formatIdeaText(payload, sessionTitle),
    title: sessionTitle,
    sessionTitle,
    sessionId: record.id,
    at: Date.now(),
    source,
    trigger,
    format: 2,
    skills: (skills || []).map((skill) => skill.name),
  }
}

function localIdeaPayload(title, context, skills) {
  const sessionTitle = title || '这个会话'
  const skill = skills[0]?.name || 'act-on-ground'
  return {
    title: clip(`把「${sessionTitle}」收成一个下一步`, 64),
    suggestion: clip(
      `把「${sessionTitle}」里刚确认的结论挑一条，写成可执行下一步，并补上验收条件。`,
      220,
    ),
    rationale: '会话刚结束，结论还在上下文里；先固化成下一步，再开新对话。',
    skill,
    skillReason: '用执行型技能把讨论落地，而不是继续发散。',
  }
}

const SKILL_RULES = [
  {
    name: 'constraint-flip',
    re: /(不能|没有|限制|预算|卡住|卡点|blocked|can't|cannot|constraint|limited|without)/i,
  },
  {
    name: 'deep-dream',
    re: /(想不通|灵感|换个角度|另一个角度|梦境|stuck|dream|insight|breakthrough|unexpected)/i,
  },
  {
    name: 'cross-domain',
    re: /(类比|借鉴|跨域|其他领域|别的领域|analogy|borrow|inspired|cross[- ]domain)/i,
  },
  {
    name: 'poetic-essence',
    re: /(里程碑|完成|意义|定调|诗|milestone|meaning|celebrate|poetic)/i,
  },
  {
    name: 'clarify-intent',
    re: /(目标|意图|到底要|为什么|需求|目的|goal|intent|clarify|what.*want|purpose)/i,
  },
  {
    name: 'act-on-ground',
    re: /(下一步|怎么做|落地|计划|推进|开始|next|plan|action|implement|ship)/i,
  },
  {
    name: 'reflect-anchor',
    re: /(复盘|回顾|总结|结束|完成|retro|review|reflect|lesson|wrap)/i,
  },
]

function selectOpenmindSkills(skills, title, context) {
  if (!Array.isArray(skills) || skills.length === 0) return []
  const haystack = `${title || ''}\n${context.userText || ''}\n${context.assistantText || ''}`.toLowerCase()
  const ranked = skills.map((skill) => {
    let score = 0
    const rule = SKILL_RULES.find((entry) => entry.name === skill.name)
    if (rule && rule.re.test(haystack)) score += 6
    if (skill.name === 'act-on-ground') score += 1
    const tokens = String(skill.description || '')
      .toLowerCase()
      .match(/[a-z\u4e00-\u9fff]{2,}/g) || []
    for (const token of tokens) {
      if (token.length >= 2 && haystack.includes(token)) score += 1
    }
    return { skill, score }
  })
  ranked.sort((a, b) => b.score - a.score)
  const picked = []
  for (const entry of ranked) {
    if (picked.length >= 2) break
    if (entry.score <= 0 && picked.length > 0) continue
    if (!picked.some((skill) => skill.name === entry.skill.name)) picked.push(entry.skill)
  }
  if (picked.length === 0) picked.push(ranked[0].skill)
  return picked
}

function resolveOpenmindDir(state) {
  const candidates = [
    state.openmindDir,
    process.env.DSH_OPENMIND_DIR,
    process.env.DSH_HOME ? join(process.env.DSH_HOME, 'openmind') : '',
    join(homedir(), '.dsh', 'openmind'),
    join(homedir(), 'WorkSpace-dsh', 'external', 'openmind'),
    join(homedir(), 'WorkSpace', 'external', 'openmind'),
  ]
  for (const dir of candidates) {
    if (!dir) continue
    try {
      if (existsSync(join(dir, 'plugins')) || existsSync(join(dir, '.claude-plugin'))) return dir
    } catch {
      /* 继续下一个候选目录。 */
    }
  }
  return ''
}

function parseSkillMarkdown(raw, file) {
  const match = String(raw).match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  const front = match ? match[1] : ''
  const body = (match ? match[2] : String(raw)).trim()
  if (!body) return null
  const nameMatch = front.match(/^name:\s*(.+)$/m)
  const descMatch = front.match(/^description:\s*(.+)$/m)
  const name = nameMatch ? nameMatch[1].trim() : basename(dirname(file))
  const description = descMatch ? descMatch[1].trim() : ''
  return {
    name,
    description,
    body: body.slice(0, OPENMIND_MAX_SKILL_CHARS),
    file,
  }
}

function loadOpenmindSkills(root) {
  const skills = []
  const seen = new Set()
  const walk = (directory, depth) => {
    if (depth > 5) return
    let entries = []
    try {
      entries = readdirSync(directory, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (entry.name === '.git' || entry.name === 'node_modules') continue
      const full = join(directory, entry.name)
      if (entry.isDirectory()) {
        walk(full, depth + 1)
        continue
      }
      if (entry.name !== 'SKILL.md') continue
      try {
        const skill = parseSkillMarkdown(readFileSync(full, 'utf8'), full)
        if (skill && !seen.has(skill.name)) {
          seen.add(skill.name)
          skills.push(skill)
        }
      } catch {
        /* 单个技能读失败不影响其余。 */
      }
    }
  }
  walk(join(root, 'plugins'), 0)
  skills.sort((a, b) => a.name.localeCompare(b.name))
  return skills
}

function refreshOpenmind(state, force = false) {
  const now = Date.now()
  if (!force && state.openmind && now - state.openmindAt < OPENMIND_CACHE_MS) return state.openmind
  state.openmindAt = now
  const root = resolveOpenmindDir(state)
  if (!root) {
    state.openmind = { available: false, root: '', skills: [], at: now }
    return state.openmind
  }
  try {
    const skills = loadOpenmindSkills(root)
    state.openmind = { available: skills.length > 0, root, skills, at: now }
  } catch (error) {
    console.error('[digital-spider] 读取 OpenMind 技能失败：', error)
    state.openmind = { available: false, root, skills: [], at: now }
  }
  return state.openmind
}

/* ────────────────────────────── 节拍 ────────────────────────────── */

function tick(state) {
  if (state.disposed) return
  const now = Date.now()

  if (state.scheduleDirty || now - state.scheduleAt > SCHEDULE_REFRESH_MS) {
    state.scheduleDirty = false
    void refreshSchedules(state, true)
  }
  if (now - state.listAt > SESSION_LIST_REFRESH_MS) {
    void refreshSessionList(state)
  }
  if (hasUntitled(state) && now - state.titlesAt > TITLE_REFRESH_MS) {
    void refreshTitles(state, false)
  }

  checkSchedules(state, now)
  pruneAnnouncements(state, now)
  if (now - (state.openmindAt || 0) > OPENMIND_CACHE_MS) refreshOpenmind(state)

  /* 控制地图规模：保留最近活跃的 120 个会话。 */
  if (state.sessions.size > 120) {
    const all = [...state.sessions.values()]
    all.sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt))
    for (const record of all.slice(120)) {
      if (!record.running) state.sessions.delete(record.id)
    }
  }
}

function hasUntitled(state) {
  for (const record of state.sessions.values()) {
    if (!record.title && !record.subagent) return true
  }
  return false
}

/* ────────────────────────────── 端点 ────────────────────────────── */

function handleState(state, req, res) {
  if (!trusted(req)) {
    writeJson(res, 403, { ok: false, error: 'forbidden' })
    return
  }
  if (req.method !== 'GET') {
    writeJson(res, 405, { ok: false, error: 'method' })
    return
  }
  writeJson(res, 200, snapshot(state))
}

async function handleIdea(state, req, res) {
  if (!trusted(req)) {
    writeJson(res, 403, { ok: false, error: 'forbidden' })
    return
  }
  if (req.method !== 'POST') {
    writeJson(res, 405, { ok: false, error: 'method' })
    return
  }
  let body = ''
  try {
    body = await readBody(req)
  } catch (error) {
    writeJson(res, 413, { ok: false, error: 'body' })
    return
  }
  let sessionId = ''
  if (body.trim()) {
    try {
      const parsed = JSON.parse(body)
      if (typeof parsed?.sessionId === 'string') sessionId = parsed.sessionId.trim()
    } catch {
      /* 请求体不是 JSON 时按“当前最近会话”处理。 */
    }
  }
  if (state.ideaBusy) {
    writeJson(res, 409, { ok: false, code: 'busy' })
    return
  }
  const idea = await produceIdea(state, 'manual', sessionId)
  if (!idea) {
    writeJson(res, 503, { ok: false, code: 'unavailable' })
    return
  }
  writeJson(res, 200, { ok: true, idea })
}

function snapshot(state) {
  const now = Date.now()
  const sessions = [...state.sessions.values()]
    .filter((record) => record && typeof record.id === 'string' && !record.subagent)
    .map((record) => {
      const updatedAt = record.updatedAt || record.createdAt || 0
      return {
        id: record.id,
        title: record.title || '',
        running: record.running === true && now - updatedAt < RUNNING_STALE_MS,
        updatedAt,
      }
    })
    .sort((a, b) => (b.running ? 1 : 0) - (a.running ? 1 : 0) || b.updatedAt - a.updatedAt)
    .slice(0, MAX_SESSIONS)

  return {
    v: 1,
    now,
    sessions,
    schedules: state.schedules.map((task) => ({
      id: task.id,
      title: task.title,
      kind: task.kind,
      scheduledAt: task.scheduledAt,
      sessionId: task.sessionId,
    })),
    events: state.events.map((event) => ({ ...event })),
    idea: state.idea ? { ...state.idea } : null,
    ideas: state.ideas.slice(-10).map((idea) => ({ ...idea })),
    openmind: {
      available: state.openmind?.available === true,
      skillCount: state.openmind?.skills?.length || 0,
      names: (state.openmind?.skills || []).map((skill) => skill.name),
    },
    stats: {
      running: sessions.filter((record) => record.running).length,
      schedules: state.schedules.length,
      ideas: state.ideas.length,
    },
  }
}

function trusted(req) {
  const address = req.socket?.remoteAddress ?? ''
  const loopback =
    address === '127.0.0.1' ||
    address === '::1' ||
    address === '::ffff:127.0.0.1' ||
    address === '::ffff:7f00:1'
  if (!loopback) return false
  const site = req.headers?.['sec-fetch-site']
  if (typeof site === 'string' && site.toLowerCase() === 'cross-site') return false
  return true
}

async function readBody(req) {
  let size = 0
  let body = ''
  for await (const chunk of req) {
    size += Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(String(chunk))
    if (size > BODY_LIMIT) throw new Error('body too large')
    body += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk)
  }
  return body
}

function writeJson(res, status, body) {
  let text
  try {
    text = JSON.stringify(body)
  } catch {
    text = '{"ok":false,"error":"serialize"}'
    status = 500
  }
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(text),
    'cache-control': 'no-store',
    'referrer-policy': 'no-referrer',
  })
  res.end(text)
}

/* ────────────────────────────── 小工具 ────────────────────────────── */

function clip(value, max) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim()
  if (text.length <= max) return text
  return `${text.slice(0, Math.max(0, max - 1))}…`
}
