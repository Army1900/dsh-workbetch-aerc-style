/**
 * 数字蜘蛛 · Host 半部
 *
 * 这只宠物看不见的东西都在这里读：
 *   1. 会话推进：订阅 `api-session/status` / `api-session/activity`，
 *      再经 `sessionQuery` 补标题与最近一句助手回复；
 *   2. 定时任务：读 `schedule.catalog()`，到点前 2 分钟与触发时各推一次事件；
 *   3. 点子：每 7 分钟左右挑一个最近的根会话，把标题 + 最近用户/助手片段
 *      交给默认模型推一句可动手的点子；模型不可用时退化为本地模板。
 *
 * 浏览器半部不碰任何 Host 私有对象：它只轮询本插件自己的两个端点
 *   GET  /dsh-digital-spider/state
 *   POST /dsh-digital-spider/idea
 * 所以刷新页面、切换主题、甚至重开浏览器都不会打断这只蜘蛛。
 *
 * 端点刻意放在 `/api` 之外：`/api` 是框架的前缀路由，精确路由会被它先吃掉。
 * 只服务回环地址与同源页面；不落盘、不额外注册工具、不写会话日志。
 */

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
/** 点子生成间隔。 */
const IDEA_INTERVAL_MS = 7 * 60_000
/** 第一次点子最早的等待时间（再加一点抖动）。 */
const IDEA_FIRST_MS = 150_000
const IDEA_FIRST_JITTER_MS = 90_000
/** 单次推演最多读多少上下文。 */
const IDEA_CONTEXT_CHARS = 700
const IDEA_MAX_TOKENS = 220
const BODY_LIMIT = 16 * 1024

/* ────────────────────────────── 插件入口 ────────────────────────────── */

