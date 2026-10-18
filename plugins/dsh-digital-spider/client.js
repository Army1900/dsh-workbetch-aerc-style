/**
 * 数字蜘蛛 · Client 半部
 *
 * 俯视视角的八足蜘蛛，整页都是它的表面。
 *
 * 视觉与运动不是 CSS 假动画：
 *   - 每帧对 8 条腿做两段式 IK：髋 → 膝 → 足，膝关节朝身体外侧弯；
 *   - 足尖是**世界坐标**上的锚点：身体移动时脚不滑动，只有超过步幅才抬腿、
 *     走一条带侧弯的弧线、落到新的抓握点，落下时留一枚 grip 标记；
 *   - 步态按交替四足组分配，最多同时 4–6 条腿腾空；跑动时步幅与频率一起变；
 *   - 俯视身体：细长腹部 + 小头胸部 + 8 颗传感器眼，金属板、橙色危险纹与
 *     发光背核；身体朝向沿速度方向平滑转向，转弯时腿会自己找新落点。
 *
 * 整页巡游：随机落点覆盖整个视口；会话 / 定时 / 灵感提醒分别把目标点放在
 * 左 / 中 / 右区域，跑到后气泡出现在蜘蛛旁边。数据仍只来自本包 Host 半部的
 * /dsh-digital-spider/state，不读别的插件 DOM，也不往页面写第二套布局。
 */