export function apply(ctx) {
  const state = createState(ctx)

  /* 进程退出时让在途的异步工作安静下来。 */
  ctx.effect(() => () => {
    state.disposed = true
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

function createState(ctx) {
  return {
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
    ideaBusy: false,
    ideaCursor: 0,
    nextIdeaAt: Date.now() + IDEA_FIRST_MS + Math.floor(Math.random() * IDEA_FIRST_JITTER_MS),
    lastLocalIdeas: [],
  }
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
    if (!isInteresting(state, sessionId)) return
    pushEvent(state, 'session-running', {
      sessionId,
      title: record.title,
    })
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
    void emitSessionRest(state, sessionId)
  }
}

async function emitSessionRest(state, sessionId) {
  let excerpt = ''
  try {
    excerpt = await lastMessageText(state, sessionId, 'assistant/message', 120)
  } catch {
    excerpt = ''
  }
  if (state.disposed) return
  const record = state.sessions.get(sessionId)
  if (!record || record.running) return
  if (record.subagent) return
  pushEvent(state, 'session-rest', {
    sessionId,
    title: record.title,
    excerpt,
  })
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

async function produceIdea(state, trigger) {
  if (state.ideaBusy || state.disposed) return null
  state.ideaBusy = true
  state.nextIdeaAt = Date.now() + IDEA_INTERVAL_MS + Math.floor(Math.random() * 90_000)

  try {
    const candidates = await ideaCandidates(state)
    if (candidates.length === 0) return null
    state.ideaCursor = (state.ideaCursor + 1) % candidates.length
    const pick = candidates[state.ideaCursor]
    const context = await readIdeaContext(state, pick.id)

    let modelText = null
    try {
      modelText = await generateModelIdea(state, pick.title, context)
    } catch (error) {
      console.error('[digital-spider] 模型推演失败，改用本地模板：', error)
    }

    const text = modelText || localIdea(state, pick.title, context.userText)
    if (!text) return null

    const idea = {
      id: `idea-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      text,
      title: pick.title || '',
      sessionId: pick.id,
      at: Date.now(),
      source: modelText ? 'model' : 'local',
      trigger: trigger || 'timer',
    }
    state.idea = idea
    pushEvent(state, 'idea', {
      ideaId: idea.id,
      text: idea.text,
      title: idea.title,
      sessionId: idea.sessionId,
    })
    return idea
  } catch (error) {
    console.error('[digital-spider] 生成点子失败：', error)
    return null
  } finally {
    state.ideaBusy = false
  }
}

async function ideaCandidates(state) {
  if (state.sessions.size === 0 || Date.now() - state.listAt > SESSION_LIST_REFRESH_MS) {
    await refreshSessionList(state)
  }
  if (state.sessions.size === 0) {
    await refreshSessionList(state)
  }

  const list = []
  for (const record of state.sessions.values()) {
    if (!record || record.subagent) continue
    if (!record.title && !record.updatedAt) continue
    list.push(record)
  }
  list.sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt))
  const titled = list.filter((record) => record.title)
  return (titled.length > 0 ? titled : list).slice(0, 16)
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

async function generateModelIdea(state, title, context) {
  const llm = service(state.ctx, 'llm')
  if (!llm || typeof llm.stream !== 'function') return null
  const selection = await resolveModel(state.ctx, llm)
  if (!selection) return null

  const lines = [
    '你是一只趴在用户桌面上的数字蜘蛛，负责从用户自己的会话里冒出一个小点子。',
    '请只输出一句点子：具体、能马上动手、不超过 60 个字。',
    '语言与用户最近的消息保持一致。不要复述标题，不要泛泛鼓励，不要编号、引号或解释。',
    '',
    `会话标题：${title || '未命名会话'}`,
  ]
  if (context.userText) lines.push(`用户最近说：${context.userText}`)
  if (context.assistantText) lines.push(`助手最近回复：${context.assistantText}`)
  lines.push('', '你的点子：')

  let text = ''
  const stream = llm.stream({
    provider: selection.provider,
    model: selection.model,
    system: '你是简洁、务实的中文创意观察器。只输出一行点子本身。',
    messages: [{ role: 'user', content: [{ type: 'text', text: lines.join('\n') }] }],
    temperature: 0.9,
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
  return cleanIdea(text)
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

function cleanIdea(raw) {
  if (typeof raw !== 'string') return null
  const withoutFence = raw.replace(/```[\s\S]*?```/g, ' ')
  const firstLine = withoutFence
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0)
  if (!firstLine) return null
  let text = firstLine
    .replace(/^[\s>#*\-—–\d.、)+）]+/, '')
    .replace(/^(点子|建议|想法)[：:]\s*/, '')
    .replace(/^["'「『]+|["'」』]+$/g, '')
    .trim()
  text = clip(text, 96)
  return text.length >= 6 ? text : null
}

const LOCAL_TEMPLATES = [
  (title) => `把「${title}」的最后一步写成一条可重复运行的检查，今天先验证一次。`,
  (title) => `「${title}」里反复手做的部分，抽成一个最小工具，下次直接复用。`,
  (title) => `给「${title}」补一个 10 分钟的失败实验，看看最先断在哪一环。`,
  (title) => `如果我继续「${title}」，下一个最小增量是什么？先写三行再动手。`,
  (title) => `为「${title}」补一条回归测试，把今天踩过的坑钉住。`,
  (title) => `把「${title}」的结论压成五行摘要，贴在文件最上面。`,
  (title) => `把「${title}」里最不确定的假设写出来，再安排一次最省钱的验证。`,
  (title) => `给「${title}」加一个十秒就能看懂的空状态，胜过多做三个功能。`,
]

const KEYWORD_TEMPLATES = [
  {
    keys: ['测试', 'test', '回归', 'bug', '报错'],
    build: (title) => `给「${title}」补一条最容易坏掉的回归用例，先复现再修。`,
  },
  {
    keys: ['插件', 'plugin', '扩展', '工具'],
    build: (title) => `把「${title}」里临时写死的东西抽成一个配置项，下次不用改代码。`,
  },
  {
    keys: ['设计', '界面', 'ui', '排版', '样式'],
    build: (title) => `给「${title}」先做一个能点的最低保真原型，再决定要不要精修。`,
  },
  {
    keys: ['性能', '慢', '卡顿', '优化'],
    build: (title) => `先量一下「${title}」最慢的那一步，瓶颈通常不在直觉上。`,
  },
  {
    keys: ['文档', 'readme', '说明'],
    build: (title) => `把「${title}」的结论压成五行，放到 README 最上面。`,
  },
]

function localIdea(state, title, userText) {
  const safeTitle = title || '这个会话'
  const haystack = `${title} ${userText}`.toLowerCase()
  let text = ''

  for (const entry of KEYWORD_TEMPLATES) {
    if (entry.keys.some((key) => haystack.includes(key.toLowerCase()))) {
      text = entry.build(safeTitle)
      break
    }
  }

  if (!text) {
    const seed = hashString(`${safeTitle}|${Date.now()}`)
    for (let offset = 0; offset < LOCAL_TEMPLATES.length; offset += 1) {
      const candidate = LOCAL_TEMPLATES[(seed + offset) % LOCAL_TEMPLATES.length](safeTitle)
      if (!state.lastLocalIdeas.includes(candidate)) {
        text = candidate
        break
      }
    }
    if (!text) text = LOCAL_TEMPLATES[seed % LOCAL_TEMPLATES.length](safeTitle)
  }

  text = clip(text, 96)
  state.lastLocalIdeas.push(text)
  if (state.lastLocalIdeas.length > 8) state.lastLocalIdeas.shift()
  return text
}

function hashString(value) {
  let hash = 2166136261
  const input = String(value)
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
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

  if (!state.ideaBusy && now >= state.nextIdeaAt) {
    void produceIdea(state, 'timer')
  }

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
  try {
    await drain(req)
  } catch (error) {
    writeJson(res, 413, { ok: false, error: 'body' })
    return
  }
  if (state.ideaBusy) {
    writeJson(res, 409, { ok: false, code: 'busy' })
    return
  }
  const idea = await produceIdea(state, 'manual')
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
    stats: {
      running: sessions.filter((record) => record.running).length,
      schedules: state.schedules.length,
      ideas: state.idea ? 1 : 0,
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

async function drain(req) {
  let size = 0
  for await (const chunk of req) {
    size += Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(String(chunk))
    if (size > BODY_LIMIT) throw new Error('body too large')
  }
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