window.__ModuleLoader__.load({
  id: 'dsh-digital-spider',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const NS = 'dsh-digital-spider'
    const STYLE_ID = 'dsh-digital-spider-styles'
    const STATE_URL = '/dsh-digital-spider/state'
    const IDEA_URL = '/dsh-digital-spider/idea'
    const SKILL_CHOICES = [
      { id: 'auto', key: 'skill.auto' },
      { id: 'poetic-essence', key: 'skill.poetic-essence' },
      { id: 'deep-dream', key: 'skill.deep-dream' },
      { id: 'constraint-flip', key: 'skill.constraint-flip' },
      { id: 'cross-domain', key: 'skill.cross-domain' },
      { id: 'clarify-intent', key: 'skill.clarify-intent' },
      { id: 'act-on-ground', key: 'skill.act-on-ground' },
      { id: 'reflect-anchor', key: 'skill.reflect-anchor' },
    ]

    const POLL_MS = 1600
    const BUBBLE_MS = 7800
    const IDEA_MS = 30_000
    const MOOD_MS = 14_000
    const SESSION_START_COOLDOWN_MS = 24000
    const MAX_QUEUE = 6
    const CHIP_WINDOW_MS = 45 * 60_000
    const GRIP_SLOTS = 12
    const WALK_SPEED = 50
    const RUN_SPEED = 280
    const ACCEL = 760
    /** 身体绘制坐标缩到 0.26：约 16×5px 的小甲片。 */
    const BODY_SCALE = 0.26
    /** CYBER 模式下，目标超过这个距离就原地开虫洞，而不是爬过去。 */
    const WORMHOLE_DISTANCE = 260
    /** 数据包传输三段：编码拆包 / 沿路由传输（按距离伸缩）/ 解码重组。 */
    const WARP_OUT_MS = 520
    const WARP_TRANSFER_MS = 340
    const WARP_IN_MS = 600
    const PACKET_COUNT = 14
    /** CYBER 爬行：八向路由 + 交替四足步态。 */
    const CYBER_WALK_SPEED = 150
    const CYBER_RUN_SPEED = 440
    const CYBER_SWING = 0.4
    /** 伸缩腿的最大伸展（静止腿长的倍数）；超过就强制抓下一个点。 */
    const CYBER_REACH = 2.1
    /** 抓取式前探：四对腿额外前伸的步长比例（前→后）。 */
    const CYBER_GRAB = [0.24, 0.1, 0, -0.05]
    const ROUTE_GRID = 24
    const ROUTE_NODES = 6
    const PING_SLOTS = 8
    const TRAIL_POINTS = 48

    const MOTION_KEY = 'dsh-digital-spider.motion'
    const MOTION_ORGANIC = 'organic'
    const MOTION_CYBER = 'cyber'

    function readMotionStyle() {
      try {
        const stored = window.localStorage.getItem(MOTION_KEY)
        return stored === MOTION_ORGANIC ? MOTION_ORGANIC : MOTION_CYBER
      } catch {
        return MOTION_CYBER
      }
    }

    function writeMotionStyle(style) {
      try {
        window.localStorage.setItem(MOTION_KEY, style)
      } catch {
        /* 隐私模式/不可写时只保留本次会话。 */
      }
    }

    /** 自己注册到会话行里的锚点；只读自己的 DOM，不碰别的插件。 */
    const rowAnchors = new Map()
    const DISMISSED_KEY = 'dsh-digital-spider.dismissed'

    function sessionAnchor(sessionId) {
      if (typeof sessionId !== 'string' || sessionId.length === 0) return null
      const element = rowAnchors.get(sessionId)
      if (!element || !element.isConnected) return null
      const rect = element.getBoundingClientRect()
      if (!rect || rect.width <= 0 || rect.height <= 0) return null
      const width = window.innerWidth || 1200
      const height = window.innerHeight || 800
      if (rect.bottom < 0 || rect.top > height || rect.right < 0 || rect.left > width) return null
      const x = rect.left + rect.width / 2
      const y = rect.top + rect.height / 2
      return {
        x: clamp(x, 64, width - 64),
        y: clamp(y, 78, Math.max(78, height - 62)),
      }
    }

    function dockPoint() {
      const width = window.innerWidth || 1200
      const height = window.innerHeight || 800
      return { x: Math.max(84, width - 76), y: Math.max(96, height - 74) }
    }

    function readDismissedIdeaIds() {
      try {
        const raw = window.localStorage.getItem(DISMISSED_KEY)
        const list = raw ? JSON.parse(raw) : []
        return Array.isArray(list) ? list.filter((id) => typeof id === 'string').slice(-80) : []
      } catch {
        return []
      }
    }

    function writeDismissedIdeaIds(ids) {
      try {
        window.localStorage.setItem(DISMISSED_KEY, JSON.stringify(ids.slice(-80)))
      } catch {
        /* 隐私模式/不可写时只保留本次会话。 */
      }
    }

    function shortenThought(value, max) {
      const text = String(value || '').replace(/\s+/g, ' ').trim()
      if (text.length <= max) return text
      return `${text.slice(0, Math.max(0, max - 1))}…`
    }

    function firstPoemLines(value, count) {
      if (typeof value !== 'string') return ''
      return value
        .replace(/\r\n?/g, '\n')
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(0, count)
        .join('\n')
    }

    function thoughtHead(idea, translate) {
      const label = [idea.skillLabel || idea.skill, idea.mode].filter(Boolean).join(' · ')
      return h(
        'div',
        { className: 'ds-thought__head', key: 'head' },
        h('span', { className: 'ds-thought__form' }, `${translate('thought')} · ${label}`),
        h('span', { className: 'ds-thought__peek', 'aria-hidden': 'true' }, '↗'),
      )
    }

    function thoughtContent(idea, translate) {
      const a = idea.artifact || {}
      const nodes = [thoughtHead(idea, translate)]
      switch (idea.skill) {
        case 'poetic-essence':
          nodes.push(
            h(
              'div',
              { className: 'ds-thought__poem', key: 'poem' },
              firstPoemLines(a.poem, 3) || idea.ideaTitle || '',
            ),
          )
          if (a.attribution) {
            nodes.push(
              h(
                'div',
                { className: 'ds-thought__attribution', key: 'attr' },
                `—— ${a.attribution}`,
              ),
            )
          }
          break
        case 'deep-dream':
          nodes.push(
            h(
              'div',
              { className: 'ds-thought__dream', key: 'dream' },
              shortenThought(a.dream || idea.ideaTitle, 110),
            ),
          )
          break
        case 'constraint-flip':
          nodes.push(
            h(
              'div',
              { className: 'ds-thought__flip', key: 'flip' },
              h('span', { className: 'ds-thought__constraint' }, shortenThought(a.constraint, 64)),
              h('span', { className: 'ds-thought__arrow', 'aria-hidden': 'true' }, '→'),
              h('span', { className: 'ds-thought__flipped' }, shortenThought(a.flipped, 100)),
            ),
          )
          break
        case 'cross-domain':
          nodes.push(
            h(
              'div',
              { className: 'ds-thought__analogy', key: 'analogy' },
              shortenThought(a.analogy || a.insight || idea.ideaTitle, 110),
            ),
          )
          break
        case 'clarify-intent':
          nodes.push(
            h(
              'div',
              { className: 'ds-thought__question', key: 'question' },
              `“${shortenThought(a.question || a.intent || idea.ideaTitle, 100)}”`,
            ),
          )
          break
        case 'act-on-ground':
          nodes.push(
            h(
              'div',
              { className: 'ds-thought__step', key: 'step' },
              h('span', { className: 'ds-thought__check', 'aria-hidden': 'true' }, '▸'),
              h('span', null, shortenThought(a.step || idea.suggestion || idea.ideaTitle, 110)),
            ),
          )
          break
        case 'reflect-anchor':
          nodes.push(
            h(
              'div',
              { className: 'ds-thought__anchor', key: 'anchor' },
              shortenThought(a.anchor || a.lesson || idea.ideaTitle, 110),
            ),
          )
          break
        default:
          nodes.push(
            h(
              'div',
              { className: 'ds-thought__text', key: 'text' },
              shortenThought(ideaPeekText(idea), 110),
            ),
          )
      }
      return nodes
    }

    /** 想法气泡的“露一句”：执行型露核心，诗/梦境只露标题，点开才展开全文。 */
    function ideaPeekText(idea) {
      if (!idea) return ''
      const a = idea.artifact || {}
      switch (idea.skill) {
        case 'poetic-essence':
        case 'deep-dream':
          return idea.ideaTitle || a.poem || a.dream || idea.suggestion || idea.title || ''
        case 'constraint-flip':
          return a.flipped || a.constraint || idea.suggestion || idea.ideaTitle || idea.title || ''
        case 'cross-domain':
          return a.insight || a.analogy || idea.suggestion || idea.ideaTitle || idea.title || ''
        case 'clarify-intent':
          return a.question || a.intent || idea.suggestion || idea.ideaTitle || idea.title || ''
        case 'act-on-ground':
          return a.step || idea.suggestion || idea.ideaTitle || idea.title || ''
        case 'reflect-anchor':
          return a.anchor || a.lesson || idea.suggestion || idea.ideaTitle || idea.title || ''
        default:
          return idea.suggestion || idea.ideaTitle || idea.title || ''
      }
    }

    function ideaCopyText(idea) {
      if (!idea) return ''
      if (Number(idea.format) >= 3 && typeof idea.text === 'string' && idea.text) return idea.text
      const lines = []
      const title = idea.ideaTitle || ''
      const suggestion = idea.suggestion || idea.text || ''
      if (title) lines.push(title)
      if (suggestion) lines.push(suggestion)
      if (idea.rationale) lines.push('', `为什么：${idea.rationale}`)
      if (idea.skill) lines.push(`技能：${idea.skill}`)
      const sessionTitle = idea.sessionTitle || idea.title || ''
      if (sessionTitle) lines.push(`来自：${sessionTitle}`)
      return lines.join('\n')
    }

    function ideaToItem(idea, keyPrefix = 'idea') {
      if (!idea || typeof idea !== 'object') return null
      const sessionTitle = idea.sessionTitle || idea.title || ''
      return {
        key: `${keyPrefix}-${idea.id || Date.now()}`,
        kind: 'idea',
        station: 'idea',
        at: Number(idea.at) || Date.now(),
        title: sessionTitle,
        sessionTitle,
        sessionId: typeof idea.sessionId === 'string' ? idea.sessionId : '',
        text: idea.text || '',
        ideaId: idea.id,
        ideaTitle: idea.ideaTitle || '',
        suggestion: idea.suggestion || '',
        rationale: idea.rationale || '',
        skill: idea.skill || '',
        skillLabel: idea.skillLabel || idea.skill || '',
        mode: idea.mode || '',
        artifact: idea.artifact && typeof idea.artifact === 'object' ? idea.artifact : null,
        skillReason: idea.skillReason || '',
        source: idea.source || 'model',
        trigger: idea.trigger || 'manual',
        format: Number(idea.format) || 2,
        priority: 2,
      }
    }

    function formRow(key, value, translate) {
      if (!value) return null
      return h(
        'div',
        { className: 'ds-pop__form-row', key },
        h('span', { className: 'ds-pop__form-label' }, translate(key)),
        h('span', { className: 'ds-pop__form-value' }, value),
      )
    }

    function ideaArtifactNodes(idea, translate) {
      const a = idea.artifact || {}
      const rows = []
      const skill = idea.skill || ''
      if (skill === 'poetic-essence') {
        if (a.poem) rows.push(h('div', { className: 'ds-pop__poem', key: 'poem' }, a.poem))
        if (a.attribution) {
          rows.push(
            h('div', { className: 'ds-pop__attribution', key: 'attribution' }, `—— ${a.attribution}`),
          )
        }
        rows.push(formRow('artifact.interpretation', a.interpretation, translate))
        rows.push(formRow('artifact.implication', a.implication, translate))
        rows.push(formRow('artifact.nextStep', a.nextStep, translate))
      } else if (skill === 'deep-dream') {
        if (a.dream) rows.push(h('div', { className: 'ds-pop__dream', key: 'dream' }, a.dream))
        rows.push(formRow('artifact.insight', a.insight, translate))
        rows.push(formRow('artifact.nextStep', a.nextStep, translate))
      } else if (skill === 'constraint-flip') {
        rows.push(formRow('artifact.constraint', a.constraint, translate))
        rows.push(formRow('artifact.flipped', a.flipped, translate))
        rows.push(formRow('artifact.nextStep', a.nextStep, translate))
      } else if (skill === 'cross-domain') {
        rows.push(formRow('artifact.analogy', a.analogy, translate))
        rows.push(formRow('artifact.insight', a.insight, translate))
        rows.push(formRow('artifact.nextStep', a.nextStep, translate))
      } else if (skill === 'clarify-intent') {
        rows.push(formRow('artifact.intent', a.intent, translate))
        rows.push(formRow('artifact.question', a.question, translate))
        rows.push(formRow('artifact.nextStep', a.nextStep, translate))
      } else if (skill === 'act-on-ground') {
        rows.push(formRow('artifact.step', a.step, translate))
        rows.push(formRow('artifact.acceptance', a.acceptance, translate))
      } else if (skill === 'reflect-anchor') {
        rows.push(formRow('artifact.lesson', a.lesson, translate))
        rows.push(formRow('artifact.anchor', a.anchor, translate))
        rows.push(formRow('artifact.nextStep', a.nextStep, translate))
      }
      return rows.filter(Boolean)
    }

    const DICT = {
      zh: {
        'label.session': 'SESSION LINK',
        'label.schedule': 'SCHEDULE LINK',
        'label.idea': 'IDEA SIGNAL',
        'meta.live': '推进中',
        'meta.done': '本轮结束',
        'meta.idea': '灵感',
        'meta.now': '已触发',
        'untitledSession': '未命名会话',
        'untitledTask': '未命名任务',
        'sessionRunningBody': '终端开始转动了。我在会话这一侧盯着这一轮。',
        'sessionRestBody': '这一轮已经收尾，回来看一眼结果吧。',
        'scheduleSoonBody': '倒计时结束我会再敲一次，准备好就切过去。',
        'scheduleNowBody': '时间到，提醒已经开始投递到对应会话。',
        'ideaTitle': '灵感信号',
        'ideaFrom': '来自「{title}」',
        'ideaHint': '从刚收尾的会话里长出来，参考 OpenMind 技能。',
        'why': 'WHY',
        'skill': '技能',
        'openSession': '打开会话',
        'copy': '复制',
        'copied': '已复制',
        'ignore': '忽略',
        'statusInbox': '点子抽屉',
        'statusForm': '点子形态',
        'formGenerate': '按这个形态生成',
        'formHint': '让点子按诗、梦境、反转等形态长出来；自动会先让模型路由。',
        'skill.auto': '自动选形态',
        'skill.poetic-essence': '诗意点睛',
        'skill.deep-dream': '深度梦境',
        'skill.constraint-flip': '约束反转',
        'skill.cross-domain': '跨域类比',
        'skill.clarify-intent': '明心定向',
        'skill.act-on-ground': '事上练',
        'skill.reflect-anchor': '知行复盘',
        'skillReason': '为什么用这个形态',
        'artifact.interpretation': '解读',
        'artifact.implication': '对项目的启示',
        'artifact.nextStep': '下一步',
        'artifact.dream': '梦境',
        'artifact.insight': '洞察',
        'artifact.constraint': '约束',
        'artifact.flipped': '反转',
        'artifact.analogy': '类比',
        'artifact.intent': '意图',
        'artifact.question': '关键问题',
        'artifact.step': '下一步',
        'artifact.acceptance': '验收',
        'artifact.lesson': '教训',
        'artifact.anchor': '锚点',
        'noInbox': '还没有收进抽屉的点子。',
        'openmind': 'OPENMIND',
        'openmindMissing': 'OpenMind 未加载',
        'close': '关闭',
        'dismiss': '知道了',
        'anotherIdea': '再想一个',
        'ideaPeek': '点开看完整点子',
        'thought': '蜘蛛想到',
        'label.mood': 'MOOD SIGNAL',
        'mood.positive': '替你高兴',
        'mood.negative': '陪着你',
        'emotion.joy': '开心',
        'emotion.excitement': '兴奋',
        'emotion.relief': '释然',
        'emotion.pride': '自豪',
        'emotion.gratitude': '感激',
        'emotion.calm': '平静',
        'emotion.hope': '期待',
        'emotion.frustration': '烦躁',
        'emotion.anger': '生气',
        'emotion.sadness': '难过',
        'emotion.tired': '疲惫',
        'emotion.anxiety': '焦虑',
        'emotion.overwhelm': '有点超载',
        'emotion.confusion': '迷茫',
        'emotion.self-doubt': '自我怀疑',
        'emotion.loneliness': '孤独',
        'emotion.other': '有点不好受',
        'thinking': '推演中…',
        'genericError': '这次没想出来，稍后再试。',
        'statusTitle': 'DIGITAL SPIDER',
        'statusRunning': '推进中的会话',
        'statusSchedules': '即将触发',
        'statusIdea': '最新点子',
        'noRunning': '目前没有会话在推进。',
        'noSchedules': '没有等待中的定时任务。',
        'noIdea': '还在读你的会话，点子会自己冒出来。',
        'statusHint': '点击蜘蛛收起 · 没有事件时我慢慢巡游，收到提醒会去对应位置',
        'online': 'ONLINE',
        'offline': 'LINK LOST',
        'offlineHint': 'Host 半部暂时不可达，正在重连。',
        'chipNext': 'NEXT',
        'chipNow': 'TRIGGER',
        'inSeconds': '{n} 秒后',
        'inMinutes': '{n} 分钟后',
        'source.model': '模型推演',
        'source.local': '本地推演',
        'stats': '{sessions} 个会话 · {tasks} 个任务',
        'aria.spider': '数字蜘蛛宠物：点击查看实时状态',
        'aria.panel': '数字蜘蛛实时状态',
        'aria.close': '关闭状态面板',
        'ideaError': '这次推演失败，稍后再试。',
        'motion.label': '动效',
        'motion.organic': '有机蜘蛛',
        'motion.cyber': '电子爬虫',
        'motion.organicHint': '按距离落脚，像真实蜘蛛：慢速爬行、会停顿。',
        'motion.cyberHint': '伸缩腿像抓钩一样前探抓点、把身体拽过去，沿八向路由快速爬行；远距离拆成数据包传输。',
      },
      en: {
        'label.session': 'SESSION LINK',
        'label.schedule': 'SCHEDULE LINK',
        'label.idea': 'IDEA SIGNAL',
        'meta.live': 'RUNNING',
        'meta.done': 'TURN DONE',
        'meta.idea': 'IDEA',
        'meta.now': 'FIRED',
        'untitledSession': 'Untitled session',
        'untitledTask': 'Untitled task',
        'sessionRunningBody': 'The terminal started turning. I am watching this round from the session side.',
        'sessionRestBody': 'This round has wrapped up. Worth a look at the result.',
        'scheduleSoonBody': 'I will knock again when the countdown ends. Be ready to switch over.',
        'scheduleNowBody': 'Time is up. The reminder is being delivered to its session.',
        'ideaTitle': 'Idea signal',
        'ideaFrom': 'from "{title}"',
        'ideaHint': 'Grown from the session that just ended, with OpenMind skills.',
        'why': 'WHY',
        'skill': 'Skill',
        'openSession': 'Open session',
        'copy': 'Copy',
        'copied': 'Copied',
        'ignore': 'Ignore',
        'statusInbox': 'Idea inbox',
        'statusForm': 'Idea form',
        'formGenerate': 'Generate this form',
        'formHint': 'Let the idea take the shape of a poem, dream, flip, and more. Auto routes with the model first.',
        'skill.auto': 'Auto form',
        'skill.poetic-essence': 'Poetic',
        'skill.deep-dream': 'Deep dream',
        'skill.constraint-flip': 'Constraint flip',
        'skill.cross-domain': 'Cross-domain',
        'skill.clarify-intent': 'Clarify intent',
        'skill.act-on-ground': 'Act',
        'skill.reflect-anchor': 'Reflect',
        'skillReason': 'Why this form',
        'artifact.interpretation': 'Interpretation',
        'artifact.implication': 'Implication',
        'artifact.nextStep': 'Next step',
        'artifact.dream': 'Dream',
        'artifact.insight': 'Insight',
        'artifact.constraint': 'Constraint',
        'artifact.flipped': 'Flip',
        'artifact.analogy': 'Analogy',
        'artifact.intent': 'Intent',
        'artifact.question': 'Question',
        'artifact.step': 'Step',
        'artifact.acceptance': 'Acceptance',
        'artifact.lesson': 'Lesson',
        'artifact.anchor': 'Anchor',
        'noInbox': 'No ideas in the drawer yet.',
        'openmind': 'OPENMIND',
        'openmindMissing': 'OpenMind not loaded',
        'close': 'Close',
        'dismiss': 'Got it',
        'anotherIdea': 'Another idea',
        'ideaPeek': 'Open the full idea',
        'thought': 'SPIDER THOUGHT',
        'label.mood': 'MOOD SIGNAL',
        'mood.positive': 'Nice',
        'mood.negative': 'I’m here',
        'emotion.joy': 'Joy',
        'emotion.excitement': 'Excited',
        'emotion.relief': 'Relief',
        'emotion.pride': 'Proud',
        'emotion.gratitude': 'Grateful',
        'emotion.calm': 'Calm',
        'emotion.hope': 'Hopeful',
        'emotion.frustration': 'Frustration',
        'emotion.anger': 'Anger',
        'emotion.sadness': 'Sadness',
        'emotion.tired': 'Tired',
        'emotion.anxiety': 'Anxiety',
        'emotion.overwhelm': 'Overwhelmed',
        'emotion.confusion': 'Confused',
        'emotion.self-doubt': 'Self-doubt',
        'emotion.loneliness': 'Lonely',
        'emotion.other': 'Uncomfortable',
        'thinking': 'Thinking…',
        'genericError': 'Nothing this time. Try again later.',
        'statusTitle': 'DIGITAL SPIDER',
        'statusRunning': 'Running sessions',
        'statusSchedules': 'Upcoming',
        'statusIdea': 'Latest idea',
        'noRunning': 'No session is running right now.',
        'noSchedules': 'No scheduled task is waiting.',
        'noIdea': 'Still reading your sessions. An idea will surface.',
        'statusHint': 'Click the spider to close · I patrol slowly when idle and go to alerts',
        'online': 'ONLINE',
        'offline': 'LINK LOST',
        'offlineHint': 'The Host half is unreachable. Reconnecting.',
        'chipNext': 'NEXT',
        'chipNow': 'TRIGGER',
        'inSeconds': 'in {n}s',
        'inMinutes': 'in {n}m',
        'source.model': 'model',
        'source.local': 'local',
        'stats': '{sessions} sessions · {tasks} tasks',
        'aria.spider': 'Digital spider pet: click for live status',
        'aria.panel': 'Digital spider live status',
        'aria.close': 'Close status panel',
        'ideaError': 'This attempt failed. Try again later.',
        'motion.label': 'MOTION',
        'motion.organic': 'ORGANIC',
        'motion.cyber': 'CYBER',
        'motion.organicHint': 'Distance-based foot planting, like a real spider: slow creep with pauses.',
        'motion.cyberHint': 'Telescoping legs grapple ahead and haul the body along fast octilinear routes; long hops travel as packets.',
      },
    }

    let t = (key) => DICT.zh[key] || DICT.en[key] || key

    /**
     * 八条腿的静止落点（身体局部坐标，+x 朝前）。
     * side = -1 左侧 / +1 右侧；group 为交替四足组。
     * rest 决定腿长与步幅，femur/tibia 是两段长度，reach 是可达半径。
     */
    /** 交替四足 + 同侧波：L1/L2/R3/R4 一组，L3/L4/R1/R2 一组。 */
    const PHASE_OFFSETS = [0, 0.09, 0.5, 0.59, 0.68, 0.77, 0.18, 0.27]

    const LEG_DEFS = [
      { hip: [4.2, -1.7], home: [64, -38], side: -1, group: 0 },
      { hip: [3.2, -2.0], home: [30, -70], side: -1, group: 1 },
      { hip: [1.7, -2.0], home: [-22, -68], side: -1, group: 0 },
      { hip: [0, -1.7], home: [-62, -40], side: -1, group: 1 },
      { hip: [4.2, 1.7], home: [64, 38], side: 1, group: 1 },
      { hip: [3.2, 2.0], home: [30, 70], side: 1, group: 0 },
      { hip: [1.7, 2.0], home: [-22, 68], side: 1, group: 1 },
      { hip: [0, 1.7], home: [-62, 40], side: 1, group: 0 },
    ].map((def, index) => {
      const rest = Math.hypot(def.home[0], def.home[1])
      return {
        ...def,
        index,
        rest,
        femur: rest * 0.67,
        tibia: rest * 0.8,
        reach: rest * 1.45,
        front: index === 0 || index === 4,
        phaseOffset: PHASE_OFFSETS[index],
      }
    })

    const CSS = `
.ds-root, .ds-root *, .ds-root *::before, .ds-root *::after { box-sizing: border-box; }

.ds-root {
  --ds-accent: #ff5a1f;
  --ds-amber: #ffb020;
  --ds-cyan: #7fe7ff;
  --ds-line: var(--dsw-alias-border-l1, rgba(127, 137, 147, .3));
  --ds-line-strong: var(--dsw-alias-border-l2, rgba(127, 137, 147, .46));
  --ds-surface: var(--dsw-alias-bg-overlay, #171b1f);
  --ds-layer: var(--dsw-alias-bg-layer-2, #20252b);
  --ds-text: var(--dsw-alias-label-primary, #f1f3f5);
  --ds-muted: var(--dsw-alias-label-secondary, #9aa2aa);
  --ds-ok: var(--dsw-alias-state-success-primary, #4ad27a);
  --ds-bad: var(--dsw-alias-state-error-primary, #ff5a5f);
  --ds-mono: ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace;
  --ds-sans: -apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC",
    "Hiragino Sans GB", "Microsoft YaHei", "Helvetica Neue", sans-serif;
  position: fixed;
  inset: 0;
  pointer-events: none;
  color: var(--ds-text);
  font-family: var(--ds-sans);
  -webkit-font-smoothing: antialiased;
}

/* ── 整页表面：蜘蛛本体 ─────────────────────────────────────── */
.ds-stage {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
  pointer-events: none;
  opacity: 0;
  transition: opacity .35s ease;
}
.ds-stage.is-ready { opacity: 1; }

.ds-body-shadow ellipse { fill: rgba(0, 0, 0, .17); }
.ds-hull-glow { opacity: .32; }
.ds-leg__under {
  fill: none;
  stroke: rgba(7, 10, 13, .42);
  stroke-width: 1.2;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.ds-leg__femur {
  fill: none;
  stroke: #d3dde4;
  stroke-width: .78;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.ds-leg__tibia {
  fill: none;
  stroke: #b8c4cd;
  stroke-width: .5;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.ds-leg__tarsus {
  fill: none;
  stroke: #c9d4dc;
  stroke-width: .38;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.ds-joint--ankle {
  fill: #ffb27a;
  opacity: .72;
}
.ds-leg__trace {
  fill: none;
  stroke: var(--ds-accent);
  stroke-width: .2;
  stroke-linecap: round;
  opacity: .3;
}
.ds-joint--hip {
  fill: #0c1014;
  stroke: #ff7a3d;
  stroke-width: .32;
}
.ds-joint--knee {
  fill: var(--ds-accent);
  stroke: #161c21;
  stroke-width: .3;
}
.ds-foot-shadow { fill: rgba(0, 0, 0, .2); }
.ds-foot { fill: #ffe4c6; }
.ds-claw {
  fill: none;
  stroke: #ff7a3d;
  stroke-width: .45;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.ds-grip__ring {
  fill: none;
  stroke: var(--ds-accent);
  stroke-width: .45;
}
.ds-grip__cross {
  fill: none;
  stroke: #ffd3b0;
  stroke-width: .4;
  opacity: .9;
}

.ds-body-root { pointer-events: none; }
.ds-body-breathe {
  transform-box: fill-box;
  transform-origin: 50% 50%;
  animation: ds-breathe 4.4s ease-in-out infinite;
}
@keyframes ds-breathe {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.012); }
}

.ds-abdomen {
  fill: url(#ds-grad-abdomen);
  stroke: #69767f;
  stroke-width: 1.9;
}
.ds-abdomen-rim {
  fill: none;
  stroke: #dbe4ea;
  stroke-width: 1.5;
  opacity: .3;
}
.ds-abdomen-stripe {
  fill: none;
  stroke: var(--ds-accent);
  stroke-width: 1.8;
  opacity: .72;
}
.ds-seam {
  fill: none;
  stroke: #7e8a93;
  stroke-width: 1.35;
  opacity: .48;
}
.ds-spine {
  fill: none;
  stroke: var(--ds-accent);
  stroke-width: 1.5;
  opacity: .55;
  stroke-dasharray: 2 3;
}
.ds-chevron {
  fill: none;
  stroke: var(--ds-accent);
  stroke-width: 1.5;
  opacity: .5;
}
.ds-front {
  fill: url(#ds-grad-front);
  stroke: #8d99a1;
  stroke-width: 1.7;
}
.ds-hatch {
  fill: #0b0f13;
  stroke: var(--ds-accent);
  stroke-width: 1.1;
}
.ds-spinneret { fill: #ffc49a; }
.ds-core-halo { fill: url(#ds-grad-core); }
.ds-core {
  fill: var(--ds-accent);
  animation: ds-pulse 2.4s ease-in-out infinite;
}
.ds-core-pin { fill: #fff6e8; }
.ds-eye { fill: var(--ds-cyan); }
.ds-eye-glow { fill: var(--ds-cyan); opacity: .16; }
.ds-fang { fill: var(--ds-accent); opacity: .9; }
.ds-palp {
  fill: none;
  stroke: #b9c4cc;
  stroke-width: 2.2;
  stroke-linecap: round;
}
.ds-palp-tip { fill: var(--ds-accent); }
.ds-serial {
  fill: #9ca8b1;
  font-family: var(--ds-mono);
  font-size: 6px;
  letter-spacing: .18em;
  opacity: .75;
}
@keyframes ds-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: .5; }
}

/* ── HUD 锚点：跟着蜘蛛身体走，但只有按钮/气泡接管指针 ─────── */
.ds-anchor {
  position: absolute;
  left: 0;
  top: 0;
  width: 0;
  height: 0;
  pointer-events: none;
  will-change: transform;
  transform: translate3d(-9999px, -9999px, 0);
}
.ds-hit {
  position: absolute;
  left: -28px;
  top: -15px;
  width: 40px;
  height: 28px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  pointer-events: auto;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.ds-hit:focus-visible {
  outline: 2px solid var(--ds-accent);
  outline-offset: 3px;
}
.ds-signal {
  position: absolute;
  right: -12px;
  top: -12px;
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: var(--ds-bad);
  box-shadow: 0 0 7px var(--ds-bad);
  pointer-events: none;
}

/* ── 倒计时小牌 ─────────────────────────────────────────────── */
.ds-chip {
  position: absolute;
  display: flex;
  align-items: center;
  gap: 6px;
  max-width: 230px;
  padding: 5px 8px 5px 6px;
  border: 1px solid color-mix(in srgb, var(--ds-line-strong) 80%, transparent);
  border-left: 2px solid var(--ds-amber);
  background: color-mix(in srgb, var(--ds-surface) 92%, transparent);
  backdrop-filter: blur(8px);
  font-family: var(--ds-mono);
  font-size: 9px;
  line-height: 1;
  letter-spacing: .08em;
  color: var(--ds-muted);
  white-space: nowrap;
  pointer-events: none;
  animation: ds-pop-in .2s ease-out;
}
.ds-anchor[data-chip-pos="above"] .ds-chip { bottom: 34px; }
.ds-anchor[data-chip-pos="below"] .ds-chip { top: 34px; }
.ds-anchor[data-chip-side="right"] .ds-chip { left: 34px; }
.ds-anchor[data-chip-side="left"] .ds-chip { right: 34px; }
.ds-chip.is-urgent {
  border-left-color: var(--ds-accent);
  color: var(--ds-accent);
  animation: ds-pop-in .2s ease-out, ds-urgent 1.5s ease-in-out infinite;
}
.ds-chip__dot {
  width: 5px;
  height: 5px;
  transform: rotate(45deg);
  background: var(--ds-amber);
  flex: none;
}
.ds-chip.is-urgent .ds-chip__dot { background: var(--ds-accent); }
.ds-chip__title {
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 122px;
  color: color-mix(in srgb, var(--ds-text) 76%, transparent);
}
.ds-chip__time { font-variant-numeric: tabular-nums; letter-spacing: .04em; }
@keyframes ds-urgent {
  0%, 100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--ds-accent) 0%, transparent); }
  50% { box-shadow: 0 0 12px 0 color-mix(in srgb, var(--ds-accent) 26%, transparent); }
}

/* ── 气泡与面板 ─────────────────────────────────────────────── */
.ds-pop {
  position: absolute;
  width: min(336px, calc(100vw - 28px));
  pointer-events: auto;
  border: 1px solid color-mix(in srgb, var(--ds-line-strong) 72%, transparent);
  border-left: 2px solid var(--ds-accent);
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--ds-accent) 5%, transparent), transparent 42%),
    color-mix(in srgb, var(--ds-surface) 94%, transparent);
  backdrop-filter: blur(12px) saturate(1.1);
  box-shadow:
    0 18px 40px -18px rgba(0, 0, 0, .55),
    0 0 0 1px color-mix(in srgb, var(--ds-text) 4%, transparent) inset;
  color: var(--ds-text);
  animation: ds-pop-in .18s ease-out;
}
.ds-pop.is-above { bottom: 48px; }
.ds-pop.is-below { top: 48px; }

.ds-pop__leader {
  position: absolute;
  left: var(--ds-notch, 50%);
  width: 1px;
  height: 14px;
  background: linear-gradient(to bottom,
    color-mix(in srgb, var(--ds-accent) 90%, transparent),
    color-mix(in srgb, var(--ds-accent) 20%, transparent));
  pointer-events: none;
}
.ds-pop.is-above .ds-pop__leader { bottom: -14px; }
.ds-pop.is-below .ds-pop__leader {
  top: -14px;
  background: linear-gradient(to top,
    color-mix(in srgb, var(--ds-accent) 90%, transparent),
    color-mix(in srgb, var(--ds-accent) 20%, transparent));
}
.ds-pop__leader::after {
  content: "";
  position: absolute;
  left: -2.5px;
  width: 5px;
  height: 5px;
  transform: rotate(45deg);
  border: 1px solid var(--ds-accent);
  background: var(--ds-surface);
}
.ds-pop.is-above .ds-pop__leader::after { bottom: -2px; }
.ds-pop.is-below .ds-pop__leader::after { top: -2px; }

.ds-pop::before {
  content: "";
  position: absolute;
  top: -1px;
  left: -1px;
  width: 12px;
  height: 12px;
  border-top: 2px solid var(--ds-accent);
  border-left: 2px solid var(--ds-accent);
  pointer-events: none;
}
.ds-pop::after {
  content: "";
  position: absolute;
  right: -1px;
  bottom: -1px;
  width: 12px;
  height: 12px;
  border-bottom: 2px solid var(--ds-accent);
  border-right: 2px solid var(--ds-accent);
  pointer-events: none;
}
.ds-pop__scan {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-image: repeating-linear-gradient(
    0deg,
    transparent 0 3px,
    color-mix(in srgb, var(--ds-text) 3.5%, transparent) 3px 4px);
  opacity: .8;
}
.ds-pop__head {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 9px 7px 11px;
  border-bottom: 1px solid color-mix(in srgb, var(--ds-line) 72%, transparent);
}
.ds-pop__tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-family: var(--ds-mono);
  font-size: 8.5px;
  line-height: 1;
  letter-spacing: .16em;
  color: var(--ds-accent);
  white-space: nowrap;
}
.ds-led {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--ds-accent);
  box-shadow: 0 0 7px var(--ds-accent);
}
.ds-pop__meta {
  margin-left: auto;
  font-family: var(--ds-mono);
  font-size: 8.5px;
  letter-spacing: .1em;
  color: color-mix(in srgb, var(--ds-muted) 88%, transparent);
  white-space: nowrap;
}
.ds-icon {
  flex: none;
  width: 20px;
  height: 20px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 2px;
  background: transparent;
  color: var(--ds-muted);
  font-family: var(--ds-mono);
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
  pointer-events: auto;
}
.ds-icon:hover {
  color: var(--ds-text);
  border-color: color-mix(in srgb, var(--ds-line-strong) 80%, transparent);
}
.ds-pop__body-wrap { position: relative; padding: 10px 12px 11px; }
.ds-pop__title {
  margin: 0 0 5px;
  font-size: 12.5px;
  font-weight: 600;
  line-height: 1.35;
  color: var(--ds-text);
  overflow-wrap: anywhere;
}
.ds-pop__body {
  margin: 0;
  font-size: 12px;
  line-height: 1.55;
  color: color-mix(in srgb, var(--ds-text) 82%, transparent);
  overflow-wrap: anywhere;
}
.ds-pop__hint {
  margin-top: 6px;
  font-family: var(--ds-mono);
  font-size: 8.5px;
  letter-spacing: .06em;
  color: color-mix(in srgb, var(--ds-muted) 82%, transparent);
}
.ds-pop__error {
  margin-top: 6px;
  font-size: 10.5px;
  color: var(--ds-bad);
}
.ds-pop__foot {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px 9px 12px;
  border-top: 1px solid color-mix(in srgb, var(--ds-line) 64%, transparent);
  background: color-mix(in srgb, var(--ds-layer) 42%, transparent);
}
.ds-pop__time {
  font-family: var(--ds-mono);
  font-size: 8.5px;
  letter-spacing: .08em;
  color: color-mix(in srgb, var(--ds-muted) 74%, transparent);
  white-space: nowrap;
}
.ds-pop__actions {
  margin-left: auto;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 6px;
}
.ds-pop__why {
  display: flex;
  gap: 7px;
  margin-top: 7px;
  padding-top: 7px;
  border-top: 1px dashed color-mix(in srgb, var(--ds-line) 72%, transparent);
  font-size: 10.5px;
  line-height: 1.45;
  color: color-mix(in srgb, var(--ds-text) 82%, transparent);
}
.ds-pop__why-label {
  flex: none;
  font-family: var(--ds-mono);
  font-size: 8px;
  letter-spacing: .12em;
  color: var(--ds-accent);
}
.ds-pop__from,
.ds-pop__skill {
  margin-top: 6px;
  font-family: var(--ds-mono);
  font-size: 8.5px;
  line-height: 1.4;
  letter-spacing: .04em;
  color: color-mix(in srgb, var(--ds-muted) 88%, transparent);
}
.ds-pop__skill { color: color-mix(in srgb, var(--ds-accent) 78%, var(--ds-muted)); }
.ds-pop__poem {
  margin: 5px 0 2px;
  font-family: var(--ds-serif, "Songti SC", "STSong", "Noto Serif SC", Georgia, serif);
  font-size: 13.5px;
  line-height: 1.9;
  letter-spacing: .04em;
  white-space: pre-wrap;
  color: var(--ds-text);
}
.ds-pop__attribution {
  margin: 3px 0 7px;
  text-align: right;
  font-family: var(--ds-mono);
  font-size: 8.5px;
  letter-spacing: .04em;
  color: color-mix(in srgb, var(--ds-muted) 88%, transparent);
}
.ds-pop__dream {
  margin: 5px 0 7px;
  padding: 8px 10px;
  border-left: 2px solid var(--ds-amber);
  background: color-mix(in srgb, var(--ds-amber) 6%, transparent);
  font-style: italic;
  font-size: 11.5px;
  line-height: 1.65;
  white-space: pre-wrap;
  color: color-mix(in srgb, var(--ds-text) 88%, transparent);
}
.ds-pop__form-row {
  display: grid;
  grid-template-columns: 70px minmax(0, 1fr);
  gap: 8px;
  margin-top: 7px;
  padding-top: 7px;
  border-top: 1px dashed color-mix(in srgb, var(--ds-line) 68%, transparent);
  font-size: 11px;
  line-height: 1.5;
}
.ds-pop__form-label {
  padding-top: 2px;
  font-family: var(--ds-mono);
  font-size: 8px;
  letter-spacing: .08em;
  color: var(--ds-accent);
}
.ds-pop__form-value {
  min-width: 0;
  white-space: pre-wrap;
  color: color-mix(in srgb, var(--ds-text) 86%, transparent);
}
.ds-btn {
  padding: 5px 9px;
  border: 1px solid color-mix(in srgb, var(--ds-accent) 58%, transparent);
  border-radius: 2px;
  background: color-mix(in srgb, var(--ds-accent) 12%, transparent);
  color: var(--ds-text);
  font-family: var(--ds-mono);
  font-size: 9px;
  line-height: 1;
  letter-spacing: .08em;
  cursor: pointer;
  pointer-events: auto;
  transition: background .15s ease, border-color .15s ease, color .15s ease;
}
.ds-btn:hover {
  background: color-mix(in srgb, var(--ds-accent) 20%, transparent);
  border-color: var(--ds-accent);
}
.ds-btn:disabled { opacity: .55; cursor: progress; }
.ds-btn--ghost {
  border-color: color-mix(in srgb, var(--ds-line-strong) 82%, transparent);
  background: transparent;
  color: var(--ds-muted);
}
.ds-btn--ghost:hover {
  background: color-mix(in srgb, var(--ds-text) 7%, transparent);
  border-color: var(--ds-line-strong);
  color: var(--ds-text);
}
.ds-btn:focus-visible, .ds-icon:focus-visible {
  outline: 2px solid var(--ds-accent);
  outline-offset: 2px;
}

@keyframes ds-pop-in {
  from { opacity: 0; translate: 0 6px; }
  to { opacity: 1; translate: 0 0; }
}

/* ── 想法气泡：点子先只露一句标题，点开才是完整卡片 ───────────── */
.ds-thought { position: absolute; left: 0; top: 0; width: 0; height: 0; }
.ds-thought__wrap {
  position: absolute;
  display: flex;
  pointer-events: none;
}
.ds-thought.is-above .ds-thought__wrap { bottom: 40px; align-items: flex-end; }
.ds-thought.is-below .ds-thought__wrap { top: 40px; align-items: flex-start; }
.ds-thought.is-left .ds-thought__wrap { justify-content: flex-end; }
.ds-thought__bubble {
  display: inline-flex;
  align-items: flex-start;
  gap: 8px;
  max-width: 100%;
  padding: 9px 15px 10px 12px;
  border: 1px solid color-mix(in srgb, var(--ds-accent) 34%, var(--ds-line));
  border-radius: 18px;
  background: color-mix(in srgb, var(--ds-surface) 92%, transparent);
  backdrop-filter: blur(12px) saturate(1.1);
  box-shadow:
    0 12px 28px -16px rgba(0, 0, 0, .55),
    0 0 18px -8px color-mix(in srgb, var(--ds-accent) 45%, transparent);
  color: var(--ds-text);
  font-family: var(--ds-sans);
  font-size: 12.5px;
  font-weight: 500;
  line-height: 1.4;
  text-align: left;
  cursor: pointer;
  pointer-events: auto;
  transform-origin: 0 100%;
  animation:
    ds-thought-in .34s cubic-bezier(.2, .9, .3, 1.25) .14s both,
    ds-thought-float 4.6s ease-in-out .5s infinite;
  transition: border-color .15s ease, box-shadow .15s ease;
}
.ds-thought.is-left .ds-thought__bubble { transform-origin: 100% 100%; }
.ds-thought.is-below .ds-thought__bubble { transform-origin: 0 0; }
.ds-thought.is-below.is-left .ds-thought__bubble { transform-origin: 100% 0; }
.ds-thought__bubble:hover {
  border-color: color-mix(in srgb, var(--ds-accent) 70%, var(--ds-line));
  box-shadow:
    0 12px 28px -16px rgba(0, 0, 0, .55),
    0 0 22px -6px color-mix(in srgb, var(--ds-accent) 60%, transparent);
}
.ds-thought__bubble:focus-visible { outline: 2px solid var(--ds-accent); outline-offset: 2px; }
.ds-thought__content {
  display: grid;
  gap: 4px;
  width: 100%;
  min-width: 0;
}
.ds-thought__head {
  display: flex;
  align-items: center;
  gap: 6px;
  font-family: var(--ds-mono);
  font-size: 7.5px;
  line-height: 1;
  letter-spacing: .08em;
  color: color-mix(in srgb, var(--ds-accent) 82%, var(--ds-muted));
  white-space: nowrap;
}
.ds-thought__form {
  overflow: hidden;
  text-overflow: ellipsis;
}
.ds-thought__peek {
  margin-left: auto;
  font-size: 9px;
  opacity: .55;
}
.ds-thought__poem {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  white-space: pre-wrap;
  font-family: var(--ds-serif, "Songti SC", "STSong", "Noto Serif SC", Georgia, serif);
  font-size: 12.5px;
  line-height: 1.7;
  letter-spacing: .04em;
  color: var(--ds-text);
}
.ds-thought__attribution {
  overflow: hidden;
  text-align: right;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--ds-mono);
  font-size: 7.5px;
  letter-spacing: .03em;
  color: color-mix(in srgb, var(--ds-muted) 84%, transparent);
}
.ds-thought__dream {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  font-style: italic;
  font-size: 11.5px;
  line-height: 1.55;
  color: color-mix(in srgb, var(--ds-text) 88%, transparent);
}
.ds-thought__flip {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: start;
  gap: 6px;
  font-size: 11px;
  line-height: 1.5;
}
.ds-thought__constraint {
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  color: color-mix(in srgb, var(--ds-muted) 88%, transparent);
}
.ds-thought__arrow { color: var(--ds-accent); font-family: var(--ds-mono); font-size: 9px; }
.ds-thought__flipped {
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  color: color-mix(in srgb, var(--ds-text) 92%, transparent);
}
.ds-thought__analogy {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  font-size: 11.5px;
  line-height: 1.55;
  color: color-mix(in srgb, var(--ds-text) 86%, transparent);
}
.ds-thought__question {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  font-family: var(--ds-serif, "Songti SC", "STSong", Georgia, serif);
  font-size: 12px;
  line-height: 1.55;
  color: var(--ds-text);
}
.ds-thought__step {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  font-size: 11.5px;
  line-height: 1.5;
}
.ds-thought__step > span:last-child {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.ds-thought__check {
  flex: none;
  padding-top: 1px;
  color: var(--ds-accent);
  font-family: var(--ds-mono);
  font-size: 9px;
}
.ds-thought__anchor {
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  padding-left: 7px;
  border-left: 1px solid var(--ds-amber);
  font-size: 11.5px;
  line-height: 1.5;
  color: color-mix(in srgb, var(--ds-text) 88%, transparent);
}
.ds-thought__text {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  overflow-wrap: anywhere;
}
.ds-thought__glow {
  flex: none;
  width: 6px;
  height: 6px;
  margin-top: 6px;
  border-radius: 50%;
  background: var(--ds-amber);
  box-shadow: 0 0 8px var(--ds-amber);
  animation: ds-thought-pulse 1.9s ease-in-out infinite;
}
.ds-mood__bubble {
  --mood-tone: var(--ds-amber);
  width: 100%;
  padding: 9px 11px 10px;
  border: 1px solid color-mix(in srgb, var(--mood-tone) 46%, var(--ds-line));
  border-radius: 15px;
  background: color-mix(in srgb, var(--mood-tone) 5%, var(--ds-surface));
  backdrop-filter: blur(12px) saturate(1.1);
  box-shadow:
    0 12px 28px -16px rgba(0, 0, 0, .55),
    0 0 20px -8px color-mix(in srgb, var(--mood-tone) 42%, transparent);
  color: var(--ds-text);
  pointer-events: auto;
  transform-origin: 0 100%;
  animation:
    ds-thought-in .3s cubic-bezier(.2, .9, .3, 1.25) .1s both,
    ds-thought-float 5.2s ease-in-out .5s infinite;
  transition: border-color .15s ease, box-shadow .15s ease;
}
.ds-mood.is-left .ds-mood__bubble { transform-origin: 100% 100%; }
.ds-mood.is-below .ds-mood__bubble { transform-origin: 0 0; }
.ds-mood.is-below.is-left .ds-mood__bubble { transform-origin: 100% 0; }
.ds-mood__bubble.is-positive { --mood-tone: #9fe0c4; }
.ds-mood__bubble.is-negative { --mood-tone: var(--ds-amber); }
.ds-mood__bubble.is-frustration,
.ds-mood__bubble.is-anger { --mood-tone: #f2a26f; }
.ds-mood__bubble.is-sadness,
.ds-mood__bubble.is-tired,
.ds-mood__bubble.is-loneliness { --mood-tone: #e6b878; }
.ds-mood__bubble.is-anxiety,
.ds-mood__bubble.is-overwhelm { --mood-tone: #79d4cf; }
.ds-mood__bubble.is-confusion,
.ds-mood__bubble.is-self-doubt { --mood-tone: #9db7d9; }
.ds-mood__bubble.is-joy,
.ds-mood__bubble.is-excitement,
.ds-mood__bubble.is-pride { --mood-tone: #ffd27a; }
.ds-mood__bubble.is-relief,
.ds-mood__bubble.is-calm,
.ds-mood__bubble.is-gratitude,
.ds-mood__bubble.is-hope { --mood-tone: #9fe0c4; }
.ds-mood__head {
  display: flex;
  align-items: center;
  gap: 6px;
  font-family: var(--ds-mono);
  font-size: 7.5px;
  line-height: 1;
  letter-spacing: .08em;
  white-space: nowrap;
}
.ds-mood__glyph {
  flex: none;
  font-size: 9px;
  color: var(--mood-tone);
  text-shadow: 0 0 8px color-mix(in srgb, var(--mood-tone) 60%, transparent);
  animation: ds-thought-pulse 2.4s ease-in-out infinite;
}
.ds-mood__label { color: var(--mood-tone); }
.ds-mood__emotion {
  overflow: hidden;
  text-overflow: ellipsis;
  color: color-mix(in srgb, var(--ds-muted) 84%, transparent);
}
.ds-mood__close {
  margin-left: auto;
  padding: 0 0 0 6px;
  border: 0;
  background: transparent;
  color: color-mix(in srgb, var(--ds-muted) 80%, transparent);
  font-family: var(--ds-mono);
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
}
.ds-mood__close:hover { color: var(--ds-text); }
.ds-mood__text {
  margin: 6px 0 0;
  font-size: 12.5px;
  line-height: 1.65;
  color: color-mix(in srgb, var(--ds-text) 92%, transparent);
}
.ds-mood__from {
  margin-top: 7px;
  padding-top: 6px;
  border-top: 1px dashed color-mix(in srgb, var(--ds-line) 66%, transparent);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--ds-mono);
  font-size: 7.5px;
  letter-spacing: .04em;
  color: color-mix(in srgb, var(--ds-muted) 80%, transparent);
}
.ds-thought__dot {
  position: absolute;
  border-radius: 50%;
  border: 1px solid color-mix(in srgb, var(--ds-accent) 45%, var(--ds-line));
  background: color-mix(in srgb, var(--ds-surface) 92%, transparent);
  pointer-events: none;
  animation: ds-thought-in .24s ease-out both;
}
.ds-thought__dot--1 { width: 5px; height: 5px; left: 7px; }
.ds-thought__dot--2 { width: 9px; height: 9px; left: 14px; animation-delay: .07s; }
.ds-thought.is-above .ds-thought__dot--1 { bottom: 15px; }
.ds-thought.is-above .ds-thought__dot--2 { bottom: 25px; }
.ds-thought.is-below .ds-thought__dot--1 { top: 15px; }
.ds-thought.is-below .ds-thought__dot--2 { top: 25px; }
.ds-thought.is-left .ds-thought__dot--1 { left: -12px; }
.ds-thought.is-left .ds-thought__dot--2 { left: -23px; }
@keyframes ds-thought-in {
  from { opacity: 0; scale: .4; }
  to { opacity: 1; scale: 1; }
}
@keyframes ds-thought-float {
  0%, 100% { translate: 0 0; }
  50% { translate: 0 -2px; }
}
@keyframes ds-thought-pulse {
  0%, 100% { opacity: .55; }
  50% { opacity: 1; }
}

/* ── 动效选择 ───────────────────────────────────────────────── */
.ds-motion { gap: 7px; }
.ds-seg { display: flex; gap: 4px; }
.ds-seg__btn {
  flex: 1;
  padding: 6px 8px;
  border: 1px solid color-mix(in srgb, var(--ds-line-strong) 72%, transparent);
  border-radius: 2px;
  background: transparent;
  color: var(--ds-muted);
  font-family: var(--ds-mono);
  font-size: 8.5px;
  line-height: 1;
  letter-spacing: .08em;
  cursor: pointer;
  pointer-events: auto;
}
.ds-seg__btn:hover { color: var(--ds-text); border-color: var(--ds-line-strong); }
.ds-seg__btn.is-on {
  color: var(--ds-accent);
  border-color: var(--ds-accent);
  background: color-mix(in srgb, var(--ds-accent) 12%, transparent);
}
.ds-motion__hint {
  font-size: 10px;
  line-height: 1.45;
  color: color-mix(in srgb, var(--ds-muted) 88%, transparent);
}

/* ── 状态面板 ───────────────────────────────────────────────── */
.ds-panel {
  max-height: min(460px, calc(100vh - 130px));
  overflow: auto;
  scrollbar-width: thin;
}
.ds-panel__body { position: relative; padding: 10px 12px 12px; display: grid; gap: 11px; }
.ds-panel__sec { display: grid; gap: 5px; }
.ds-panel__label {
  display: flex;
  align-items: center;
  gap: 7px;
  font-family: var(--ds-mono);
  font-size: 8.5px;
  letter-spacing: .14em;
  color: color-mix(in srgb, var(--ds-muted) 88%, transparent);
  text-transform: uppercase;
}
.ds-panel__label::after {
  content: "";
  flex: 1;
  height: 1px;
  background: color-mix(in srgb, var(--ds-line) 66%, transparent);
}
.ds-panel__empty {
  font-size: 11px;
  line-height: 1.5;
  color: color-mix(in srgb, var(--ds-muted) 88%, transparent);
}
.ds-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 20px;
  font-size: 11.5px;
  line-height: 1.35;
  color: color-mix(in srgb, var(--ds-text) 88%, transparent);
}
.ds-row__dot {
  width: 5px;
  height: 5px;
  flex: none;
  transform: rotate(45deg);
  background: color-mix(in srgb, var(--ds-muted) 55%, transparent);
}
.ds-row__dot.is-live { background: var(--ds-ok); box-shadow: 0 0 6px var(--ds-ok); }
.ds-row__dot.is-urgent { background: var(--ds-accent); box-shadow: 0 0 6px var(--ds-accent); }
.ds-row__name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ds-row__time {
  margin-left: auto;
  flex: none;
  font-family: var(--ds-mono);
  font-size: 9px;
  letter-spacing: .04em;
  color: color-mix(in srgb, var(--ds-muted) 90%, transparent);
  font-variant-numeric: tabular-nums;
}
.ds-panel__idea {
  padding: 8px 9px;
  border: 1px solid color-mix(in srgb, var(--ds-line) 76%, transparent);
  border-left: 2px solid var(--ds-accent);
  background: color-mix(in srgb, var(--ds-accent) 5%, transparent);
}
.ds-panel__idea p { margin: 0; font-size: 11.5px; line-height: 1.5; }
.ds-panel__idea-title {
  margin-bottom: 4px;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.4;
  color: var(--ds-text);
}
.ds-panel__idea-why {
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px dashed color-mix(in srgb, var(--ds-line) 72%, transparent);
  font-size: 10.5px;
  line-height: 1.45;
  color: color-mix(in srgb, var(--ds-text) 78%, transparent);
}
.ds-panel__idea-foot {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-top: 7px;
  font-family: var(--ds-mono);
  font-size: 8.5px;
  letter-spacing: .06em;
  color: color-mix(in srgb, var(--ds-muted) 84%, transparent);
}
.ds-panel__idea-foot .ds-btn { margin-left: auto; }
.ds-form__row {
  display: flex;
  align-items: center;
  gap: 6px;
}
.ds-form__select {
  flex: 1;
  min-width: 0;
  padding: 5px 7px;
  border: 1px solid color-mix(in srgb, var(--ds-line-strong) 72%, transparent);
  border-radius: 2px;
  background: color-mix(in srgb, var(--ds-layer) 55%, transparent);
  color: var(--ds-text);
  font-family: var(--ds-mono);
  font-size: 9px;
  letter-spacing: .04em;
  cursor: pointer;
}
.ds-form__hint {
  font-size: 10px;
  line-height: 1.45;
  color: color-mix(in srgb, var(--ds-muted) 88%, transparent);
}
.ds-inbox__item {
  display: grid;
  gap: 2px;
  width: 100%;
  padding: 6px 0;
  border: 0;
  border-top: 1px solid color-mix(in srgb, var(--ds-line) 58%, transparent);
  background: transparent;
  color: var(--ds-text);
  text-align: left;
  cursor: pointer;
  font: inherit;
}
.ds-inbox__item:first-of-type { border-top: 0; }
.ds-inbox__item:hover .ds-inbox__title { color: var(--ds-accent); }
.ds-inbox__title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  line-height: 1.35;
  transition: color .15s ease;
}
.ds-inbox__meta {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--ds-mono);
  font-size: 8px;
  letter-spacing: .04em;
  color: color-mix(in srgb, var(--ds-muted) 86%, transparent);
}
.ds-panel__openmind {
  font-family: var(--ds-mono);
  font-size: 8px;
  letter-spacing: .1em;
  color: color-mix(in srgb, var(--ds-accent) 72%, var(--ds-muted));
}
.ds-panel__foot {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px 9px;
  border-top: 1px solid color-mix(in srgb, var(--ds-line) 64%, transparent);
  background: color-mix(in srgb, var(--ds-layer) 42%, transparent);
  font-family: var(--ds-mono);
  font-size: 8.5px;
  letter-spacing: .05em;
  color: color-mix(in srgb, var(--ds-muted) 76%, transparent);
}
.ds-panel__state {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  white-space: nowrap;
}
.ds-panel__state .ds-led { width: 4px; height: 4px; background: var(--ds-ok); box-shadow: 0 0 6px var(--ds-ok); }
.ds-panel__state.is-offline .ds-led { background: var(--ds-bad); box-shadow: 0 0 6px var(--ds-bad); }

/* CYBER 网络层：路由预览、跳点、拖链与数据包传输 */
.ds-net, .ds-trail, .ds-pings, .ds-packets, .ds-ep { pointer-events: none; }
.ds-root[data-motion="organic"] .ds-net,
.ds-root[data-motion="organic"] .ds-trail,
.ds-root[data-motion="organic"] .ds-pings { display: none; }
.ds-net__route {
  fill: none;
  stroke: var(--ds-accent);
  stroke-width: .7;
  stroke-linejoin: miter;
  stroke-dasharray: 1.6 3.4;
  animation: ds-net-flow .9s linear infinite;
}
.ds-net__lit {
  fill: none;
  stroke: #ffd3b0;
  stroke-width: 1.5;
  stroke-linejoin: miter;
  filter: drop-shadow(0 0 2px rgba(255, 122, 61, .8));
}
.ds-net__node {
  fill: #0c1014;
  stroke: var(--ds-amber);
  stroke-width: .7;
}
.ds-trail__seg {
  fill: none;
  stroke: var(--ds-accent);
  stroke-width: .55;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-dasharray: .4 2.2;
}
.ds-ping__shape {
  fill: none;
  stroke: var(--ds-amber);
  stroke-width: .6;
  vector-effect: non-scaling-stroke;
}
.ds-packet { stroke: none; }
.ds-packet--a { fill: var(--ds-accent); }
.ds-packet--b { fill: var(--ds-amber); }
.ds-packet--c { fill: #ffe4c6; }
.ds-ep__frame {
  fill: none;
  stroke: var(--ds-amber);
  stroke-width: 1;
  vector-effect: non-scaling-stroke;
}
.ds-ep__ticks {
  fill: none;
  stroke: var(--ds-accent);
  stroke-width: .7;
  opacity: .7;
}
.ds-ep__node {
  fill: #0c1014;
  stroke: var(--ds-accent);
  stroke-width: .8;
}
.ds-ep__ping {
  fill: none;
  stroke: var(--ds-accent);
  stroke-width: .8;
  transform-box: fill-box;
  transform-origin: 50% 50%;
  animation: ds-ep-ping .9s ease-out infinite;
}
.ds-ep__label {
  font-family: var(--ds-mono);
  font-size: 8px;
  letter-spacing: .04em;
  fill: #ffd3b0;
  paint-order: stroke;
  stroke: rgba(7, 10, 13, .7);
  stroke-width: 1.6px;
}
@keyframes ds-ep-ping {
  0% { transform: rotate(45deg) scale(.6); opacity: .8; }
  100% { transform: rotate(45deg) scale(2.4); opacity: 0; }
}
@keyframes ds-net-flow { to { stroke-dashoffset: -10; } }

/* 会话行里的蜘蛛锚点；只占 5px，不挡会话行点击 */
.ds-row-anchor {
  display: inline-block;
  width: 5px;
  height: 5px;
  margin: 0 1px;
  border-radius: 50%;
  background: var(--ds-accent);
  box-shadow: 0 0 4px rgba(255, 90, 31, .55);
  opacity: .68;
  pointer-events: none;
  vertical-align: middle;
}

/* 电子爬虫：同一套钢灰 + 安全橙，只是腿稍微更硬、更电气化 */
.ds-root[data-motion="cyber"] .ds-leg__under { stroke-width: 1.35; }
.ds-root[data-motion="cyber"] .ds-leg__femur { stroke-width: .9; }
.ds-root[data-motion="cyber"] .ds-leg__tibia { stroke-width: .58; }
.ds-root[data-motion="cyber"] .ds-leg__tarsus { stroke-width: .44; }
.ds-root[data-motion="cyber"] .ds-leg__trace {
  stroke-width: .26;
  opacity: .5;
  stroke-dasharray: 3 4;
}
.ds-root[data-motion="cyber"] .ds-body-root {
  filter: drop-shadow(0 0 4px rgba(255, 90, 31, .26));
}
.ds-cyber-ring {
  display: none;
  fill: none;
  stroke: var(--ds-accent);
  stroke-width: 2.4;
  stroke-dasharray: 3 5;
  opacity: .42;
  transform-box: fill-box;
  transform-origin: 50% 50%;
  animation: ds-cyber-spin 9s linear infinite;
}
.ds-root[data-motion="cyber"] .ds-cyber-ring { display: block; }
@keyframes ds-cyber-spin { to { transform: rotate(360deg); } }

@media (prefers-reduced-motion: reduce) {
  .ds-body-breathe, .ds-core, .ds-chip, .ds-pop, .ds-net__route, .ds-ep__ping,
  .ds-thought__bubble, .ds-thought__dot, .ds-thought__glow, .ds-mood__bubble, .ds-mood__glyph { animation: none !important; }
}

@media (max-width: 560px) {
  .ds-pop { width: calc(100vw - 28px); }
  .ds-chip__title { max-width: 90px; }
}
`

    function format(template, vars) {
      return String(template).replace(/\{(\w+)\}/g, (match, key) =>
        vars && vars[key] !== undefined && vars[key] !== null ? String(vars[key]) : match,
      )
    }

    function localeTag(locale) {
      try {
        const active = locale && typeof locale.getLocale === 'function' ? locale.getLocale().active : ''
        return typeof active === 'string' && active.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en-US'
      } catch {
        return 'en-US'
      }
    }

    function timeLabel(ms, locale) {
      try {
        return new Date(ms).toLocaleTimeString(localeTag(locale), {
          hour: '2-digit',
          minute: '2-digit',
        })
      } catch {
        return ''
      }
    }

    function relativeLabel(iso, translate, locale, now) {
      const at = Date.parse(iso)
      if (!Number.isFinite(at)) return ''
      const delta = at - now
      if (delta <= 0) return translate('meta.now')
      if (delta < 60_000) return format(translate('inSeconds'), { n: Math.max(1, Math.round(delta / 1000)) })
      if (delta < 3_600_000) return format(translate('inMinutes'), { n: Math.ceil(delta / 60_000) })
      return timeLabel(at, locale)
    }

    function durationLabel(ms, translate) {
      if (ms <= 0) return translate('chipNow')
      const total = Math.min(99 * 60 + 59, Math.ceil(ms / 1000))
      const minutes = Math.floor(total / 60)
      const seconds = total % 60
      return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    }

    function describeEvent(item, translate, locale, now) {
      const title = item.title || translate('untitledSession')
      switch (item.kind) {
        case 'session-running':
          return {
            label: translate('label.session'),
            title,
            meta: translate('meta.live'),
            body: translate('sessionRunningBody'),
            tone: 'live',
          }
        case 'session-rest':
          return {
            label: translate('label.session'),
            title,
            meta: translate('meta.done'),
            body: item.excerpt || translate('sessionRestBody'),
            tone: 'done',
          }
        case 'schedule-soon':
          return {
            label: translate('label.schedule'),
            title: item.title || translate('untitledTask'),
            meta: relativeLabel(item.scheduledAt, translate, locale, now),
            body: translate('scheduleSoonBody'),
            tone: 'warn',
          }
        case 'schedule-now':
          return {
            label: translate('label.schedule'),
            title: item.title || translate('untitledTask'),
            meta: translate('meta.now'),
            body: translate('scheduleNowBody'),
            tone: 'alert',
          }
        case 'mood': {
          const valence = item.valence === 'positive' ? 'positive' : 'negative'
          return {
            label: translate('label.mood'),
            title: item.title
              ? format(translate('ideaFrom'), { title: item.title })
              : translate(`mood.${valence}`),
            meta: item.emotion
              ? translate(`emotion.${item.emotion}`)
              : translate(`mood.${valence}`),
            body: item.text || '',
            hint: '',
            tone: valence === 'positive' ? 'cheer' : 'care',
            valence,
            emotion: item.emotion || 'other',
            moodId: item.moodId || '',
            sessionId: item.sessionId || '',
            sessionTitle: item.title || '',
          }
        }
        case 'idea': {
          const sessionTitle = item.sessionTitle || item.title || ''
          const skill = item.skill || ''
          const skillLabel = item.skillLabel || skill
          const mode = item.mode || ''
          const formMeta = [skillLabel, mode].filter(Boolean).join(' · ')
          return {
            label: translate('label.idea'),
            title: sessionTitle
              ? format(translate('ideaFrom'), { title: sessionTitle })
              : translate('ideaTitle'),
            meta: formMeta || (item.source === 'model' ? translate('source.model') : translate('source.local')),
            body: item.suggestion || item.text || '',
            hint: translate('ideaHint'),
            tone: 'idea',
            ideaTitle: item.ideaTitle || '',
            suggestion: item.suggestion || item.text || '',
            rationale: item.rationale || '',
            skill,
            skillLabel,
            mode,
            artifact: item.artifact && typeof item.artifact === 'object' ? item.artifact : null,
            skillReason: item.skillReason || '',
            sessionTitle,
            sessionId: item.sessionId || '',
            ideaSource: item.source || 'model',
            format: Number(item.format) || 2,
          }
        }
        default:
          return null
      }
    }

    function useLocaleRevision(locale) {
      const [, force] = React.useReducer((value) => value + 1, 0)
      React.useEffect(() => {
        if (!locale || typeof locale.subscribe !== 'function') return undefined
        return locale.subscribe(force)
      }, [locale])
    }

    function usePetFeed() {
      const [snapshot, setSnapshot] = React.useState(null)
      const [online, setOnline] = React.useState(true)

      React.useEffect(() => {
        let alive = true
        let timer = 0
        const controller = typeof AbortController === 'function' ? new AbortController() : null
        const accept = (data) =>
          data &&
          data.v === 1 &&
          Array.isArray(data.sessions) &&
          Array.isArray(data.schedules) &&
          Array.isArray(data.events)
        const endpoint = (path) => {
          try {
            return `${window.location.origin}${path}`
          } catch {
            return path
          }
        }
        const poll = async () => {
          try {
            const response = await fetch(endpoint(STATE_URL), {
              cache: 'no-store',
              signal: controller ? controller.signal : undefined,
            })
            if (!response.ok) throw new Error(`HTTP ${response.status}`)
            const data = await response.json()
            if (!alive || !accept(data)) return
            setOnline(true)
            setSnapshot(data)
          } catch {
            if (!alive || (controller && controller.signal.aborted)) return
            setOnline(false)
          } finally {
            if (alive) timer = window.setTimeout(poll, POLL_MS)
          }
        }
        void poll()
        return () => {
          alive = false
          if (controller) controller.abort()
          clearTimeout(timer)
        }
      }, [])

      return { snapshot, online }
    }

    /* ── 模拟工具 ─────────────────────────────────────────────── */

    function clamp(value, min, max) {
      return Math.min(max, Math.max(min, value))
    }

    function lerp(a, b, t) {
      return a + (b - a) * t
    }

    function ease(t) {
      return t * t * (3 - 2 * t)
    }

    function normalizeAngle(angle) {
      let next = angle
      while (next > Math.PI) next -= Math.PI * 2
      while (next < -Math.PI) next += Math.PI * 2
      return next
    }

    function createLeg(leg, bodyX, bodyY, angle, now) {
      const cos = Math.cos(angle)
      const sin = Math.sin(angle)
      const hx = leg.home[0]
      const hy = leg.home[1]
      const footX = bodyX + hx * cos - hy * sin
      const footY = bodyY + hx * sin + hy * cos
      return {
        def: leg,
        foot: { x: footX, y: footY },
        from: { x: footX, y: footY },
        to: { x: footX, y: footY },
        stepping: false,
        t0: 0,
        dur: 1,
        lift: 0,
        arc: 0,
        nextAt: 0,
        itchAt:
          now +
          (leg.front ? 1400 + Math.random() * 2200 : 3200 + Math.random() * 4200),
        cyber: {
          cycle: -1,
          probe: false,
          probeAt: now + 2600 + Math.random() * 4200,
          holdUntil: 0,
          pulseAt: -1e9,
        },
      }
    }

    function createSim(width, height, now) {
      const x = width * 0.5
      const y = height * 0.48
      const angle = -0.15
      return {
        x,
        y,
        rx: x,
        ry: y,
        vx: 0,
        vy: 0,
        angle,
        targetAngle: angle,
        target: { x, y },
        mode: 'idle',
        pending: null,
        nextWanderAt: now + 1200,
        nextScanAt: now + 2800,
        sway: 0,
        surge: 0,
        gaitPhase: 0,
        pauseUntil: 0,
        nextBurstAt: now + 2000,
        startle: 0,
        omega: 0,
        cyberCycle: 0,
        cyberMove: 0,
        cyberSettleAt: 0,
        route: [],
        routeIndex: 0,
        routeFor: null,
        routeAlpha: 0,
        routeDraw: [],
        nodeHoldUntil: 0,
        trail: [],
        trailAt: 0,
        pings: Array.from({ length: PING_SLOTS }, () => ({ x: 0, y: 0, at: -1e9, size: 1 })),
        pingCursor: 0,
        abdomenLag: 0,
        warp: null,
        warpState: null,
        warpScale: 1,
        warpLegPull: [0, 0],
        warpVisible: 1,
        warpGlitch: 0,
        legs: LEG_DEFS.map((leg) => createLeg(leg, x, y, angle, now)),
        grips: Array.from({ length: GRIP_SLOTS }, () => ({ x: 0, y: 0, at: -1e9 })),
        gripCursor: 0,
      }
    }

    function resetLegsForMotion(sim, style, now) {
      for (const leg of sim.legs) {
        if (style === MOTION_CYBER) {
          const home = legPoint(sim, leg, [leg.def.home[0], leg.def.home[1]])
          leg.foot = { x: home.x, y: home.y }
          leg.from = { x: home.x, y: home.y }
          leg.to = { x: home.x, y: home.y }
          leg.stepping = false
          leg.lift = 0
          leg.nextAt = 0
          leg.cyber.cycle = -1
          leg.cyber.probe = false
          leg.cyber.probeAt = now + 2600 + Math.random() * 4200
          leg.cyber.holdUntil = 0
          continue
        }
        const home = legPoint(sim, leg, [leg.def.home[0], leg.def.home[1]])
        leg.foot = { x: home.x, y: home.y }
        leg.from = { x: home.x, y: home.y }
        leg.to = { x: home.x, y: home.y }
        leg.stepping = false
        leg.lift = 0
        leg.nextAt = 0
      }
      sim.gaitPhase = 0
      sim.cyberCycle = 0
      sim.cyberMove = 0
      sim.omega = 0
      sim.abdomenLag = 0
      sim.route = []
      sim.routeIndex = 0
      sim.routeFor = null
      sim.trail = []
    }

    /** 中断传输：恢复身体并把未送达的提醒交回队列。 */
    function abortWarp(sim) {
      const item = sim.warp ? sim.warp.item : null
      sim.warp = null
      sim.warpState = null
      sim.warpScale = 1
      sim.warpLegPull = [0, 0]
      sim.warpVisible = 1
      sim.warpGlitch = 0
      return item
    }

    /**
     * 八向路由：像 PCB 走线一样只走 0°/45°/90°，最多一个拐点。
     * 返回不含起点的路点数组，最后一个就是目标。
     */
    function planRoute(from, to) {
      const dx = to.x - from.x
      const dy = to.y - from.y
      const adx = Math.abs(dx)
      const ady = Math.abs(dy)
      const diag = Math.min(adx, ady)
      const straight = Math.max(adx, ady) - diag
      if (Math.hypot(dx, dy) < 40 || diag < 10 || straight < 10) return [{ x: to.x, y: to.y }]
      const sx = Math.sign(dx)
      const sy = Math.sign(dy)
      const corner =
        Math.random() < 0.5
          ? { x: from.x + sx * diag, y: from.y + sy * diag }
          : adx > ady
            ? { x: from.x + sx * straight, y: from.y }
            : { x: from.x, y: from.y + sy * straight }
      return [corner, { x: to.x, y: to.y }]
    }

    function polylineLength(points) {
      let total = 0
      for (let index = 1; index < points.length; index += 1) {
        total += Math.hypot(points[index].x - points[index - 1].x, points[index].y - points[index - 1].y)
      }
      return total
    }

    function pointAlong(points, distance) {
      let left = Math.max(0, distance)
      for (let index = 1; index < points.length; index += 1) {
        const a = points[index - 1]
        const b = points[index]
        const segment = Math.hypot(b.x - a.x, b.y - a.y)
        if (left <= segment || index === points.length - 1) {
          const t = segment > 0 ? clamp(left / segment, 0, 1) : 1
          return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) }
        }
        left -= segment
      }
      return { x: points[0].x, y: points[0].y }
    }

    function pathData(points) {
      return points
        .map((point, index) => `${index ? 'L' : 'M'}${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
        .join('')
    }

    /** 蜘蛛身体被拆成的数据块：沿身体长轴分布在 3px 栅格上。 */
    function packetCloud(angle) {
      const cos = Math.cos(angle)
      const sin = Math.sin(angle)
      return Array.from({ length: PACKET_COUNT }, () => {
        const lx = Math.round((-18 + Math.random() * 28) / 4) * 4
        const ly = Math.round((-7 + Math.random() * 14) / 4) * 4
        return { x: lx * cos - ly * sin, y: lx * sin + ly * cos }
      })
    }

    /** 把蜘蛛编码成一次数据包传输，送到 target；item 到达后弹出。 */
    function beginWarp(sim, target, item, now) {
      sim.pending = null
      sim.mode = 'warp'
      sim.vx = 0
      sim.vy = 0
      sim.rx = sim.x
      sim.ry = sim.y
      sim.route = []
      sim.routeFor = null
      const from = { x: sim.x, y: sim.y }
      const to = { x: target.x, y: target.y }
      const path = [from, ...planRoute(from, to)]
      const length = polylineLength(path)
      sim.warp = {
        stage: 'out',
        t0: now,
        from,
        to,
        item: item || null,
        path,
        length,
        transmitMs: clamp(WARP_TRANSFER_MS + length * 0.32, WARP_TRANSFER_MS, 760),
        src: packetCloud(sim.angle),
        dst: packetCloud(sim.angle),
        tag: hexTag(),
        landed: [false, false],
      }
      sim.startle = 1
      sim.nextWanderAt = Number.POSITIVE_INFINITY
    }

    function hexTag() {
      return `0x${Math.floor(Math.random() * 0xffff).toString(16).toUpperCase().padStart(4, '0')}`
    }

    function minimumJerk(t) {
      return t * t * t * (10 - 15 * t + 6 * t * t)
    }

    function randomPoint(width, height) {
      const left = 86
      const top = 108
      const right = Math.max(left + 40, width - 86)
      const bottom = Math.max(top + 40, height - 76)
      return {
        x: clamp(Math.round((left + Math.random() * (right - left)) / ROUTE_GRID) * ROUTE_GRID, left, right),
        y: clamp(Math.round((top + Math.random() * (bottom - top)) / ROUTE_GRID) * ROUTE_GRID, top, bottom),
      }
    }

    function targetForItem(item) {
      /* 有会话行锚点就去真实行上；行不在视口/没有锚点时回 dock。 */
      const anchor = sessionAnchor(item?.sessionId)
      if (anchor) return anchor
      return dockPoint()
    }

    function placePop(x, y, isPanel) {
      const width = Math.max(320, window.innerWidth || 1200)
      const popWidth = Math.min(336, width - 28)
      const left = clamp(-popWidth / 2, 12 - x, width - popWidth - 12 - x)
      const notch = clamp(-left, 18, popWidth - 18)
      const above = y > (isPanel ? 420 : 285)
      /* 想法气泡：优先浮在蜘蛛右上方，靠右边缘时翻到左侧。 */
      const thoughtWidth = Math.min(232, width - 28)
      const thoughtLeft = clamp(10, 12 - x, width - thoughtWidth - 12 - x)
      const thoughtSide = thoughtLeft + thoughtWidth / 2 >= 0 ? 1 : -1
      return { left, notch, above, thoughtLeft, thoughtWidth, thoughtSide }
    }

    function legPoint(sim, leg, local) {
      const cos = Math.cos(sim.angle)
      const sin = Math.sin(sim.angle)
      const lx = local[0]
      const ly = local[1]
      return {
        x: sim.rx + lx * cos - ly * sin,
        y: sim.ry + lx * sin + ly * cos,
      }
    }

    function kneePoint(hip, foot, leg, angle) {
      const dx = foot.x - hip.x
      const dy = foot.y - hip.y
      const d = Math.max(0.001, Math.hypot(dx, dy))
      const femur = leg.def.femur
      const tibia = leg.def.tibia
      const a = clamp((femur * femur - tibia * tibia + d * d) / (2 * d), -femur, femur)
      const h = Math.sqrt(Math.max(0, femur * femur - a * a))
      const mx = hip.x + (dx / d) * a
      const my = hip.y + (dy / d) * a
      const px = -dy / d
      const py = dx / d
      const k1 = { x: mx + px * h, y: my + py * h }
      const k2 = { x: mx - px * h, y: my - py * h }
      const score = (knee) => {
        const rx = knee.x - hip.x
        const ry = knee.y - hip.y
        const localY = -rx * Math.sin(angle) + ry * Math.cos(angle)
        return localY * leg.def.side
      }
      return score(k1) >= score(k2) ? k1 : k2
    }

    function anklePoint(knee, foot, leg, angle) {
      const t = 0.7
      const ax = knee.x + (foot.x - knee.x) * t
      const ay = knee.y + (foot.y - knee.y) * t
      const dx = foot.x - knee.x
      const dy = foot.y - knee.y
      const len = Math.max(0.001, Math.hypot(dx, dy))
      const px = -dy / len
      const py = dx / len
      const bend = 2.2
      const a1 = { x: ax + px * bend, y: ay + py * bend }
      const a2 = { x: ax - px * bend, y: ay - py * bend }
      const score = (point) => {
        const rx = point.x - knee.x
        const ry = point.y - knee.y
        const localY = -rx * Math.sin(angle) + ry * Math.cos(angle)
        return localY * leg.def.side
      }
      return score(a1) >= score(a2) ? a1 : a2
    }

    const EP_BRACKETS =
      'M-1 -.55V-1H-.55M.55 -1H1V-.55M1 .55V1H.55M-.55 1H-1V.55'
    const EP_TICKS = 'M0 -32V-25M32 0H25M0 32V25M-32 0H-25'

    /** 传输端点：锁定框 + 准星刻度 + 菱形节点 + 方形脉冲 + TX/RX 标签。 */
    function endpointArt(slot) {
      return [
        h('path', { key: 'ticks', className: 'ds-ep__ticks', d: EP_TICKS }),
        h('rect', { key: 'ping', className: 'ds-ep__ping', x: '-4', y: '-4', width: '8', height: '8' }),
        h('path', { key: 'node', className: 'ds-ep__node', d: 'M0 -3.2L3.2 0L0 3.2L-3.2 0Z' }),
        h('path', {
          key: 'frame',
          ref: (element) => {
            slot.frame = element
          },
          className: 'ds-ep__frame',
          d: EP_BRACKETS,
        }),
        h('text', {
          key: 'label',
          ref: (element) => {
            slot.label = element
          },
          className: 'ds-ep__label',
          x: '20',
          y: '-18',
        }),
      ]
    }

    function SessionRowAnchor(props) {
      const ref = React.useRef(null)
      const sessionId = props && typeof props.sessionId === 'string' ? props.sessionId : ''

      React.useEffect(() => {
        const element = ref.current
        if (!element || !sessionId) return undefined
        rowAnchors.set(sessionId, element)
        return () => {
          if (rowAnchors.get(sessionId) === element) rowAnchors.delete(sessionId)
        }
      }, [sessionId])

      return h('span', { ref, className: 'ds-row-anchor', 'aria-hidden': 'true' })
    }

    function SpiderPet(props) {
      const { t: translate, locale } = props
      useLocaleRevision(locale)
      const { snapshot, online } = usePetFeed()

      const [ready, setReady] = React.useState(false)
      const [motion, setMotion] = React.useState(readMotionStyle)
      const [bubble, setBubble] = React.useState(null)
      const [panelOpen, setPanelOpen] = React.useState(false)
      const [placement, setPlacement] = React.useState({ left: -168, notch: 168, above: true })
      const [generating, setGenerating] = React.useState(false)
      const [ideaError, setIdeaError] = React.useState(false)
      const [latestIdea, setLatestIdea] = React.useState(null)
      const [skillChoice, setSkillChoice] = React.useState('auto')
      const [dismissedIds, setDismissedIds] = React.useState(() => new Set(readDismissedIdeaIds()))
      const [copyDone, setCopyDone] = React.useState(false)
      /* 点子先以想法气泡出现，只有点开后才展开成完整卡片。 */
      const [ideaOpen, setIdeaOpen] = React.useState(false)
      const [, setClock] = React.useState(0)

      const simRef = React.useRef(null)
      const motionRef = React.useRef(motion)
      const stageRef = React.useRef(null)
      const anchorRef = React.useRef(null)
      const bodyRef = React.useRef(null)
      const bodyShadowRef = React.useRef(null)
      const bodyGlowRef = React.useRef(null)
      const abdomenRef = React.useRef(null)
      const legsLayerRef = React.useRef(null)
      const routeRef = React.useRef(null)
      const routeLitRef = React.useRef(null)
      const routeNodeEls = React.useRef(Array.from({ length: ROUTE_NODES }, () => null))
      const trailEls = React.useRef([null, null, null])
      const pingEls = React.useRef(Array.from({ length: PING_SLOTS }, () => null))
      const packetEls = React.useRef(Array.from({ length: PACKET_COUNT }, () => null))
      const endpointEls = React.useRef([{}, {}])
      const legEls = React.useRef(LEG_DEFS.map(() => ({})))
      const gripEls = React.useRef(Array.from({ length: GRIP_SLOTS }, () => ({})))
      const queueRef = React.useRef([])
      const bubbleRef = React.useRef(null)
      const hideTimerRef = React.useRef(0)
      const panelOpenRef = React.useRef(false)
      const reducedRef = React.useRef(false)
      const seenRef = React.useRef(new Set())
      const seenIdeaRef = React.useRef(new Set())
      const baselineRef = React.useRef(false)
      const startedAtRef = React.useRef(0)
      const lastSessionStartRef = React.useRef(0)
      const offsetRef = React.useRef(0)
      const mountedRef = React.useRef(true)
      const apiRef = React.useRef(null)

      React.useEffect(() => {
        mountedRef.current = true
        return () => {
          mountedRef.current = false
          clearTimeout(hideTimerRef.current)
        }
      }, [])

      React.useEffect(() => {
        if (!snapshot) return
        const serverNow =
          typeof snapshot.now === 'number' && Number.isFinite(snapshot.now)
            ? snapshot.now
            : Date.now()
        offsetRef.current = serverNow - Date.now()
      }, [snapshot])

      React.useEffect(() => {
        motionRef.current = motion
      }, [motion])

      React.useEffect(() => {
        const timer = window.setInterval(() => setClock((value) => (value + 1) % 1000000), 1000)
        return () => clearInterval(timer)
      }, [])

      React.useEffect(() => {
        if (typeof window.matchMedia !== 'function') return undefined
        const media = window.matchMedia('(prefers-reduced-motion: reduce)')
        const sync = () => {
          reducedRef.current = media.matches === true
        }
        sync()
        if (typeof media.addEventListener === 'function') media.addEventListener('change', sync)
        else if (typeof media.addListener === 'function') media.addListener(sync)
        return () => {
          if (typeof media.removeEventListener === 'function') media.removeEventListener('change', sync)
          else if (typeof media.removeListener === 'function') media.removeListener(sync)
        }
      }, [])

      const showItem = React.useCallback(
        (item) => {
          if (!mountedRef.current) return
          const content = describeEvent(item, translate, locale, Date.now() + offsetRef.current)
          if (!content) return
          const sim = simRef.current
          const next = {
            ...content,
            key: item.key,
            kind: item.kind,
            taskId: item.taskId,
            ideaId: item.ideaId,
            at: item.at,
            source: item.source,
            sessionId: content.sessionId,
            ideaTitle: content.ideaTitle,
            suggestion: content.suggestion,
            rationale: content.rationale,
            skill: content.skill,
            skillLabel: content.skillLabel,
            mode: content.mode,
            artifact: content.artifact,
            skillReason: content.skillReason,
            format: content.format,
            sessionTitle: content.sessionTitle,
            ideaSource: content.ideaSource,
            emotion: content.emotion,
            valence: content.valence,
            moodId: content.moodId,
          }
          bubbleRef.current = next
          setBubble(next)
          setIdeaError(false)
          setCopyDone(false)
          setIdeaOpen(false)
          if (sim) {
            sim.mode = 'perch'
            sim.pending = null
            sim.startle = 0.65
            sim.nextWanderAt = Number.POSITIVE_INFINITY
            setPlacement(placePop(sim.rx, sim.ry, false))
          } else {
            setPlacement(placePop(window.innerWidth / 2, window.innerHeight / 2, false))
          }
          clearTimeout(hideTimerRef.current)
          const dwell =
            item.kind === 'mood'
              ? MOOD_MS
              : item.kind === 'idea'
                ? IDEA_MS
                : item.kind === 'schedule-now'
                  ? 9000
                  : BUBBLE_MS
          hideTimerRef.current = window.setTimeout(() => {
            if (apiRef.current) apiRef.current.closeBubble()
          }, dwell)
        },
        [locale, translate],
      )

      const closeBubble = React.useCallback(() => {
        clearTimeout(hideTimerRef.current)
        hideTimerRef.current = 0
        if (!bubbleRef.current) return
        bubbleRef.current = null
        setBubble(null)
        const sim = simRef.current
        if (sim && !panelOpenRef.current) {
          const dock = dockPoint()
          sim.target = dock
          sim.mode = 'walk'
          sim.nextWanderAt = Number.POSITIVE_INFINITY
        }
        window.setTimeout(() => {
          if (apiRef.current) apiRef.current.pump()
        }, 340)
      }, [])

      const pump = React.useCallback(() => {
        if (bubbleRef.current || panelOpenRef.current) return
        const sim = simRef.current
        if (sim && (sim.pending || sim.warp)) return
        const next = queueRef.current.shift()
        if (next) {
          if (apiRef.current) apiRef.current.dispatchItem(next)
          return
        }
        if (sim) {
          const dock = dockPoint()
          sim.target = dock
          sim.mode = 'walk'
          sim.nextWanderAt = Number.POSITIVE_INFINITY
        }
      }, [])

      const dispatchItem = React.useCallback((item) => {
        const sim = simRef.current
        if (!sim) {
          queueRef.current.push(item)
          return
        }
        const target = targetForItem(item, window.innerWidth, window.innerHeight)
        if (sim.warp) {
          queueRef.current.push(item)
          return
        }
        if (reducedRef.current) {
          sim.x = target.x
          sim.y = target.y
          sim.rx = target.x
          sim.ry = target.y
          sim.vx = 0
          sim.vy = 0
          sim.pending = null
          sim.mode = 'perch'
          for (const leg of sim.legs) {
            const point = legPoint(sim, leg, leg.def.home)
            leg.foot = { x: point.x, y: point.y }
            leg.stepping = false
          }
          if (apiRef.current) apiRef.current.showItem(item)
          return
        }
        const distance = Math.hypot(target.x - sim.x, target.y - sim.y)
        if (motionRef.current === MOTION_CYBER && distance > WORMHOLE_DISTANCE) {
          if (sim.pending && sim.pending !== item) {
            queueRef.current.push({ ...sim.pending, priority: sim.pending.priority || 2 })
          }
          beginWarp(sim, target, item, performance.now())
          return
        }
        if (sim.pending && sim.pending !== item) {
          queueRef.current.push({ ...sim.pending, priority: sim.pending.priority || 2 })
        }
        sim.pending = item
        sim.target = target
        sim.mode = 'run'
        sim.startle = 1
        sim.nextWanderAt = Number.POSITIVE_INFINITY
      }, [])

      const enqueue = React.useCallback((item) => {
        const queue = queueRef.current
        const priority = item.priority || 2
        let index = queue.findIndex((entry) => (entry.priority || 2) < priority)
        if (index < 0) index = queue.length
        queue.splice(index, 0, item)
        if (queue.length > MAX_QUEUE) queue.length = MAX_QUEUE
        if (apiRef.current) apiRef.current.pump()
      }, [])

      const ingest = React.useCallback((event) => {
        const kind = event.kind
        const sim = simRef.current
        if (kind === 'session-running') {
          if (Date.now() - lastSessionStartRef.current < SESSION_START_COOLDOWN_MS) return
          if (
            bubbleRef.current ||
            queueRef.current.length > 0 ||
            panelOpenRef.current ||
            sim?.pending ||
            sim?.warp
          ) {
            return
          }
          lastSessionStartRef.current = Date.now()
          if (apiRef.current) {
            apiRef.current.enqueue({
              key: event.id,
              kind,
              station: 'session',
              at: event.at,
              title: event.title || '',
              sessionId: event.sessionId,
              priority: 1,
            })
          }
          return
        }

        if (kind === 'session-rest') {
          if (apiRef.current) {
            apiRef.current.enqueue({
              key: event.id,
              kind,
              station: 'session',
              at: event.at,
              title: event.title || '',
              excerpt: event.excerpt || '',
              sessionId: event.sessionId,
              priority: 2,
            })
          }
          return
        }

        if (kind === 'schedule-soon') {
          if (apiRef.current) {
            apiRef.current.enqueue({
              key: event.id,
              kind,
              station: 'schedule',
              at: event.at,
              title: event.title || '',
              taskId: event.taskId,
              scheduledAt: event.scheduledAt,
              priority: 2,
            })
          }
          return
        }

        if (kind === 'schedule-now') {
          queueRef.current = queueRef.current.filter(
            (entry) => !(entry.kind === 'schedule-soon' && entry.taskId === event.taskId),
          )
          if (sim && sim.pending && sim.pending.kind !== 'schedule-now') {
            queueRef.current.unshift({ ...sim.pending, priority: 2 })
            sim.pending = null
            sim.mode = 'idle'
          }
          if (
            bubbleRef.current &&
            bubbleRef.current.kind === 'schedule-soon' &&
            bubbleRef.current.taskId === event.taskId
          ) {
            clearTimeout(hideTimerRef.current)
            bubbleRef.current = null
            setBubble(null)
          }
          if (apiRef.current) {
            apiRef.current.enqueue({
              key: event.id,
              kind,
              station: 'schedule',
              at: event.at,
              title: event.title || '',
              taskId: event.taskId,
              scheduledAt: event.scheduledAt,
              priority: 3,
            })
          }
          return
        }

        if (kind === 'mood') {
          const moodId = event.moodId
          if (moodId) {
            if (bubbleRef.current && bubbleRef.current.moodId === moodId) return
            if (queueRef.current.some((entry) => entry.moodId === moodId)) return
            if (sim && sim.pending && sim.pending.moodId === moodId) return
          }
          /* 情绪反馈优先于正在显示/赶来的点子，但不打断已经到点的定时任务。 */
          if (sim && sim.pending && sim.pending.kind === 'idea') {
            queueRef.current.push({ ...sim.pending, priority: sim.pending.priority || 2 })
            sim.pending = null
            sim.mode = 'idle'
          }
          if (
            !panelOpenRef.current &&
            bubbleRef.current &&
            bubbleRef.current.kind === 'idea'
          ) {
            clearTimeout(hideTimerRef.current)
            bubbleRef.current = null
            setBubble(null)
          }
          if (apiRef.current) {
            apiRef.current.enqueue({
              key: event.id,
              kind,
              station: 'mood',
              at: event.at,
              title: event.title || '',
              sessionTitle: event.title || '',
              sessionId: event.sessionId || '',
              text: event.text || '',
              valence: event.valence === 'positive' ? 'positive' : 'negative',
              emotion: event.emotion || 'other',
              intensity: event.intensity,
              moodId,
              priority: 4,
            })
          }
          return
        }

        if (kind === 'idea') {
          const ideaId = event.ideaId
          if (ideaId) {
            if (seenIdeaRef.current.has(ideaId)) return
            if (bubbleRef.current && bubbleRef.current.ideaId === ideaId) return
            if (queueRef.current.some((entry) => entry.ideaId === ideaId)) return
            if (sim && sim.pending && sim.pending.ideaId === ideaId) return
            seenIdeaRef.current.add(ideaId)
          }
          const sessionTitle = event.sessionTitle || event.title || ''
          if (apiRef.current) {
            apiRef.current.enqueue({
              key: event.id,
              kind,
              station: 'idea',
              at: event.at,
              title: sessionTitle,
              sessionTitle,
              sessionId: event.sessionId || '',
              text: event.text || '',
              ideaId,
              ideaTitle: event.ideaTitle || '',
              suggestion: event.suggestion || '',
              rationale: event.rationale || '',
              skill: event.skill || '',
              skillLabel: event.skillLabel || event.skill || '',
              mode: event.mode || '',
              artifact: event.artifact && typeof event.artifact === 'object' ? event.artifact : null,
              skillReason: event.skillReason || '',
              source: event.source || 'model',
              format: Number(event.format) || 3,
              trigger: event.trigger || 'rest',
              priority: 2,
            })
          }
        }
      }, [])

      React.useEffect(() => {
        apiRef.current = { showItem, closeBubble, pump, dispatchItem, enqueue, ingest }
      }, [closeBubble, dispatchItem, enqueue, ingest, pump, showItem])

      /* 主循环：模拟 + 直接写 SVG/DOM，React 不参与每帧。 */
      React.useEffect(() => {
        const now0 = performance.now()
        const sim = createSim(window.innerWidth || 1200, window.innerHeight || 800, now0)
        const dock = dockPoint()
        sim.x = dock.x
        sim.y = dock.y
        sim.rx = dock.x
        sim.ry = dock.y
        sim.target = { x: dock.x, y: dock.y }
        sim.mode = 'idle'
        sim.nextWanderAt = now0 + 5000 + Math.random() * 4000
        resetLegsForMotion(sim, motionRef.current, now0)
        simRef.current = sim
        let raf = 0
        let last = now0

        const setAttr = (element, name, value) => {
          if (element) element.setAttribute(name, String(value))
        }

        const plantGrip = (at) => {
          const slot = sim.grips[sim.gripCursor % GRIP_SLOTS]
          sim.gripCursor += 1
          if (slot) {
            slot.x = at.x
            slot.y = at.y
            slot.at = performance.now()
          }
        }

        const startStep = (leg, now, speed, idle) => {
          const home = legPoint(sim, leg, [leg.def.home[0], leg.def.home[1]])
          let tx = home.x
          let ty = home.y
          if (idle) {
            tx += (Math.random() - 0.5) * 9
            ty += (Math.random() - 0.5) * 9
          } else {
            const vlen = Math.hypot(sim.vx, sim.vy)
            const lead = Math.min(18, vlen * 0.06)
            const ux = vlen > 1 ? sim.vx / vlen : Math.cos(sim.angle)
            const uy = vlen > 1 ? sim.vy / vlen : Math.sin(sim.angle)
            tx += ux * lead
            ty += uy * lead
            const px = -Math.sin(sim.angle)
            const py = Math.cos(sim.angle)
            const jitter = (1.5 + Math.random() * 2.5) * leg.def.side
            tx += px * jitter
            ty += py * jitter
          }
          const hip = legPoint(sim, leg, [leg.def.hip[0], leg.def.hip[1]])
          const reach = leg.def.reach
          const d = Math.hypot(tx - hip.x, ty - hip.y)
          if (d > reach) {
            const k = reach / d
            tx = hip.x + (tx - hip.x) * k
            ty = hip.y + (ty - hip.y) * k
          }
          leg.from = { x: leg.foot.x, y: leg.foot.y }
          leg.to = { x: tx, y: ty }
          leg.t0 = now
          leg.dur = idle ? 280 : speed > 160 ? 80 : 120
          leg.stepping = true
          leg.lift = 0
          const bow = (speed > 160 ? 5 : 4) + Math.random() * 3.5
          leg.arc = (leg.def.side * 0.6 + (Math.random() - 0.5) * 0.8) * bow
        }

        const plantPing = (at, size) => {
          const slot = sim.pings[sim.pingCursor % PING_SLOTS]
          sim.pingCursor += 1
          if (slot) {
            slot.x = at.x
            slot.y = at.y
            slot.size = size
            slot.at = performance.now()
          }
        }

        /** 身体在 ahead 秒后的预测位姿下，这条腿的静止落点。 */
        const predictedHome = (leg, ahead) => {
          const horizon = clamp(ahead, 0, 0.8)
          const angle = sim.angle + sim.omega * horizon
          const bx = sim.x + sim.vx * horizon
          const by = sim.y + sim.vy * horizon
          const cos = Math.cos(angle)
          const sin = Math.sin(angle)
          const [hx, hy] = leg.def.home
          return { x: bx + hx * cos - hy * sin, y: by + hx * sin + hy * cos }
        }

        const startCyberStep = (leg, now, target, dur, bow) => {
          const margin = 20
          leg.from = { x: leg.foot.x, y: leg.foot.y }
          leg.to = {
            x: clamp(target.x, margin, (window.innerWidth || 1200) - margin),
            y: clamp(target.y, margin, (window.innerHeight || 800) - margin),
          }
          leg.t0 = now
          leg.dur = dur
          leg.stepping = true
          leg.lift = 0
          leg.arc = bow
        }

        /**
         * 交替四足：L1·R2·L3·R4 与 R1·L2·R3·L4 两组相差半个周期，组内从后往前
         * 有一条小的相位波。相位由身体位移 + 转身角速度推进，所以腿只在身体真的
         * 移动/转动时迈步；落点取「摆动结束 + 半个支撑期」时髋部所在的位置，
         * 身体会正好从脚上方经过。
         */
        const updateCyberLegs = (now, effSpeed, cycleDist) => {
          let swinging = 0
          for (const leg of sim.legs) {
            if (!leg.stepping) continue
            const p = (now - leg.t0) / leg.dur
            if (p < 1) {
              leg.lift = Math.sin(Math.PI * p)
              swinging += 1
              continue
            }
            leg.stepping = false
            leg.foot = { x: leg.to.x, y: leg.to.y }
            leg.lift = 0
            leg.cyber.pulseAt = now
            plantGrip(leg.foot)
            if (leg.cyber.probe) {
              leg.cyber.probe = false
              leg.cyber.holdUntil = now + 650 + Math.random() * 450
              plantPing(leg.foot, 0.8)
            }
          }

          const moving = effSpeed > 6
          if (moving) {
            sim.cyberSettleAt = now + 180
            const stanceTime = ((1 - CYBER_SWING) * cycleDist) / Math.max(effSpeed, 1)
            for (const leg of sim.legs) {
              if (leg.stepping) continue
              leg.cyber.holdUntil = 0
              const offset = leg.def.group * 0.5 + (leg.def.index % 4) * 0.035
              const local = sim.cyberCycle + offset
              const cycle = Math.floor(local)
              const frac = local - cycle
              const hip = legPoint(sim, leg, leg.def.hip)
              const overReach =
                Math.hypot(leg.foot.x - hip.x, leg.foot.y - hip.y) > leg.def.rest * CYBER_REACH
              if (!overReach && (frac >= CYBER_SWING || leg.cyber.cycle === cycle)) continue
              /* 始终留至少四只脚撑地；晚到的腿等下一拍。 */
              if (!overReach && swinging >= 4) continue
              leg.cyber.cycle = cycle
              const remaining = Math.max(0.12, CYBER_SWING - frac)
              const dur = clamp(((remaining * cycleDist) / Math.max(effSpeed, 1)) * 1000, 60, 300)
              const target = predictedHome(leg, dur / 1000 + stanceTime / 2)
              /* 前腿像抓钩一样伸得更远，后腿留在身后被拖着收回。 */
              const speed = Math.hypot(sim.vx, sim.vy)
              if (speed > 4) {
                const grab = CYBER_GRAB[leg.def.index % 4] * cycleDist
                target.x += (sim.vx / speed) * grab
                target.y += (sim.vy / speed) * grab
              }
              startCyberStep(leg, now, target, dur, 0.26)
              swinging += 1
            }
            return
          }

          if (swinging > 0 || now < sim.cyberSettleAt) return

          /* 停下后按组收脚：偏得更多的那组先迈，另一组下一拍跟上。 */
          const deviation = [0, 0]
          for (const leg of sim.legs) {
            if (leg.cyber.holdUntil > now) continue
            const home = legPoint(sim, leg, leg.def.home)
            const d = Math.hypot(home.x - leg.foot.x, home.y - leg.foot.y)
            deviation[leg.def.group] = Math.max(deviation[leg.def.group], d)
          }
          const group = deviation[0] >= deviation[1] ? 0 : 1
          if (deviation[group] > 4.5) {
            for (const leg of sim.legs) {
              if (leg.def.group !== group || leg.cyber.holdUntil > now) continue
              const home = legPoint(sim, leg, leg.def.home)
              if (Math.hypot(home.x - leg.foot.x, home.y - leg.foot.y) <= 3) continue
              startCyberStep(leg, now, home, 130, 0.14)
            }
            sim.cyberSettleAt = now + 150
            return
          }

          /* 站稳后：前腿偶尔向前探出、点一下页面，再收回。 */
          if (reducedRef.current || sim.mode === 'warp') return
          for (const leg of sim.legs) {
            if (!leg.def.front || now < leg.cyber.probeAt) continue
            if (sim.legs.some((other) => other.cyber.holdUntil > now)) break
            const cos = Math.cos(sim.angle)
            const sin = Math.sin(sim.angle)
            const lx = leg.def.home[0] + 30 + Math.random() * 26
            const ly = leg.def.home[1] + leg.def.side * (2 + Math.random() * 6)
            leg.cyber.probe = true
            leg.cyber.probeAt = now + 3800 + Math.random() * 4600
            startCyberStep(
              leg,
              now,
              { x: sim.rx + lx * cos - ly * sin, y: sim.ry + lx * sin + ly * cos },
              220,
              0.12,
            )
            sim.cyberSettleAt = now + 300
            break
          }
        }

        const renderCyberLegs = (now) => {
          const fmt = (value) => value.toFixed(2)
          for (const leg of sim.legs) {
            const els = legEls.current[leg.def.index]
            if (!els || !els.femur) continue
            const hip = legPoint(sim, leg, leg.def.hip)
            let footX = leg.foot.x
            let footY = leg.foot.y
            let lift = 0
            if (leg.stepping) {
              const p = clamp((now - leg.t0) / leg.dur, 0, 1)
              const e = minimumJerk(p)
              footX = lerp(leg.from.x, leg.to.x, e)
              footY = lerp(leg.from.y, leg.to.y, e)
              /*
               * 伸缩腿：前半程收回（足尖向身体缩），后半程弹射伸出、略微越过落点
               * 再回弹抓住；leg.arc 是收缩比例。影子拉开表示抬起。
               */
              const wave = Math.sin(Math.PI * 2 * p)
              const radial = 1 - leg.arc * wave * (p < 0.5 ? 1 : 0.45)
              footX = sim.rx + (footX - sim.rx) * radial
              footY = sim.ry + (footY - sim.ry) * radial
              lift = Math.sin(Math.PI * p)
            }

            const pull = sim.warpLegPull[leg.def.group] || 0
            if (pull > 0) {
              const k = 1 - Math.min(0.97, pull)
              footX = sim.rx + (footX - sim.rx) * k
              footY = sim.ry + (footY - sim.ry) * k
            }

            const foot = { x: footX, y: footY }
            /*
             * 俯视投影的膝：真实蜘蛛的膝是朝上抬起的，从上往下看只在髋—足连线外侧
             * 鼓出一点点。两段腿长按折叠比例缩短，再取侧向高度的一小部分作为外拱。
             */
            const shrink = 1 - Math.min(0.97, pull)
            const hx = foot.x - hip.x
            const hy = foot.y - hip.y
            const reachD = Math.max(0.001, Math.hypot(hx, hy))
            /* 伸缩：各节按比例伸长/缩短，伸得越长越直、越细。 */
            const extension = reachD / leg.def.rest
            const lateral =
              clamp(reachD * 0.075, 0.8, 6.5) * shrink * clamp(1.6 - extension * 0.5, 0.35, 1.2) +
              lift * 1.2
            let perpX = -hy / reachD
            let perpY = hx / reachD
            if ((-perpX * Math.sin(sim.angle) + perpY * Math.cos(sim.angle)) * leg.def.side < 0) {
              perpX = -perpX
              perpY = -perpY
            }
            const kneeAt = reachD * 0.44
            const knee = {
              x: hip.x + (hx / reachD) * kneeAt + perpX * lateral,
              y: hip.y + (hy / reachD) * kneeAt + perpY * lateral,
            }
            const kx = foot.x - knee.x
            const ky = foot.y - knee.y
            const klen = Math.max(0.001, Math.hypot(kx, ky))
            const bend = leg.def.side * (1.4 + lift * 0.8)
            const nx = (-ky / klen) * bend
            const ny = (kx / klen) * bend
            const localSide = (x, y) =>
              (-(x - knee.x) * Math.sin(sim.angle) + (y - knee.y) * Math.cos(sim.angle)) * leg.def.side
            const sign = localSide(knee.x + nx, knee.y + ny) >= 0 ? 1 : -1
            const p2 = { x: knee.x + kx * 0.5 + nx * sign, y: knee.y + ky * 0.5 + ny * sign }
            const p3 = {
              x: knee.x + kx * 0.8 + nx * sign * 0.45,
              y: knee.y + ky * 0.8 + ny * sign * 0.45,
            }
            const hipX = fmt(hip.x)
            const hipY = fmt(hip.y)
            const p1x = fmt(knee.x)
            const p1y = fmt(knee.y)
            const p2x = fmt(p2.x)
            const p2y = fmt(p2.y)
            const p3x = fmt(p3.x)
            const p3y = fmt(p3.y)
            const footXS = fmt(footX)
            const footYS = fmt(footY)
            const full = `M${hipX} ${hipY}L${p1x} ${p1y}L${p2x} ${p2y}L${p3x} ${p3y}L${footXS} ${footYS}`

            setAttr(els.under, 'd', full)
            setAttr(els.femur, 'd', `M${hipX} ${hipY}L${p1x} ${p1y}`)
            setAttr(els.tibia, 'd', `M${p1x} ${p1y}L${p2x} ${p2y}`)
            setAttr(els.tarsus, 'd', `M${p2x} ${p2y}L${p3x} ${p3y}L${footXS} ${footYS}`)
            setAttr(els.trace, 'd', full)
            /* 橙色信号沿腿从髋流向足尖；落足瞬间亮一下。 */
            const pulse = Math.max(0, 1 - (now - leg.cyber.pulseAt) / 260)
            setAttr(els.trace, 'stroke-dashoffset', fmt(-((now * 0.012 + leg.def.index * 2.3) % 7)))
            const stretch = clamp(extension - 1.15, 0, 1)
            setAttr(els.trace, 'opacity', fmt(0.42 + lift * 0.3 + pulse * 0.4 + stretch * 0.3))
            if (els.tibia.style) els.tibia.style.strokeWidth = fmt(0.58 * clamp(1.25 - stretch * 0.6, 0.6, 1.25))
            if (els.tarsus.style) els.tarsus.style.strokeWidth = fmt(0.44 * clamp(1.3 - stretch * 0.8, 0.45, 1.3))
            setAttr(els.hip, 'cx', hipX)
            setAttr(els.hip, 'cy', hipY)
            setAttr(els.hip, 'r', 1.2)
            setAttr(els.knee, 'cx', p1x)
            setAttr(els.knee, 'cy', p1y)
            setAttr(els.knee, 'r', 0.95)
            setAttr(els.ankle, 'cx', p2x)
            setAttr(els.ankle, 'cy', p2y)
            setAttr(els.ankle, 'r', 0.55)
            setAttr(els.foot, 'cx', footXS)
            setAttr(els.foot, 'cy', footYS)
            setAttr(els.foot, 'r', fmt(0.92 - lift * 0.25 + pulse * 0.35))
            setAttr(els.foot, 'opacity', fmt(1 - lift * 0.3))
            setAttr(els.footShadow, 'cx', fmt(footX + 1.4 + lift * 2.6))
            setAttr(els.footShadow, 'cy', fmt(footY + 2.2 + lift * 3.4))
            setAttr(els.footShadow, 'r', fmt(1.4 + lift * 0.5))
            setAttr(els.footShadow, 'opacity', fmt(0.18 - lift * 0.1))
            const sclaw = 2.2
            setAttr(
              els.claw,
              'd',
              `M${footXS} ${fmt(footY - sclaw)}L${fmt(footX + sclaw)} ${footYS}L${footXS} ${fmt(footY + sclaw)}L${fmt(footX - sclaw)} ${footYS}Z`,
            )
            setAttr(els.claw, 'opacity', fmt(0.82 - lift * 0.4))
          }
        }

        /**
         * 远距传输 = 一次网络请求：
         *   out      编码：锁定框收紧，腿按组折回，身体量化缩小并拆成数据块；
         *   transfer 传输：数据块排成一列沿八向链路跳过去，路由逐段点亮；
         *   in       解码：数据块在终点汇合，身体逐级重建，两组腿先后展开，回 200 OK。
         */
        const updateWarp = (now) => {
          const w = sim.warp
          if (!w) return
          const at = (value, from, span) => clamp((value - from) / span, 0, 1)
          const glitch = () => (Math.random() - 0.5) * 2.4

          if (w.stage === 'out') {
            const p = clamp((now - w.t0) / WARP_OUT_MS, 0, 1)
            sim.warpLegPull = [ease(at(p, 0, 0.42)), ease(at(p, 0.08, 0.42))]
            const dissolve = at(p, 0.5, 0.5)
            sim.warpScale =
              p < 0.5 ? 1 + Math.sin((Math.PI * p) / 0.5) * 0.1 : Math.ceil((1 - dissolve) * 4) / 4
            sim.warpVisible = sim.warpScale > 0.01 ? 1 : 0
            sim.warpGlitch = p > 0.4 ? glitch() : 0
            const burst = ease(at(p, 0.55, 0.45))
            sim.warpState = {
              a: { opacity: Math.min(1, p * 4), frame: 40 - ease(at(p, 0, 0.6)) * 20, label: p > 0.15 ? `TX ${w.tag}` : '' },
              b: { opacity: 0, frame: 40, label: '' },
              route: Math.min(0.55, at(p, 0.3, 0.7) * 0.55),
              lit: 0,
              packets: w.src.map((offset, index) => ({
                x: w.from.x + offset.x * burst,
                y: w.from.y + offset.y * burst,
                o: at(p, 0.55 + index * 0.02, 0.1),
              })),
              lead: 0,
            }
            if (p >= 1) {
              w.stage = 'transfer'
              w.t0 = now
              sim.x = w.to.x
              sim.y = w.to.y
              sim.rx = w.to.x
              sim.ry = w.to.y
              sim.vx = 0
              sim.vy = 0
              plantPing(w.from, 1.6)
              resetLegsForMotion(sim, MOTION_CYBER, now)
              sim.warpLegPull = [1, 1]
            }
            return
          }

          if (w.stage === 'transfer') {
            const p = clamp((now - w.t0) / w.transmitMs, 0, 1)
            const stagger = 0.035
            const span = 1 - stagger * (PACKET_COUNT - 1)
            let lead = 0
            const packets = w.src.map((src, index) => {
              const s = minimumJerk(at(p, index * stagger, span))
              lead = Math.max(lead, s)
              const along = pointAlong(w.path, s * w.length)
              const spread = 1 - Math.sin(Math.PI * s)
              const offset = s < 0.5 ? src : w.dst[index]
              return { x: along.x + offset.x * spread, y: along.y + offset.y * spread, o: 1 }
            })
            sim.warpScale = 0
            sim.warpVisible = 0
            sim.warpGlitch = 0
            sim.warpState = {
              a: { opacity: 1 - p, frame: 20 + p * 12, label: `TX ${w.tag}` },
              b: { opacity: Math.min(1, p * 3), frame: 40 - ease(p) * 20, label: p > 0.3 ? 'RX …' : '' },
              route: 0.55,
              lit: lead,
              packets,
              lead,
            }
            if (p >= 1) {
              w.stage = 'in'
              w.t0 = now
            }
            return
          }

          const p = clamp((now - w.t0) / WARP_IN_MS, 0, 1)
          const gather = ease(at(p, 0, 0.4))
          const build = at(p, 0.15, 0.35)
          sim.warpScale = Math.ceil(build * 4) / 4
          sim.warpVisible = sim.warpScale > 0.01 ? 1 : 0
          sim.warpGlitch = p < 0.5 && build > 0 ? glitch() : 0
          sim.warpLegPull = [1 - ease(at(p, 0.32, 0.32)), 1 - ease(at(p, 0.46, 0.32))]
          for (let group = 0; group < 2; group += 1) {
            if (w.landed[group] || sim.warpLegPull[group] > 0.02) continue
            w.landed[group] = true
            for (const leg of sim.legs) {
              if (leg.def.group !== group) continue
              leg.cyber.pulseAt = now
              plantGrip(leg.foot)
            }
          }
          const fade = 1 - at(p, 0.7, 0.3)
          sim.warpState = {
            a: { opacity: 0, frame: 24, label: '' },
            b: {
              opacity: fade,
              frame: 20 + ease(at(p, 0.6, 0.4)) * 16,
              label: p > 0.5 ? `200 OK ${w.tag}` : 'RX …',
            },
            route: 0.55 * fade,
            lit: fade,
            packets: w.dst.map((offset, index) => ({
              x: w.to.x + offset.x * (1 - gather),
              y: w.to.y + offset.y * (1 - gather),
              o: 1 - at(p, 0.2 + index * 0.012, 0.22),
            })),
            lead: 1,
          }
          if (p >= 1) {
            const item = w.item
            abortWarp(sim)
            plantPing(w.to, 1.4)
            sim.mode = 'perch'
            sim.startle = 0.5
            if (item) {
              if (panelOpenRef.current) queueRef.current.unshift(item)
              else if (apiRef.current) apiRef.current.showItem(item)
            } else {
              sim.mode = 'idle'
              sim.nextWanderAt = now + 1200
              /* 巡游传输途中到达的提醒在 pump 里被挡住了，落地后补发。 */
              if (queueRef.current.length > 0 && apiRef.current) apiRef.current.pump()
            }
          }
        }

        /** CYBER：沿八向路由走，拐点原地转身 + 节点扫描，步态由位移驱动。 */
        const stepCyber = (now, dt) => {
          const width = window.innerWidth || 1200
          const height = window.innerHeight || 800
          const reduced = reducedRef.current
          const prevAngle = sim.angle
          const travelling = !reduced && (sim.mode === 'walk' || sim.mode === 'run')

          if (travelling) {
            const run = sim.mode === 'run'
            if (
              !sim.routeFor ||
              Math.hypot(sim.routeFor.x - sim.target.x, sim.routeFor.y - sim.target.y) > 1
            ) {
              /*
               * 远距离不爬：回 dock / 去提醒点一律走数据包传输；巡游的长跳一半概率传输，
               * 一半沿路由快爬，两种移动方式都能经常看到。
               */
              const far = Math.hypot(sim.target.x - sim.x, sim.target.y - sim.y) > WORMHOLE_DISTANCE
              const wandering = sim.wandering
              sim.wandering = false
              if (far && (!wandering || Math.random() < 0.5)) {
                const item = sim.pending
                beginWarp(sim, sim.target, item, now)
                return
              }
              sim.route = planRoute({ x: sim.x, y: sim.y }, sim.target)
              sim.routeIndex = 0
              sim.routeFor = { x: sim.target.x, y: sim.target.y }
            }
            const final = sim.routeIndex >= sim.route.length - 1
            const waypoint = sim.route[Math.min(sim.routeIndex, sim.route.length - 1)] || sim.target
            const dx = waypoint.x - sim.x
            const dy = waypoint.y - sim.y
            const dist = Math.hypot(dx, dy)
            if (dist <= Math.max(3, Math.hypot(sim.vx, sim.vy) * dt * 1.1)) {
              sim.x = waypoint.x
              sim.y = waypoint.y
              if (final) {
                sim.vx = 0
                sim.vy = 0
                sim.route = []
                sim.routeFor = null
                plantPing(waypoint, 1.2)
                const item = sim.pending
                sim.pending = null
                if (item) {
                  sim.mode = 'perch'
                  if (apiRef.current) apiRef.current.showItem(item)
                } else {
                  sim.mode = 'idle'
                  sim.nextWanderAt = now + 1600 + Math.random() * 2600
                }
              } else {
                sim.routeIndex += 1
                sim.nodeHoldUntil = now + (run ? 0 : 40 + Math.random() * 60)
                plantPing(waypoint, run ? 0.8 : 1)
              }
            } else {
              const heading = Math.atan2(dy, dx)
              const error = normalizeAngle(heading - sim.angle)
              const turn = run ? 16 : 12
              sim.angle += clamp(error, -turn * dt, turn * dt)
              sim.targetAngle = sim.angle
              /* 边转边走：大角度时降速但不完全停下，拐角是切出来的。 */
              const align = clamp(1 - (Math.abs(error) - 0.3) / 0.9, 0.2, 1)
              const maxSpeed = run ? CYBER_RUN_SPEED : CYBER_WALK_SPEED
              const brake = final ? dist : dist + (run ? 90 : 30)
              let desired = Math.min(maxSpeed, Math.sqrt(2 * (run ? 1700 : 800) * brake))
              if (now < sim.nodeHoldUntil) desired = 0
              /* 两组腿各蹬一次：一个步态周期内速度起伏两次。 */
              /* 每次前腿抓住、后腿收回，身体被拽一下：一个周期两次明显的拉动。 */
              desired *= align * (1 + 0.3 * Math.sin(sim.cyberCycle * Math.PI * 4))
              const k = Math.min(1, dt * (run ? 12 : 9))
              sim.vx += ((dx / dist) * desired - sim.vx) * k
              sim.vy += ((dy / dist) * desired - sim.vy) * k
              sim.x += sim.vx * dt
              sim.y += sim.vy * dt
            }
            sim.x = clamp(sim.x, 64, width - 64)
            sim.y = clamp(sim.y, 78, Math.max(78, height - 62))
          } else {
            sim.vx *= Math.exp(-dt * 12)
            sim.vy *= Math.exp(-dt * 12)
            if (
              sim.mode === 'idle' &&
              !reduced &&
              !sim.pending &&
              !bubbleRef.current &&
              !panelOpenRef.current &&
              now > sim.nextWanderAt
            ) {
              sim.target = randomPoint(width, height)
              sim.routeFor = null
              sim.wandering = true
              sim.mode = 'walk'
              sim.nextWanderAt = Number.POSITIVE_INFINITY
            }
            if (!reduced) {
              if (now > sim.nextScanAt) {
                sim.targetAngle = sim.angle + (Math.random() < 0.5 ? -1 : 1) * (0.3 + Math.random() * 0.5)
                sim.nextScanAt = now + 3200 + Math.random() * 4200
              }
              sim.angle += clamp(normalizeAngle(sim.targetAngle - sim.angle), -3 * dt, 3 * dt)
            }
          }

          const speed = Math.hypot(sim.vx, sim.vy)
          const omega = dt > 0 ? normalizeAngle(sim.angle - prevAngle) / dt : 0
          sim.omega += (omega - sim.omega) * Math.min(1, dt * 12)
          sim.abdomenLag = clamp(-sim.omega * 0.1, -0.24, 0.24)
          sim.startle = Math.max(0, sim.startle - dt * 3.2)

          const effSpeed = speed + Math.abs(sim.omega) * 34
          const cycleDist = 54 + Math.min(130, effSpeed * 0.3)
          if (effSpeed > 6) sim.cyberCycle += (effSpeed * dt) / cycleDist
          sim.cyberMove += ((effSpeed > 6 ? 1 : 0) - sim.cyberMove) * Math.min(1, dt * 6)

          const phase = sim.cyberCycle * Math.PI * 2
          sim.sway =
            Math.sin(phase) * 1.1 * sim.cyberMove + Math.sin(now * 0.0011) * 0.25 * (1 - sim.cyberMove)
          sim.surge = Math.sin(phase * 2) * 1.1 * sim.cyberMove
          const ux = Math.cos(sim.angle)
          const uy = Math.sin(sim.angle)
          sim.rx = sim.x - uy * sim.sway + ux * sim.surge
          sim.ry = sim.y + ux * sim.sway + uy * sim.surge

          sim.routeAlpha += ((travelling && sim.route.length ? 1 : 0) - sim.routeAlpha) * Math.min(1, dt * 5)
          if (travelling && sim.route.length) {
            sim.routeDraw = [{ x: sim.x, y: sim.y }, ...sim.route.slice(sim.routeIndex)]
          }

          /* 拖链：从纺器拉出的一串链接点，停下后慢慢收回。 */
          const tail = { x: sim.x - ux * 10, y: sim.y - uy * 10 }
          const last = sim.trail[sim.trail.length - 1]
          if (speed > 4) {
            if (!last || Math.hypot(tail.x - last.x, tail.y - last.y) > 3) {
              sim.trail.push(tail)
              if (sim.trail.length > TRAIL_POINTS) sim.trail.shift()
            }
            sim.trailAt = now
          } else if (sim.trail.length > 0 && now - sim.trailAt > 45) {
            sim.trail.shift()
            sim.trailAt = now
          }

          updateCyberLegs(now, effSpeed, cycleDist)
        }

        const renderNet = (now) => {
          const cyber = motionRef.current === MOTION_CYBER
          const warp = sim.warpState
          const route = routeRef.current
          const lit = routeLitRef.current
          const nodes = routeNodeEls.current
          let points = null
          let routeOpacity = 0
          if (warp && sim.warp) {
            points = sim.warp.path
            routeOpacity = warp.route
          } else if (cyber && sim.routeAlpha > 0.02 && sim.routeDraw.length > 1) {
            points = sim.routeDraw
            routeOpacity = sim.routeAlpha * 0.32
          }
          if (route) {
            if (points) setAttr(route, 'd', pathData(points))
            setAttr(route, 'opacity', routeOpacity.toFixed(2))
          }
          if (lit) {
            if (warp && sim.warp) {
              setAttr(lit, 'd', pathData(sim.warp.path))
              setAttr(lit, 'stroke-dasharray', `${warp.lit.toFixed(3)} 1`)
              setAttr(lit, 'opacity', Math.min(1, warp.route * 1.8).toFixed(2))
            } else {
              setAttr(lit, 'opacity', 0)
            }
          }
          let travelled = 0
          const leadDist = warp && sim.warp ? warp.lead * sim.warp.length : 0
          for (let index = 0; index < ROUTE_NODES; index += 1) {
            const node = nodes[index]
            if (!node) continue
            const point = points && points[index + 1]
            if (!point || routeOpacity <= 0.01) {
              node.setAttribute('opacity', '0')
              continue
            }
            const prev = points[index]
            travelled += Math.hypot(point.x - prev.x, point.y - prev.y)
            let opacity = Math.min(1, routeOpacity * 2.4)
            let scale = 1
            if (warp && sim.warp) {
              const gap = (leadDist - travelled) / 24
              const flash = leadDist >= travelled - 4 ? Math.exp(-gap * gap) : 0
              opacity = Math.min(1, routeOpacity * 1.4 + flash)
              scale = 1 + flash * 0.8
            }
            node.setAttribute(
              'transform',
              `translate(${point.x.toFixed(2)} ${point.y.toFixed(2)}) scale(${scale.toFixed(2)})`,
            )
            node.setAttribute('opacity', opacity.toFixed(2))
          }

          for (let index = 0; index < PACKET_COUNT; index += 1) {
            const element = packetEls.current[index]
            if (!element) continue
            const packet = warp && warp.packets ? warp.packets[index] : null
            if (!packet || packet.o <= 0.01) {
              element.setAttribute('opacity', '0')
              continue
            }
            element.setAttribute('transform', `translate(${packet.x.toFixed(2)} ${packet.y.toFixed(2)})`)
            element.setAttribute('opacity', packet.o.toFixed(2))
          }

          const endpoints = endpointEls.current
          const ends = warp && sim.warp ? [[warp.a, sim.warp.from], [warp.b, sim.warp.to]] : null
          for (let index = 0; index < 2; index += 1) {
            const slot = endpoints[index]
            if (!slot || !slot.group) continue
            const end = ends && ends[index]
            if (!end || end[0].opacity <= 0.01) {
              slot.group.setAttribute('opacity', '0')
              continue
            }
            const [state, point] = end
            slot.group.setAttribute('transform', `translate(${point.x.toFixed(2)} ${point.y.toFixed(2)})`)
            slot.group.setAttribute('opacity', state.opacity.toFixed(2))
            if (slot.frame) slot.frame.setAttribute('transform', `scale(${state.frame.toFixed(2)})`)
            if (slot.label && slot.label.textContent !== state.label) slot.label.textContent = state.label
          }

          for (let index = 0; index < PING_SLOTS; index += 1) {
            const slot = sim.pings[index]
            const element = pingEls.current[index]
            if (!element) continue
            const age = (now - slot.at) / 720
            if (age < 0 || age >= 1) {
              element.setAttribute('opacity', '0')
              continue
            }
            const scale = slot.size * (1 + ease(age) * 3.2)
            element.setAttribute(
              'transform',
              `translate(${slot.x.toFixed(2)} ${slot.y.toFixed(2)}) rotate(45) scale(${scale.toFixed(2)})`,
            )
            element.setAttribute('opacity', ((1 - age) * 0.85).toFixed(2))
          }

          const trail = sim.trail
          const thirds = Math.ceil(trail.length / 3)
          for (let index = 0; index < 3; index += 1) {
            const element = trailEls.current[index]
            if (!element) continue
            const slice = trail.slice(Math.max(0, index * thirds - 1), (index + 1) * thirds)
            if (!cyber || slice.length < 2) {
              element.setAttribute('opacity', '0')
              continue
            }
            element.setAttribute('d', pathData(slice))
            element.setAttribute('opacity', [0.14, 0.3, 0.55][index].toFixed(2))
          }
        }

        const stepSim = (now, dt) => {
          const width = window.innerWidth || 1200
          const height = window.innerHeight || 800
          const reduced = reducedRef.current
          if (sim.warp) {
            updateWarp(now)
            return
          }
          if (motionRef.current === MOTION_CYBER) {
            stepCyber(now, dt)
            return
          }
          const prevAngle = sim.angle
          let speed = Math.hypot(sim.vx, sim.vy)

          if (!reduced && (sim.mode === 'walk' || sim.mode === 'run')) {
            const dx = sim.target.x - sim.x
            const dy = sim.target.y - sim.y
            const dist = Math.hypot(dx, dy)
            const maxSpeed = sim.mode === 'run' ? RUN_SPEED : WALK_SPEED
            if (dist <= 4) {
              sim.x = sim.target.x
              sim.y = sim.target.y
              sim.vx = 0
              sim.vy = 0
              const item = sim.pending
              sim.pending = null
              if (item) {
                sim.mode = 'perch'
                if (apiRef.current) apiRef.current.showItem(item)
              } else {
                sim.mode = 'idle'
                sim.nextWanderAt = now + 4500 + Math.random() * 5500
              }
            } else {
              const ux = dx / dist
              const uy = dy / dist
              if (sim.mode === 'walk' && now > sim.nextBurstAt) {
                sim.pauseUntil = now + 260 + Math.random() * 420
                sim.nextBurstAt = now + 2400 + Math.random() * 3200
              }
              let desired = Math.min(maxSpeed, Math.sqrt(2 * ACCEL * dist))
              if (sim.mode === 'walk' && now < sim.pauseUntil) {
                desired = 0
              }
              const k = Math.min(1, dt * (sim.mode === 'run' ? 9 : 6))
              sim.vx += (ux * desired - sim.vx) * k
              sim.vy += (uy * desired - sim.vy) * k
              sim.x += sim.vx * dt
              sim.y += sim.vy * dt
              const turn = sim.mode === 'run' ? 8 : 3.2
              const want = Math.atan2(sim.vy, sim.vx)
              sim.angle += clamp(normalizeAngle(want - sim.angle), -turn * dt, turn * dt)
              sim.targetAngle = sim.angle
            }
            const marginX = 64
            const marginTop = 78
            const marginBottom = 62
            sim.x = clamp(sim.x, marginX, width - marginX)
            sim.y = clamp(sim.y, marginTop, Math.max(marginTop, height - marginBottom))
          } else {
            sim.vx *= Math.exp(-dt * 9)
            sim.vy *= Math.exp(-dt * 9)

            if (
              sim.mode === 'idle' &&
              !reduced &&
              !sim.pending &&
              !bubbleRef.current &&
              !panelOpenRef.current &&
              now > sim.nextWanderAt
            ) {
              sim.target = randomPoint(width, height)
              sim.mode = 'walk'
              sim.nextWanderAt = Number.POSITIVE_INFINITY
              sim.nextBurstAt = now + 1600 + Math.random() * 2200
            }

            if (!reduced) {
              if (now > sim.nextScanAt) {
                sim.targetAngle = sim.angle + (Math.random() - 0.5) * 0.9
                sim.nextScanAt = now + 3000 + Math.random() * 4200
              }
              sim.angle += clamp(normalizeAngle(sim.targetAngle - sim.angle), -1.1 * dt, 1.1 * dt)
            }
          }

          speed = Math.hypot(sim.vx, sim.vy)
          const walking = speed > 4 && speed < 160
          const stride = 21 + Math.min(18, speed * 0.06)
          const phaseAdvance = walking ? (speed * dt) / stride : 0
          if (walking) sim.gaitPhase = (sim.gaitPhase + phaseAdvance) % 1

          const deltaAngle = normalizeAngle(sim.angle - prevAngle)
          const omega = dt > 0 ? deltaAngle / dt : 0
          sim.omega += (omega - sim.omega) * Math.min(1, dt * 10)
          sim.abdomenLag = clamp(-sim.omega * 0.09, -0.18, 0.18)
          sim.startle = Math.max(0, sim.startle - dt * 3.2)

          const swayAmp = speed > 20 ? 0.8 : 0.55
          sim.sway = Math.sin(now * 0.0032) * swayAmp
          sim.surge = walking ? Math.sin(sim.gaitPhase * Math.PI * 2) * 0.9 : 0
          const ux = Math.cos(sim.angle)
          const uy = Math.sin(sim.angle)
          const px = -uy
          const py = ux
          sim.rx = sim.x + px * sim.sway + ux * sim.surge
          sim.ry = sim.y + py * sim.sway + uy * sim.surge

          let swinging = 0
          const groupSwing = [0, 0]
          for (const leg of sim.legs) {
            if (leg.stepping) {
              swinging += 1
              groupSwing[leg.def.group] += 1
            }
          }
          const maxSwing = speed > 160 ? 6 : 4
          const maxGroup = speed > 160 ? 3 : 3

          for (const leg of sim.legs) {
            if (leg.stepping) {
              const p = (now - leg.t0) / leg.dur
              if (p >= 1) {
                leg.stepping = false
                leg.foot = { x: leg.to.x, y: leg.to.y }
                leg.lift = 0
                plantGrip(leg.foot)
                swinging = Math.max(0, swinging - 1)
                groupSwing[leg.def.group] = Math.max(0, groupSwing[leg.def.group] - 1)
                leg.nextAt = now + 40
              } else {
                leg.lift = Math.sin(Math.PI * p)
              }
              continue
            }

            const home = legPoint(sim, leg, [leg.def.home[0], leg.def.home[1]])
            const hip = legPoint(sim, leg, [leg.def.hip[0], leg.def.hip[1]])
            const lag = Math.hypot(home.x - leg.foot.x, home.y - leg.foot.y)
            const footDistance = Math.hypot(leg.foot.x - hip.x, leg.foot.y - hip.y)
            const emergency = footDistance > leg.def.reach * 0.96
            const phaseDelta = (sim.gaitPhase - leg.def.phaseOffset + 1) % 1
            const phaseHit =
              walking && phaseDelta < Math.max(0.035, phaseAdvance * 1.15 + 0.006)
            const wants = walking
              ? (phaseHit && lag > 4) || emergency || lag > 32
              : lag > 28 || emergency

            if (wants && now >= leg.nextAt) {
              if (emergency || (swinging < maxSwing && groupSwing[leg.def.group] < maxGroup)) {
                startStep(leg, now, speed, false)
                swinging += 1
                groupSwing[leg.def.group] += 1
              }
            } else if (
              !reduced &&
              sim.mode === 'idle' &&
              !bubbleRef.current &&
              now > leg.itchAt
            ) {
              if (swinging === 0) {
                startStep(leg, now, 0, true)
                swinging += 1
                groupSwing[leg.def.group] += 1
              }
              leg.itchAt =
                now +
                (leg.def.front ? 1400 + Math.random() * 2200 : 3200 + Math.random() * 4200)
            }
          }
        }

        const renderSim = (now) => {
          if (!simRef.current || !mountedRef.current) return
          const deg = (sim.angle * 180) / Math.PI
          const bodyScale = BODY_SCALE * (1 + sim.startle * 0.08) * (sim.warpScale ?? 1)
          const visible = sim.warpVisible !== 0
          const gx = sim.rx + (sim.warpGlitch || 0)
          const gy = sim.ry
          setAttr(bodyRef.current, 'opacity', visible ? 1 : 0)
          setAttr(legsLayerRef.current, 'opacity', visible ? 1 : 0)
          if (bodyShadowRef.current) bodyShadowRef.current.style.opacity = visible ? '' : '0'
          if (bodyGlowRef.current) bodyGlowRef.current.style.opacity = visible ? '' : '0'
          setAttr(
            bodyRef.current,
            'transform',
            `translate(${gx.toFixed(2)} ${gy.toFixed(2)}) rotate(${deg.toFixed(2)}) scale(${bodyScale.toFixed(4)})`,
          )
          setAttr(
            bodyShadowRef.current,
            'transform',
            `translate(${(sim.rx + 2).toFixed(2)} ${(sim.ry + 3).toFixed(2)}) rotate(${deg.toFixed(2)}) scale(${bodyScale.toFixed(4)})`,
          )
          setAttr(
            bodyGlowRef.current,
            'transform',
            `translate(${sim.rx.toFixed(2)} ${sim.ry.toFixed(2)}) rotate(${deg.toFixed(2)}) scale(${bodyScale.toFixed(4)})`,
          )
          setAttr(abdomenRef.current, 'transform', `rotate(${((sim.abdomenLag * 180) / Math.PI).toFixed(2)})`)

          if (motionRef.current === MOTION_CYBER) {
            renderCyberLegs(now)
          } else {
            for (const leg of sim.legs) {
              const els = legEls.current[leg.def.index]
              if (!els || !els.femur) continue
              if (els.tibia.style && els.tibia.style.strokeWidth) {
                els.tibia.style.strokeWidth = ''
                els.tarsus.style.strokeWidth = ''
              }
              const hip = legPoint(sim, leg, [leg.def.hip[0], leg.def.hip[1]])
              let foot = leg.foot
            let lift = 0
            if (leg.stepping) {
              const p = clamp((now - leg.t0) / leg.dur, 0, 1)
              const e = ease(p)
              const baseX = lerp(leg.from.x, leg.to.x, e)
              const baseY = lerp(leg.from.y, leg.to.y, e)
              const dx = leg.to.x - leg.from.x
              const dy = leg.to.y - leg.from.y
              const len = Math.max(0.001, Math.hypot(dx, dy))
              const px = -dy / len
              const py = dx / len
              const arc = Math.sin(Math.PI * p) * leg.arc
              foot = { x: baseX + px * arc, y: baseY + py * arc }
              lift = Math.sin(Math.PI * p)
            }

            let dx = foot.x - hip.x
            let dy = foot.y - hip.y
            const d = Math.hypot(dx, dy)
            const reach = leg.def.reach
            if (d > reach) {
              const k = reach / d
              foot = { x: hip.x + dx * k, y: hip.y + dy * k }
              dx = foot.x - hip.x
              dy = foot.y - hip.y
            }

            const knee = kneePoint(hip, foot, leg, sim.angle)
            const ankle = anklePoint(knee, foot, leg, sim.angle)
            const hipX = hip.x.toFixed(2)
            const hipY = hip.y.toFixed(2)
            const kneeX = knee.x.toFixed(2)
            const kneeY = knee.y.toFixed(2)
            const ankleX = ankle.x.toFixed(2)
            const ankleY = ankle.y.toFixed(2)
            const footX = foot.x.toFixed(2)
            const footY = foot.y.toFixed(2)

            setAttr(els.under, 'd', `M${hipX} ${hipY}L${kneeX} ${kneeY}L${ankleX} ${ankleY}L${footX} ${footY}`)
            setAttr(els.femur, 'd', `M${hipX} ${hipY}L${kneeX} ${kneeY}`)
            setAttr(els.tibia, 'd', `M${kneeX} ${kneeY}L${ankleX} ${ankleY}`)
            setAttr(els.tarsus, 'd', `M${ankleX} ${ankleY}L${footX} ${footY}`)
            setAttr(
              els.trace,
              'd',
              `M${hipX} ${hipY}L${kneeX} ${kneeY}L${ankleX} ${ankleY}L${footX} ${footY}`,
            )
            setAttr(els.hip, 'cx', hipX)
            setAttr(els.hip, 'cy', hipY)
            setAttr(els.hip, 'r', 1.1)
            setAttr(els.knee, 'cx', kneeX)
            setAttr(els.knee, 'cy', kneeY)
            setAttr(els.knee, 'r', 0.85)
            setAttr(els.ankle, 'cx', ankleX)
            setAttr(els.ankle, 'cy', ankleY)
            setAttr(els.ankle, 'r', 0.45)

            setAttr(els.footShadow, 'cx', (foot.x + 1.4).toFixed(2))
            setAttr(els.footShadow, 'cy', (foot.y + 2.2).toFixed(2))
            setAttr(els.footShadow, 'r', 1.2)
            setAttr(els.footShadow, 'opacity', (0.18 - lift * 0.1).toFixed(2))
            setAttr(els.foot, 'cx', footX)
            setAttr(els.foot, 'cy', footY)
            setAttr(els.foot, 'r', (0.7 - lift * 0.2).toFixed(2))
            setAttr(els.foot, 'opacity', (1 - lift * 0.3).toFixed(2))

            const cdx = foot.x - ankle.x
            const cdy = foot.y - ankle.y
            const clen = Math.max(0.001, Math.hypot(cdx, cdy))
            const ux = cdx / clen
            const uy = cdy / clen
            const px = -uy
            const py = ux
            const c1x = (foot.x + ux * 1.8 + px * 0.62).toFixed(2)
            const c1y = (foot.y + uy * 1.8 + py * 0.62).toFixed(2)
            const c2x = (foot.x + ux * 1.8 - px * 0.62).toFixed(2)
            const c2y = (foot.y + uy * 1.8 - py * 0.62).toFixed(2)
            setAttr(els.claw, 'd', `M${c1x} ${c1y}L${footX} ${footY}L${c2x} ${c2y}`)
            setAttr(els.claw, 'opacity', (0.88 - lift * 0.5).toFixed(2))
            setAttr(els.trace, 'opacity', (0.26 + lift * 0.55).toFixed(2))
            }
          }

          renderNet(now)

          for (let index = 0; index < GRIP_SLOTS; index += 1) {
            const slot = sim.grips[index]
            const els = gripEls.current[index]
            if (!els || !els.group) continue
            const age = (now - slot.at) / 900
            if (age >= 0 && age < 1) {
              els.group.setAttribute('transform', `translate(${slot.x.toFixed(2)} ${slot.y.toFixed(2)})`)
              els.group.setAttribute('opacity', ((1 - age) * 0.8).toFixed(2))
              if (els.ring) els.ring.setAttribute('r', (1.2 + age * 6).toFixed(2))
            } else {
              els.group.setAttribute('opacity', '0')
            }
          }

          if (anchorRef.current) {
            anchorRef.current.style.transform = `translate3d(${sim.rx.toFixed(2)}px, ${sim.ry.toFixed(2)}px, 0)`
            anchorRef.current.dataset.chipPos = sim.ry < 150 ? 'below' : 'above'
            anchorRef.current.dataset.chipSide =
              sim.rx > (window.innerWidth || 1200) - 300 ? 'left' : 'right'
          }
        }

        const loop = (now) => {
          const dt = clamp((now - last) / 1000, 0.001, 0.05)
          last = now
          stepSim(now, dt)
          renderSim(now)
          raf = window.requestAnimationFrame(loop)
        }

        renderSim(now0)
        setReady(true)
        raf = window.requestAnimationFrame(loop)

        const onResize = () => {
          const width = window.innerWidth || 1200
          const height = window.innerHeight || 800
          sim.x = clamp(sim.x, 64, width - 64)
          sim.y = clamp(sim.y, 78, Math.max(78, height - 62))
          sim.rx = sim.x
          sim.ry = sim.y
          if (bubbleRef.current) setPlacement(placePop(sim.rx, sim.ry, false))
          else if (panelOpenRef.current) setPlacement(placePop(sim.rx, sim.ry, true))
        }
        window.addEventListener('resize', onResize)

        return () => {
          window.cancelAnimationFrame(raf)
          window.removeEventListener('resize', onResize)
          simRef.current = null
        }
      }, [setPlacement])

      /* 快照 → 事件 → 队列。首次快照只建立基线。 */
      React.useEffect(() => {
        if (!snapshot) return
        const serverNow =
          typeof snapshot.now === 'number' && Number.isFinite(snapshot.now)
            ? snapshot.now
            : Date.now()
        if (!baselineRef.current) {
          baselineRef.current = true
          startedAtRef.current = serverNow
          for (const event of snapshot.events) {
            if (event && typeof event.id === 'string') seenRef.current.add(event.id)
          }
          if (snapshot.idea) {
            setLatestIdea((previous) =>
              previous && previous.id === snapshot.idea.id ? previous : snapshot.idea,
            )
          }
          return
        }
        if (snapshot.idea) {
          setLatestIdea((previous) =>
            previous && previous.id === snapshot.idea.id ? previous : snapshot.idea,
          )
        }
        for (const event of snapshot.events) {
          if (!event || typeof event.id !== 'string' || seenRef.current.has(event.id)) continue
          seenRef.current.add(event.id)
          if (typeof event.at !== 'number' || event.at < startedAtRef.current - 5000) continue
          if (apiRef.current) apiRef.current.ingest(event)
        }
      }, [snapshot])

      const changeMotion = (style) => {
        if (style !== MOTION_ORGANIC && style !== MOTION_CYBER) return
        if (motionRef.current === style) return
        motionRef.current = style
        setMotion(style)
        writeMotionStyle(style)
        const sim = simRef.current
        if (sim) {
          if (sim.warp) {
            const pendingItem = abortWarp(sim)
            if (pendingItem) queueRef.current.unshift(pendingItem)
          }
          sim.mode = 'idle'
          sim.vx = 0
          sim.vy = 0
          sim.startle = 1
          sim.nextWanderAt = Number.POSITIVE_INFINITY
          resetLegsForMotion(sim, style, performance.now())
        }
      }

      const togglePanel = () => {
        const sim = simRef.current
        if (panelOpenRef.current) {
          panelOpenRef.current = false
          setPanelOpen(false)
          if (sim) {
            sim.target = dockPoint()
            sim.mode = 'walk'
            sim.nextWanderAt = Number.POSITIVE_INFINITY
          }
          window.setTimeout(() => {
            if (apiRef.current) apiRef.current.pump()
          }, 220)
          return
        }
        if (sim) {
          if (sim.warp) {
            const pendingItem = abortWarp(sim)
            if (pendingItem) queueRef.current.unshift(pendingItem)
          }
          if (sim.pending) {
            queueRef.current.unshift({ ...sim.pending, priority: 2 })
            sim.pending = null
          }
          sim.mode = 'perch'
          sim.vx = 0
          sim.vy = 0
        }
        if (bubbleRef.current && apiRef.current) apiRef.current.closeBubble()
        panelOpenRef.current = true
        setPanelOpen(true)
        const x = sim ? sim.rx : window.innerWidth / 2
        const y = sim ? sim.ry : window.innerHeight / 2
        setPlacement(placePop(x, y, true))
      }

      React.useEffect(() => {
        if (!panelOpen) return undefined
        const onKey = (event) => {
          if (event.key === 'Escape') togglePanel()
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
      }, [panelOpen])

      const requestIdea = async (sessionId, skill, mode) => {
        if (generating) return
        setGenerating(true)
        setIdeaError(false)
        try {
          const timeout =
            typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
              ? AbortSignal.timeout(90_000)
              : undefined
          const payload = {}
          if (typeof sessionId === 'string' && sessionId) payload.sessionId = sessionId
          if (typeof skill === 'string' && skill && skill !== 'auto') payload.skill = skill
          if (typeof mode === 'string' && mode) payload.mode = mode
          const response = await fetch(`${window.location.origin}${IDEA_URL}`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(payload),
            signal: timeout,
          })
          const data = await response.json().catch(() => null)
          if (data && data.ok && data.idea) {
            const idea = data.idea
            setLatestIdea(idea)
            const alreadySeen = seenIdeaRef.current.has(idea.id)
            seenIdeaRef.current.add(idea.id)
            if (!alreadySeen) {
              const item = ideaToItem(idea, 'manual')
              if (item) {
                item.priority = 3
                if (bubbleRef.current && bubbleRef.current.kind === 'idea') {
                  clearTimeout(hideTimerRef.current)
                  bubbleRef.current = null
                  setBubble(null)
                }
                /* 从面板手动生成时先收起面板，让新形态的卡片真正露出来。 */
                if (panelOpenRef.current) {
                  panelOpenRef.current = false
                  setPanelOpen(false)
                }
                if (apiRef.current) apiRef.current.enqueue(item)
              }
            }
          } else {
            setIdeaError(true)
          }
        } catch {
          setIdeaError(true)
        } finally {
          setGenerating(false)
        }
      }

      const openSession = (sessionId) => {
        if (!sessionId) return
        const element = rowAnchors.get(sessionId)
        if (element && typeof element.click === 'function') {
          /* 锚点在自己的会话行里；点击会正常冒泡到会话行自己的打开逻辑。 */
          element.click()
        }
      }

      const copyIdea = async (idea) => {
        if (!idea) return
        const text = ideaCopyText(idea)
        if (!text) return
        try {
          if (!navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') {
            throw new Error('clipboard unavailable')
          }
          await navigator.clipboard.writeText(text)
          setCopyDone(true)
          window.setTimeout(() => setCopyDone(false), 1600)
        } catch {
          setIdeaError(true)
        }
      }

      const dismissIdea = (ideaId) => {
        if (!ideaId) return
        setDismissedIds((previous) => {
          if (previous.has(ideaId)) return previous
          const next = new Set(previous)
          next.add(ideaId)
          writeDismissedIdeaIds([...next])
          return next
        })
        if (latestIdea && latestIdea.id === ideaId) setLatestIdea(null)
        if (bubbleRef.current && bubbleRef.current.ideaId === ideaId) closeBubble()
      }

      const focusIdea = (idea) => {
        const item = ideaToItem(idea, 'inbox')
        if (!item) return
        setLatestIdea(idea)
        panelOpenRef.current = false
        setPanelOpen(false)
        if (bubbleRef.current) {
          clearTimeout(hideTimerRef.current)
          bubbleRef.current = null
          setBubble(null)
        }
        if (apiRef.current) apiRef.current.dispatchItem(item)
      }

      const holdBubble = () => clearTimeout(hideTimerRef.current)
      const releaseBubble = () => {
        if (!bubbleRef.current) return
        clearTimeout(hideTimerRef.current)
        hideTimerRef.current = window.setTimeout(() => {
          if (apiRef.current) apiRef.current.closeBubble()
        }, ideaOpen ? 12_000 : 3200)
      }

      const openIdea = () => {
        clearTimeout(hideTimerRef.current)
        setIdeaOpen(true)
        hideTimerRef.current = window.setTimeout(() => {
          if (apiRef.current) apiRef.current.closeBubble()
        }, IDEA_MS)
      }

      const now = Date.now() + offsetRef.current
      const sessions = Array.isArray(snapshot?.sessions) ? snapshot.sessions : []
      const runningSessions = sessions.filter((session) => session && session.running)
      const schedules = Array.isArray(snapshot?.schedules) ? snapshot.schedules : []
      let nextTask = null
      let nextDelta = Number.POSITIVE_INFINITY
      for (const task of schedules) {
        const at = Date.parse(task.scheduledAt)
        if (!Number.isFinite(at)) continue
        const delta = at - now
        if (delta < -60_000) continue
        if (delta < nextDelta) {
          nextDelta = delta
          nextTask = task
        }
      }
      const showChip = Boolean(nextTask) && nextDelta <= CHIP_WINDOW_MS && !bubble && !panelOpen
      const panelIdeaRaw = latestIdea || (snapshot && snapshot.idea) || null
      const panelIdea =
        panelIdeaRaw && !dismissedIds.has(panelIdeaRaw.id) ? panelIdeaRaw : null
      const inboxIdeas = ((snapshot && snapshot.ideas) || [])
        .filter((idea) => idea && !dismissedIds.has(idea.id))
        .slice()
        .reverse()
        .slice(0, 6)
      const openmind = (snapshot && snapshot.openmind) || null
      const choiceSkill = skillChoice === 'auto' ? null : skillChoice
      const stats = format(translate('stats'), {
        sessions: sessions.length,
        tasks: schedules.length,
      })
      const popClass = `ds-pop ${placement.above ? 'is-above' : 'is-below'}`
      const popStyle = {
        left: `${placement.left.toFixed(1)}px`,
        '--ds-notch': `${placement.notch.toFixed(1)}px`,
      }

      return h(
        'div',
        { className: 'ds-root', 'data-motion': motion },
        h(
          'svg',
          { ref: stageRef, className: `ds-stage${ready ? ' is-ready' : ''}`, 'aria-hidden': 'true' },
          h(
            'defs',
            null,
            h(
              'linearGradient',
              { id: 'ds-grad-abdomen', x1: '0', y1: '0', x2: '1', y2: '0.25' },
              h('stop', { offset: '0', stopColor: '#4a565f' }),
              h('stop', { offset: '0.45', stopColor: '#252e35' }),
              h('stop', { offset: '1', stopColor: '#10151a' }),
            ),
            h(
              'linearGradient',
              { id: 'ds-grad-front', x1: '0', y1: '0', x2: '1', y2: '0.2' },
              h('stop', { offset: '0', stopColor: '#5d6a74' }),
              h('stop', { offset: '1', stopColor: '#1b2228' }),
            ),
            h(
              'radialGradient',
              { id: 'ds-grad-core', cx: '50%', cy: '50%', r: '50%' },
              h('stop', { offset: '0', stopColor: '#ff9b62', stopOpacity: '0.95' }),
              h('stop', { offset: '0.45', stopColor: '#ff5a1f', stopOpacity: '0.55' }),
              h('stop', { offset: '1', stopColor: '#ff5a1f', stopOpacity: '0' }),
            ),
            h(
              'radialGradient',
              { id: 'ds-grad-hull', cx: '50%', cy: '50%', r: '50%' },
              h('stop', { offset: '0', stopColor: '#ff5a1f', stopOpacity: '0.28' }),
              h('stop', { offset: '1', stopColor: '#ff5a1f', stopOpacity: '0' }),
            ),
            h(
              'filter',
              { id: 'ds-soft-shadow', x: '-50%', y: '-50%', width: '200%', height: '200%' },
              h('feGaussianBlur', { stdDeviation: '3' }),
            ),
          ),
          h(
            'g',
            { ref: bodyShadowRef, className: 'ds-body-shadow' },
            h('ellipse', { cx: '-13', cy: '0', rx: '28', ry: '11', filter: 'url(#ds-soft-shadow)' }),
          ),
          h(
            'g',
            { ref: bodyGlowRef, className: 'ds-hull-glow' },
            h('ellipse', { cx: '-13', cy: '0', rx: '35', ry: '15', fill: 'url(#ds-grad-hull)' }),
          ),
          h(
            'g',
            { className: 'ds-grips' },
            ...Array.from({ length: GRIP_SLOTS }, (_, index) =>
              h(
                'g',
                {
                  key: `grip-${index}`,
                  ref: (element) => {
                    gripEls.current[index].group = element
                  },
                  className: 'ds-grip',
                },
                h('circle', {
                  ref: (element) => {
                    gripEls.current[index].ring = element
                  },
                  className: 'ds-grip__ring',
                }),
                h('path', { className: 'ds-grip__cross', d: 'M-3 0H3M0 -3V3' }),
              ),
            ),
          ),
          h(
            'g',
            { className: 'ds-trail' },
            ...[0, 1, 2].map((index) =>
              h('path', {
                key: `trail-${index}`,
                ref: (element) => {
                  trailEls.current[index] = element
                },
                className: 'ds-trail__seg',
                opacity: '0',
              }),
            ),
          ),
          h(
            'g',
            { className: 'ds-net' },
            h('path', { ref: routeRef, className: 'ds-net__route', opacity: '0' }),
            h('path', { ref: routeLitRef, className: 'ds-net__lit', pathLength: '1', opacity: '0' }),
            ...Array.from({ length: ROUTE_NODES }, (_, index) =>
              h('path', {
                key: `node-${index}`,
                ref: (element) => {
                  routeNodeEls.current[index] = element
                },
                className: 'ds-net__node',
                d: 'M0 -2.4L2.4 0L0 2.4L-2.4 0Z',
                opacity: '0',
              }),
            ),
          ),
          h(
            'g',
            { className: 'ds-pings' },
            ...Array.from({ length: PING_SLOTS }, (_, index) =>
              h('rect', {
                key: `ping-${index}`,
                ref: (element) => {
                  pingEls.current[index] = element
                },
                className: 'ds-ping__shape',
                x: '-2',
                y: '-2',
                width: '4',
                height: '4',
                opacity: '0',
              }),
            ),
          ),
          ...[0, 1].map((index) =>
            h(
              'g',
              {
                key: `endpoint-${index}`,
                ref: (element) => {
                  endpointEls.current[index].group = element
                },
                className: 'ds-ep',
                opacity: '0',
              },
              ...endpointArt(endpointEls.current[index]),
            ),
          ),
          h(
            'g',
            { ref: legsLayerRef, className: 'ds-legs' },
            ...LEG_DEFS.map((leg) =>
              h(
                'g',
                { key: `leg-${leg.index}`, className: 'ds-leg' },
                h('path', {
                  ref: (element) => {
                    legEls.current[leg.index].under = element
                  },
                  className: 'ds-leg__under',
                }),
                h('path', {
                  ref: (element) => {
                    legEls.current[leg.index].femur = element
                  },
                  className: 'ds-leg__femur',
                }),
                h('path', {
                  ref: (element) => {
                    legEls.current[leg.index].tibia = element
                  },
                  className: 'ds-leg__tibia',
                }),
                h('path', {
                  ref: (element) => {
                    legEls.current[leg.index].tarsus = element
                  },
                  className: 'ds-leg__tarsus',
                }),
                h('path', {
                  ref: (element) => {
                    legEls.current[leg.index].trace = element
                  },
                  className: 'ds-leg__trace',
                }),
                h('circle', {
                  ref: (element) => {
                    legEls.current[leg.index].hip = element
                  },
                  className: 'ds-joint ds-joint--hip',
                  r: '1.1',
                }),
                h('circle', {
                  ref: (element) => {
                    legEls.current[leg.index].knee = element
                  },
                  className: 'ds-joint ds-joint--knee',
                  r: '.85',
                }),
                h('circle', {
                  ref: (element) => {
                    legEls.current[leg.index].ankle = element
                  },
                  className: 'ds-joint--ankle',
                  r: '.45',
                }),
                h('circle', {
                  ref: (element) => {
                    legEls.current[leg.index].footShadow = element
                  },
                  className: 'ds-foot-shadow',
                  r: '1.2',
                }),
                h('circle', {
                  ref: (element) => {
                    legEls.current[leg.index].foot = element
                  },
                  className: 'ds-foot',
                }),
                h('path', {
                  ref: (element) => {
                    legEls.current[leg.index].claw = element
                  },
                  className: 'ds-claw',
                }),
              ),
            ),
          ),
          h(
            'g',
            { ref: bodyRef, className: 'ds-body-root' },
            h(
              'g',
              { className: 'ds-body-breathe' },
              h('circle', { className: 'ds-cyber-ring', cx: '-4', cy: '0', r: '34' }),
              h(
                'g',
                { ref: abdomenRef },
                h('path', {
                  className: 'ds-abdomen',
                  d: 'M2 -7C-6 -10 -18 -10 -28 -6.5C-35 -4 -39 -1.5 -39 0C-39 1.5 -35 4 -28 6.5C-18 10 -6 10 2 7C5 4.5 5 -4.5 2 -7Z',
                }),
              h('path', {
                className: 'ds-abdomen-rim',
                d: 'M-35 -1.5C-27 -7.5 -14 -9 -2 -6.4',
              }),
              h('path', {
                className: 'ds-abdomen-stripe',
                d: 'M-35 2C-26 8 -12 9.5 0 6',
              }),
              h('path', { className: 'ds-seam', d: 'M-31 -4C-22 -8 -10 -8.4 -2 -6' }),
              h('path', { className: 'ds-seam', d: 'M-31 4C-22 8 -10 8.4 -2 6' }),
              h('path', { className: 'ds-seam', d: 'M-22 -8.6C-20 -5 -20 5 -22 8.6' }),
              h('path', { className: 'ds-spine', d: 'M-36 0H0' }),
              h('path', { className: 'ds-chevron', d: 'M-7 -3.4L-4 0L-7 3.4' }),
              h('path', { className: 'ds-chevron', d: 'M-14 -3.8L-11 0L-14 3.8' }),
              h('path', { className: 'ds-chevron', d: 'M-21 -3.6L-18 0L-21 3.6' }),
              h('path', { className: 'ds-chevron', d: 'M-28 -3L-25 0L-28 3' }),
              h('rect', { className: 'ds-hatch', x: '-35', y: '-2.4', width: '4', height: '4.8', rx: '.8' }),
              h('circle', { className: 'ds-spinneret', cx: '-38.4', cy: '-1.4', r: '.8' }),
              h('circle', { className: 'ds-spinneret', cx: '-38.4', cy: '1.4', r: '.8' }),
              h('circle', { className: 'ds-core-halo', cx: '-17', cy: '0', r: '12' }),
              h('circle', { className: 'ds-core', cx: '-17', cy: '0', r: '3.4' }),
              h('circle', { className: 'ds-core-pin', cx: '-17', cy: '0', r: '1.4' }),
                h('text', { className: 'ds-serial', x: '-29', y: '3.4' }, 'SPD-07'),
              ),
              h('path', {
                className: 'ds-front',
                d: 'M3 -6.2C8 -8 14 -7.6 18 -3.6L20 0L18 3.6C14 7.6 8 8 3 6.2C1 4 1 -4 3 -6.2Z',
              }),
              h('path', { className: 'ds-seam', d: 'M5 -5.4C9 -6.4 14 -5.8 17.4 -3.2' }),
              h('path', { className: 'ds-seam', d: 'M5 5.4C9 6.4 14 5.8 17.4 3.2' }),
              h('path', { className: 'ds-palp', d: 'M19 -2.2L24.2 -5.2' }),
              h('path', { className: 'ds-palp', d: 'M19 2.2L24.2 5.2' }),
              h('circle', { className: 'ds-palp-tip', cx: '24.4', cy: '-5.4', r: '.8' }),
              h('circle', { className: 'ds-palp-tip', cx: '24.4', cy: '5.4', r: '.8' }),
              h('path', { className: 'ds-fang', d: 'M19.4 -1.6L23.1 -1.1L20.2 .1Z' }),
              h('path', { className: 'ds-fang', d: 'M19.4 1.6L23.1 1.1L20.2 -.1Z' }),
              h('circle', { className: 'ds-eye-glow', cx: '15.6', cy: '-2.6', r: '4.2' }),
              h('circle', { className: 'ds-eye-glow', cx: '17.4', cy: '1', r: '4.2' }),
              h('circle', { className: 'ds-eye', cx: '15.6', cy: '-2.6', r: '1.9' }),
              h('circle', { className: 'ds-eye', cx: '17.4', cy: '-1', r: '1.8' }),
              h('circle', { className: 'ds-eye', cx: '17.4', cy: '1', r: '1.8' }),
              h('circle', { className: 'ds-eye', cx: '15.6', cy: '2.6', r: '1.9' }),
              h('circle', { className: 'ds-eye', cx: '11.6', cy: '-3.4', r: '1.4' }),
              h('circle', { className: 'ds-eye', cx: '11.6', cy: '3.4', r: '1.4' }),
            ),
          ),
          h(
            'g',
            { className: 'ds-packets' },
            ...Array.from({ length: PACKET_COUNT }, (_, index) =>
              h('rect', {
                key: `packet-${index}`,
                ref: (element) => {
                  packetEls.current[index] = element
                },
                className: `ds-packet ds-packet--${'abc'[index % 3]}`,
                x: '-1.7',
                y: '-1.7',
                width: '3.4',
                height: '3.4',
                opacity: '0',
              }),
            ),
          ),
        ),
        h(
          'div',
          { ref: anchorRef, className: 'ds-anchor' },
          h('button', {
            type: 'button',
            className: 'ds-hit',
            onClick: togglePanel,
            'aria-label': translate('aria.spider'),
            'aria-expanded': panelOpen,
            title: translate('aria.spider'),
          }),
          !online ? h('span', { className: 'ds-signal', title: translate('offlineHint') }) : null,
          showChip
            ? h(
                'div',
                {
                  className: `ds-chip${nextDelta <= 120_000 ? ' is-urgent' : ''}`,
                  title: nextTask.title || translate('untitledTask'),
                },
                h('span', { className: 'ds-chip__dot' }),
                h('span', { className: 'ds-chip__title' }, nextTask.title || translate('untitledTask')),
                h(
                  'span',
                  { className: 'ds-chip__time' },
                  nextDelta <= 0
                    ? translate('chipNow')
                    : `${translate('chipNext')} ${durationLabel(nextDelta, translate)}`,
                ),
              )
            : null,
          bubble && bubble.kind === 'mood'
            ? h(
                'div',
                {
                  className: `ds-thought ds-mood${placement.above ? ' is-above' : ' is-below'}${
                    placement.thoughtSide < 0 ? ' is-left' : ''
                  }`,
                  role: 'status',
                  'aria-live': 'polite',
                },
                h('span', { className: 'ds-thought__dot ds-thought__dot--1', 'aria-hidden': 'true' }),
                h('span', { className: 'ds-thought__dot ds-thought__dot--2', 'aria-hidden': 'true' }),
                h(
                  'div',
                  {
                    className: 'ds-thought__wrap',
                    style: {
                      left: `${(placement.thoughtLeft ?? 10).toFixed(1)}px`,
                      width: `${(placement.thoughtWidth ?? 232).toFixed(1)}px`,
                    },
                  },
                  h(
                    'div',
                    {
                      className: `ds-mood__bubble is-${bubble.valence} is-${bubble.emotion || 'other'}`,
                      onMouseEnter: holdBubble,
                      onMouseLeave: releaseBubble,
                    },
                    h(
                      'div',
                      { className: 'ds-mood__head' },
                      h(
                        'span',
                        { className: 'ds-mood__glyph', 'aria-hidden': 'true' },
                        bubble.valence === 'positive' ? '✦' : '♥',
                      ),
                      h(
                        'span',
                        { className: 'ds-mood__label' },
                        translate(bubble.valence === 'positive' ? 'mood.positive' : 'mood.negative'),
                      ),
                      h(
                        'span',
                        { className: 'ds-mood__emotion' },
                        translate(`emotion.${bubble.emotion || 'other'}`),
                      ),
                      h(
                        'button',
                        {
                          type: 'button',
                          className: 'ds-mood__close',
                          onClick: () => apiRef.current && apiRef.current.closeBubble(),
                          'aria-label': translate('close'),
                        },
                        '×',
                      ),
                    ),
                    h('p', { className: 'ds-mood__text' }, bubble.body),
                    bubble.sessionTitle
                      ? h(
                          'div',
                          { className: 'ds-mood__from' },
                          format(translate('ideaFrom'), { title: bubble.sessionTitle }),
                        )
                      : null,
                  ),
                ),
              )
            : bubble && bubble.kind === 'idea' && !ideaOpen
            ? h(
                'div',
                {
                  className: `ds-thought${placement.above ? ' is-above' : ' is-below'}${
                    placement.thoughtSide < 0 ? ' is-left' : ''
                  }`,
                  role: 'status',
                  'aria-live': 'polite',
                },
                h('span', { className: 'ds-thought__dot ds-thought__dot--1', 'aria-hidden': 'true' }),
                h('span', { className: 'ds-thought__dot ds-thought__dot--2', 'aria-hidden': 'true' }),
                h(
                  'div',
                  {
                    className: 'ds-thought__wrap',
                    style: {
                      left: `${(placement.thoughtLeft ?? 10).toFixed(1)}px`,
                      width: `${(placement.thoughtWidth ?? 232).toFixed(1)}px`,
                    },
                  },
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'ds-thought__bubble',
                      onClick: openIdea,
                      onMouseEnter: holdBubble,
                      onMouseLeave: releaseBubble,
                      onFocus: holdBubble,
                      onBlur: releaseBubble,
                      'aria-label': `${ideaPeekText(bubble)} · ${translate('ideaPeek')}`,
                      title: translate('ideaPeek'),
                    },
                    h('span', { className: 'ds-thought__glow', 'aria-hidden': 'true' }),
                    h('div', { className: 'ds-thought__content' }, ...thoughtContent(bubble, translate)),
                  ),
                ),
              )
            : bubble
            ? h(
                'div',
                {
                  className: `ds-pop${placement.above ? ' is-above' : ' is-below'}`,
                  style: popStyle,
                  role: 'status',
                  'aria-live': 'polite',
                  onMouseEnter: holdBubble,
                  onMouseLeave: releaseBubble,
                  onFocus: holdBubble,
                  onBlur: releaseBubble,
                },
                h('span', { className: 'ds-pop__leader', 'aria-hidden': 'true' }),
                h('div', { className: 'ds-pop__scan', 'aria-hidden': 'true' }),
                h(
                  'div',
                  { className: 'ds-pop__head' },
                  h('span', { className: 'ds-pop__tag' }, h('span', { className: 'ds-led' }), bubble.label),
                  h('span', { className: 'ds-pop__meta' }, bubble.meta),
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'ds-icon',
                      onClick: () => apiRef.current && apiRef.current.closeBubble(),
                      'aria-label': translate('close'),
                    },
                    '×',
                  ),
                ),
                h(
                  'div',
                  { className: 'ds-pop__body-wrap' },
                  bubble.kind === 'idea'
                    ? h(
                        React.Fragment,
                        null,
                        h('p', { className: 'ds-pop__title' }, bubble.ideaTitle || bubble.title),
                        bubble.artifact
                          ? h(React.Fragment, null, ...ideaArtifactNodes(bubble, translate))
                          : h('p', { className: 'ds-pop__body' }, bubble.suggestion || bubble.body),
                        bubble.rationale
                          ? h(
                              'div',
                              { className: 'ds-pop__why' },
                              h('span', { className: 'ds-pop__why-label' }, translate('why')),
                              h('span', null, bubble.rationale),
                            )
                          : null,
                        bubble.sessionTitle
                          ? h(
                              'div',
                              { className: 'ds-pop__from' },
                              `${format(translate('ideaFrom'), { title: bubble.sessionTitle })} · ${
                                bubble.ideaSource === 'model'
                                  ? translate('source.model')
                                  : translate('source.local')
                              }`,
                            )
                          : null,
                        bubble.skillReason
                          ? h(
                              'div',
                              { className: 'ds-pop__skill' },
                              `${translate('skillReason')} · ${bubble.skillReason}`,
                            )
                          : null,
                      )
                    : h(
                        React.Fragment,
                        null,
                        h('p', { className: 'ds-pop__title' }, bubble.title),
                        h('p', { className: 'ds-pop__body' }, bubble.body),
                        bubble.hint ? h('div', { className: 'ds-pop__hint' }, bubble.hint) : null,
                      ),
                  ideaError && bubble.kind === 'idea'
                    ? h('div', { className: 'ds-pop__error' }, translate('genericError'))
                    : null,
                ),
                h(
                  'div',
                  { className: 'ds-pop__foot' },
                  h('span', { className: 'ds-pop__time' }, timeLabel(bubble.at, locale)),
                  h(
                    'div',
                    { className: 'ds-pop__actions' },
                    bubble.kind === 'idea'
                      ? h(
                          React.Fragment,
                          null,
                          h(
                            'button',
                            {
                              type: 'button',
                              className: 'ds-btn',
                              disabled: !sessionAnchor(bubble.sessionId),
                              onClick: () => openSession(bubble.sessionId),
                            },
                            translate('openSession'),
                          ),
                          h(
                            'button',
                            {
                              type: 'button',
                              className: 'ds-btn',
                              onClick: () => copyIdea(bubble),
                            },
                            copyDone ? translate('copied') : translate('copy'),
                          ),
                          h(
                            'button',
                            {
                              type: 'button',
                              className: 'ds-btn',
                              disabled: generating,
                              onClick: () => requestIdea(bubble.sessionId, bubble.skill, bubble.mode),
                            },
                            generating ? translate('thinking') : translate('anotherIdea'),
                          ),
                          h(
                            'button',
                            {
                              type: 'button',
                              className: 'ds-btn ds-btn--ghost',
                              onClick: () => dismissIdea(bubble.ideaId),
                            },
                            translate('ignore'),
                          ),
                        )
                      : h(
                          'button',
                          {
                            type: 'button',
                            className: 'ds-btn ds-btn--ghost',
                            onClick: () => apiRef.current && apiRef.current.closeBubble(),
                          },
                          translate('dismiss'),
                        ),
                  ),
                ),
              )
            : null,
          panelOpen
            ? h(
                'div',
                {
                  className: `${popClass} ds-panel`,
                  style: popStyle,
                  role: 'dialog',
                  'aria-label': translate('aria.panel'),
                },
                h('span', { className: 'ds-pop__leader', 'aria-hidden': 'true' }),
                h('div', { className: 'ds-pop__scan', 'aria-hidden': 'true' }),
                h(
                  'div',
                  { className: 'ds-pop__head' },
                  h('span', { className: 'ds-pop__tag' }, h('span', { className: 'ds-led' }), 'PET-07'),
                  h('span', { className: 'ds-pop__meta' }, translate('statusTitle')),
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'ds-icon',
                      onClick: togglePanel,
                      'aria-label': translate('aria.close'),
                    },
                    '×',
                  ),
                ),
                h(
                  'div',
                  { className: 'ds-panel__body' },
                  h(
                    'div',
                    { className: 'ds-panel__sec ds-motion' },
                    h('div', { className: 'ds-panel__label' }, translate('motion.label')),
                    h(
                      'div',
                      { className: 'ds-seg' },
                      h(
                        'button',
                        {
                          type: 'button',
                          className: `ds-seg__btn${motion === MOTION_ORGANIC ? ' is-on' : ''}`,
                          onClick: () => changeMotion(MOTION_ORGANIC),
                        },
                        translate('motion.organic'),
                      ),
                      h(
                        'button',
                        {
                          type: 'button',
                          className: `ds-seg__btn${motion === MOTION_CYBER ? ' is-on' : ''}`,
                          onClick: () => changeMotion(MOTION_CYBER),
                        },
                        translate('motion.cyber'),
                      ),
                    ),
                    h(
                      'div',
                      { className: 'ds-motion__hint' },
                      translate(motion === MOTION_CYBER ? 'motion.cyberHint' : 'motion.organicHint'),
                    ),
                  ),
                  h(
                    'div',
                    { className: 'ds-panel__sec' },
                    h(
                      'div',
                      { className: 'ds-panel__label' },
                      translate('statusRunning'),
                      h('span', null, String(runningSessions.length)),
                    ),
                    runningSessions.length === 0
                      ? h('div', { className: 'ds-panel__empty' }, translate('noRunning'))
                      : runningSessions.slice(0, 4).map((session, index) =>
                          h(
                            'div',
                            { className: 'ds-row', key: session.id || `running-${index}` },
                            h('span', { className: 'ds-row__dot is-live' }),
                            h(
                              'span',
                              { className: 'ds-row__name' },
                              session.title || translate('untitledSession'),
                            ),
                          ),
                        ),
                  ),
                  h(
                    'div',
                    { className: 'ds-panel__sec' },
                    h('div', { className: 'ds-panel__label' }, translate('statusSchedules')),
                    schedules.length === 0
                      ? h('div', { className: 'ds-panel__empty' }, translate('noSchedules'))
                      : schedules.slice(0, 3).map((task, index) => {
                          const delta = Date.parse(task.scheduledAt) - now
                          return h(
                            'div',
                            { className: 'ds-row', key: task.id || `task-${index}` },
                            h('span', {
                              className: `ds-row__dot${delta <= 120_000 ? ' is-urgent' : ''}`,
                            }),
                            h(
                              'span',
                              { className: 'ds-row__name' },
                              task.title || translate('untitledTask'),
                            ),
                            h(
                              'span',
                              { className: 'ds-row__time' },
                              Number.isFinite(delta)
                                ? durationLabel(delta, translate)
                                : timeLabel(Date.parse(task.scheduledAt), locale),
                            ),
                          )
                        }),
                  ),
                  h(
                    'div',
                    { className: 'ds-panel__sec' },
                    h('div', { className: 'ds-panel__label' }, translate('statusIdea')),
                    panelIdea
                      ? h(
                          'div',
                          { className: 'ds-panel__idea' },
                          panelIdea.ideaTitle
                            ? h('div', { className: 'ds-panel__idea-title' }, panelIdea.ideaTitle)
                            : null,
                          h('p', null, panelIdea.suggestion || panelIdea.text),
                          panelIdea.rationale
                            ? h('div', { className: 'ds-panel__idea-why' }, panelIdea.rationale)
                            : null,
                          h(
                            'div',
                            { className: 'ds-panel__idea-foot' },
                            h(
                              'span',
                              null,
                              [panelIdea.skillLabel || panelIdea.skill, panelIdea.mode]
                                .filter(Boolean)
                                .join(' · ') ||
                                panelIdea.sessionTitle ||
                                panelIdea.title ||
                                translate('ideaTitle'),
                            ),
                            h(
                              'span',
                              null,
                              panelIdea.source === 'model'
                                ? translate('source.model')
                                : translate('source.local'),
                            ),
                            h(
                              'button',
                              {
                                type: 'button',
                                className: 'ds-btn',
                                disabled: generating,
                                onClick: () => requestIdea(panelIdea.sessionId, choiceSkill, null),
                              },
                              generating ? translate('thinking') : translate('anotherIdea'),
                            ),
                          ),
                        )
                      : h(
                          'div',
                          { className: 'ds-panel__empty' },
                          translate('noIdea'),
                          h(
                            'button',
                            {
                              type: 'button',
                              className: 'ds-btn',
                              disabled: generating,
                              onClick: () => requestIdea(null, choiceSkill, null),
                              style: { marginLeft: '8px' },
                            },
                            generating ? translate('thinking') : translate('anotherIdea'),
                          ),
                        ),
                    ideaError ? h('div', { className: 'ds-pop__error' }, translate('ideaError')) : null,
                  ),
                  h(
                    'div',
                    { className: 'ds-panel__sec ds-form' },
                    h('div', { className: 'ds-panel__label' }, translate('statusForm')),
                    h(
                      'div',
                      { className: 'ds-form__row' },
                      h(
                        'select',
                        {
                          className: 'ds-form__select',
                          value: skillChoice,
                          onChange: (event) => setSkillChoice(event.target.value),
                          'aria-label': translate('statusForm'),
                        },
                        SKILL_CHOICES.map((choice) =>
                          h(
                            'option',
                            { key: choice.id, value: choice.id },
                            translate(choice.key),
                          ),
                        ),
                      ),
                      h(
                        'button',
                        {
                          type: 'button',
                          className: 'ds-btn',
                          disabled: generating,
                          onClick: () =>
                            requestIdea(panelIdea ? panelIdea.sessionId : null, choiceSkill, null),
                        },
                        generating ? translate('thinking') : translate('formGenerate'),
                      ),
                    ),
                    h('div', { className: 'ds-form__hint' }, translate('formHint')),
                  ),
                  h(
                    'div',
                    { className: 'ds-panel__sec' },
                    h('div', { className: 'ds-panel__label' }, translate('statusInbox')),
                    inboxIdeas.length === 0
                      ? h('div', { className: 'ds-panel__empty' }, translate('noInbox'))
                      : inboxIdeas.map((idea) =>
                          h(
                            'button',
                            {
                              type: 'button',
                              className: 'ds-inbox__item',
                              key: idea.id,
                              onClick: () => focusIdea(idea),
                            },
                            h(
                              'span',
                              { className: 'ds-inbox__title' },
                              idea.ideaTitle || idea.text || translate('ideaTitle'),
                            ),
                            h(
                              'span',
                              { className: 'ds-inbox__meta' },
                              [
                                idea.skillLabel || idea.skill || translate('source.local'),
                                idea.mode,
                                idea.sessionTitle,
                              ]
                                .filter(Boolean)
                                .join(' · '),
                            ),
                          ),
                        ),
                  ),
                  h(
                    'div',
                    { className: 'ds-panel__openmind' },
                    openmind && openmind.available
                      ? `${translate('openmind')} · ${openmind.skillCount}`
                      : translate('openmindMissing'),
                  ),
                ),
                h(
                  'div',
                  { className: 'ds-panel__foot' },
                  h('span', null, stats),
                  h(
                    'span',
                    { className: 'ds-panel__state' + (online ? '' : ' is-offline') },
                    h('span', { className: 'ds-led' }),
                    online ? translate('online') : translate('offline'),
                  ),
                ),
                h('div', { className: 'ds-pop__hint', style: { padding: '0 12px 10px' } }, translate('statusHint')),
              )
            : null,
        ),
      )
    }

    function apply(ctx) {
      ctx.effect(() => {
        if (typeof document === 'undefined' || !document.head) return undefined
        const node = document.createElement('style')
        node.id = STYLE_ID
        node.textContent = CSS
        document.head.appendChild(node)
        return () => node.remove()
      }, 'digital-spider: styles')

      ctx.effect(() => {
        try {
          const offZh = ctx.locale.register(NS, 'zh', DICT.zh)
          const offEn = ctx.locale.register(NS, 'en', DICT.en)
          t = ctx.locale.bind(NS)
          return () => {
            t = (key) => DICT.zh[key] || DICT.en[key] || key
            offZh()
            offEn()
          }
        } catch (error) {
          console.error('[digital-spider] 文案注册失败，退回内置字典：', error)
          return undefined
        }
      }, 'digital-spider: locale')

      const Seat = () => h(SpiderPet, { t, locale: ctx.locale })

      ctx.effect(
        () =>
          ctx.slots.inject('shell.overlay', () =>
            ctx.slots.register({ name: 'shell.overlay', id: 'digital-spider-pet', order: -4 }, Seat),
          ),
        'digital-spider: overlay seat',
      )

      ctx.effect(() => {
        let off = null
        let timer = 0
        let tries = 0

        const mount = () => {
          try {
            off = ctx.slots.inject('sidebar.session.row.leading', () =>
              ctx.slots.register(
                { name: 'sidebar.session.row.leading', id: 'digital-spider-anchor', order: 20 },
                SessionRowAnchor,
              ),
            )
          } catch (error) {
            /* 侧栏 slot 可能在插件 apply 时还没声明；不要让它拖垮整个 overlay。 */
            console.error('[digital-spider] 会话行锚点注册失败，稍后重试：', error)
            if (tries < 8) {
              tries += 1
              timer = window.setTimeout(mount, 500)
            }
          }
        }

        mount()
        return () => {
          if (timer) window.clearTimeout(timer)
          if (typeof off === 'function') off()
        }
      }, 'digital-spider: session row anchor')
    }

    return { inject: ['slots', 'locale'], apply }
  },
})
