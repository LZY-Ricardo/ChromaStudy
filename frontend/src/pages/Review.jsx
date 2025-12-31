import { useEffect, useMemo, useRef, useState } from 'react'
import dayjs from 'dayjs'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Button, Card, Dialog, Input, TextArea, Toast } from 'antd-mobile'
import { ArrowLeft, Plus, Sparkles } from 'lucide-react'
import { checkin, generateFlashcards } from '../services/api.js'
import { loadAiConfig } from '../utils/storage.js'
import {
  addReviewCards,
  applySm2Grade,
  getDueReviewCards,
  loadReviewCards,
  makeReviewCard,
  removeReviewCard,
  saveReviewCards,
  updateReviewCard,
} from '../utils/flashcards.js'

function isValidDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '').trim())
}

function clampText(text, max) {
  const normalized = String(text || '').trim()
  if (!normalized) return ''
  if (normalized.length <= max) return normalized
  return normalized.slice(0, max)
}

function safeParse(raw) {
  try {
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function loadCachedStudyLogs(userId) {
  if (typeof window === 'undefined') return []
  if (!userId) return []
  const key = `chroma_cache_studyLogs_${userId}`
  const data = safeParse(window.localStorage.getItem(key))
  return Array.isArray(data) ? data : []
}

function pickLatestStudyDateFromCache(userId) {
  const logs = loadCachedStudyLogs(userId)
  let best = ''
  for (const log of logs) {
    const date = String(log?.date || '').trim()
    if (!isValidDate(date)) continue
    const minutes = Number(log?.duration) || 0
    const content = String(log?.content || '').trim()
    if (minutes <= 0 || !content) continue
    if (!best || date > best) {
      best = date
    }
  }
  return best
}

function toFriendlyFlashcardError(message) {
  const text = String(message || '').trim()
  if (!text) return '生成失败，请稍后重试'
  if (text === 'study log is required') {
    return '所选日期没有学习记录（需先打卡，或先同步离线打卡），再生成题卡。'
  }
  if (text === 'date must be YYYY-MM-DD') {
    return '日期格式不正确，请使用 YYYY-MM-DD。'
  }
  if (text === 'userId must be a positive integer') {
    return '用户信息无效，请退出后重新登录。'
  }
  if (text.includes('openai config requires')) {
    return '云端模型配置不完整：请在 Settings 补全 baseUrl/model/apiKey，或切换到 Ollama。'
  }
  if (text === 'study log not found') {
    return '所选日期没有学习记录，请先打卡后再试。'
  }
  return text
}

function Review({ user, syncTick }) {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const todayKey = useMemo(() => dayjs().format('YYYY-MM-DD'), [])

  const queryDate = params.get('date')

  const [sourceDate, setSourceDate] = useState(() => {
    if (isValidDate(queryDate)) return queryDate
    const cached = pickLatestStudyDateFromCache(user?.id)
    return cached || todayKey
  })

  const [cards, setCards] = useState(() => loadReviewCards(user?.id))
  const [mode, setMode] = useState('overview') // overview | session
  const [revealed, setRevealed] = useState(false)
  const [sessionQueue, setSessionQueue] = useState([])
  const [sessionIndex, setSessionIndex] = useState(0)
  const [sessionSaving, setSessionSaving] = useState(false)
  const sessionStartedAtRef = useRef(null)
  const reviewedCountRef = useRef(0)

  const [manualOpen, setManualOpen] = useState(false)
  const [manualFront, setManualFront] = useState('')
  const [manualBack, setManualBack] = useState('')

  const [generatedCards, setGeneratedCards] = useState([])
  const [generating, setGenerating] = useState(false)

  const [editOpen, setEditOpen] = useState(false)
  const [editCard, setEditCard] = useState(null)
  const [editFront, setEditFront] = useState('')
  const [editBack, setEditBack] = useState('')

  useEffect(() => {
    if (!user?.id) return
    setCards(loadReviewCards(user.id))
  }, [syncTick, user?.id])

  useEffect(() => {
    if (!user?.id) return
    if (isValidDate(queryDate)) {
      setSourceDate(queryDate)
      return
    }
    setSourceDate((prev) => {
      if (isValidDate(prev)) return prev
      const cached = pickLatestStudyDateFromCache(user.id)
      return cached || todayKey
    })
  }, [queryDate, todayKey, user?.id])

  const dueCards = useMemo(() => getDueReviewCards(cards, todayKey), [cards, todayKey])
  const dueCount = dueCards.length
  const totalCount = cards.length

  const currentCard = useMemo(() => {
    if (mode !== 'session') return null
    return sessionQueue[sessionIndex] ?? null
  }, [mode, sessionIndex, sessionQueue])

  const startSession = () => {
    if (dueCards.length === 0) {
      Toast.show({ content: '今天没有到期题卡' })
      return
    }
    const queue = dueCards.slice(0, 10)
    setSessionQueue(queue)
    setSessionIndex(0)
    setRevealed(false)
    setMode('session')
    sessionStartedAtRef.current = Date.now()
    reviewedCountRef.current = 0
  }

  const endSession = async ({ force } = { force: false }) => {
    if (mode !== 'session') return
    if (!force && sessionIndex < sessionQueue.length) {
      const confirmed = await Dialog.confirm({
        title: '结束复习？',
        content: '结束后会把本次复习耗时计入今天的学习时长（用于周目标与 streak）。',
        confirmText: '结束',
      })
      if (!confirmed) return
    }

    const startedAt = sessionStartedAtRef.current
    const reviewed = reviewedCountRef.current
    setMode('overview')
    setRevealed(false)
    setSessionQueue([])
    setSessionIndex(0)

    if (!startedAt || reviewed <= 0 || !user?.id) {
      return
    }

    const minutes = Math.max(1, Math.ceil((Date.now() - startedAt) / 60000))
    setSessionSaving(true)
    try {
      await checkin({
        userId: user.id,
        date: todayKey,
        duration: minutes,
        mode: 'increment',
        generateFeedback: false,
        content: `答题复习：${reviewed} 题`,
      })
      Toast.show({ content: `已记录复习 ${minutes} 分钟` })
    } catch {
      Toast.show({ content: '记录复习时长失败（已保留本地更改）' })
    } finally {
      setSessionSaving(false)
    }
  }

  const gradeCurrent = async (grade) => {
    if (!currentCard?.id) return

    const updated = applySm2Grade(currentCard, grade, todayKey)
    const nextCards = updateReviewCard(cards, updated)
    setCards(nextCards)
    saveReviewCards(user.id, nextCards)

    reviewedCountRef.current += 1
    setRevealed(false)

    if (sessionIndex + 1 >= sessionQueue.length) {
      await endSession({ force: true })
      return
    }

    setSessionIndex((prev) => prev + 1)
  }

  const openManual = () => {
    setManualFront('')
    setManualBack('')
    setManualOpen(true)
  }

  const saveManual = () => {
    if (!user?.id) return
    const front = clampText(manualFront, 120)
    const back = clampText(manualBack, 800)
    if (!front || !back) {
      Toast.show({ content: '请填写题目与答案' })
      return
    }

    const card = makeReviewCard({
      type: 'short_answer',
      front,
      back,
      sourceDate,
    })
    const nextCards = addReviewCards(cards, [card])
    setCards(nextCards)
    saveReviewCards(user.id, nextCards)
    setManualOpen(false)
    Toast.show({ content: '已添加题卡' })
  }

  const runGenerate = async () => {
    if (!user?.id) return
    if (!isValidDate(sourceDate)) {
      Toast.show({ content: '请选择正确的来源日期（YYYY-MM-DD）' })
      return
    }
    setGenerating(true)
    try {
      const cards = await generateFlashcards(user.id, sourceDate, 5, loadAiConfig())
      if (!Array.isArray(cards) || cards.length === 0) {
        Toast.show({ content: '未生成题卡，请稍后再试' })
        return
      }
      setGeneratedCards(
        cards.map((item) => ({
          type: typeof item?.type === 'string' ? item.type : 'short_answer',
          question: String(item?.question ?? '').trim(),
          answer: String(item?.answer ?? '').trim(),
        }))
      )
      Toast.show({ content: `已生成 ${cards.length} 张题卡草稿` })
    } catch (error) {
      const raw =
        typeof error?.response?.data?.error === 'string' ? error.response.data.error : ''
      Toast.show({ content: toFriendlyFlashcardError(raw) })
    } finally {
      setGenerating(false)
    }
  }

  const saveGenerated = () => {
    if (!user?.id) return
    const drafts = Array.isArray(generatedCards) ? generatedCards : []
    const valid = drafts
      .map((draft) => {
        const front = clampText(draft?.question, 120)
        const back = clampText(draft?.answer, 800)
        if (!front || !back) return null
        return makeReviewCard({
          type: typeof draft?.type === 'string' && draft.type.trim() ? draft.type.trim() : 'short_answer',
          front,
          back,
          sourceDate,
        })
      })
      .filter(Boolean)

    if (valid.length === 0) {
      Toast.show({ content: '没有可保存的题卡' })
      return
    }

    const nextCards = addReviewCards(cards, valid)
    setCards(nextCards)
    saveReviewCards(user.id, nextCards)
    setGeneratedCards([])
    Toast.show({ content: `已保存 ${valid.length} 张题卡` })
  }

  const openEditor = (card) => {
    if (!card?.id) return
    setEditCard(card)
    setEditFront(card.front || '')
    setEditBack(card.back || '')
    setEditOpen(true)
  }

  const saveEdit = () => {
    if (!user?.id) return
    if (!editCard?.id) return
    const front = clampText(editFront, 120)
    const back = clampText(editBack, 800)
    if (!front || !back) {
      Toast.show({ content: '请填写题目与答案' })
      return
    }

    const updated = {
      ...editCard,
      front,
      back,
      updatedAt: Date.now(),
    }
    const nextCards = updateReviewCard(cards, updated)
    setCards(nextCards)
    saveReviewCards(user.id, nextCards)
    setEditOpen(false)
    setEditCard(null)
    Toast.show({ content: '已保存' })
  }

  const deleteCard = async () => {
    if (!user?.id) return
    if (!editCard?.id) return
    const confirmed = await Dialog.confirm({
      title: '删除题卡？',
      content: '删除后无法恢复（可从备份恢复）。',
      confirmText: '删除',
    })
    if (!confirmed) return

    const nextCards = removeReviewCard(cards, editCard.id)
    setCards(nextCards)
    saveReviewCards(user.id, nextCards)
    setEditOpen(false)
    setEditCard(null)
    Toast.show({ content: '已删除' })
  }

  if (mode === 'session') {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <button
            type="button"
            className="rounded-xl bg-white p-2 text-slate-600 shadow-sm"
            onClick={() => endSession({ force: false })}
            disabled={sessionSaving}
          >
            <ArrowLeft size={18} />
          </button>
          <div className="text-sm font-semibold text-slate-900">答题复习</div>
          <div className="text-xs text-slate-500">
            {sessionIndex + 1}/{sessionQueue.length}
          </div>
        </div>

        <Card className="rounded-2xl border border-slate-100 bg-white shadow-sm">
          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Question</p>
          <p className="mt-3 whitespace-pre-wrap text-base font-semibold text-slate-900">
            {currentCard?.front || '—'}
          </p>
        </Card>

        <Card className="rounded-2xl border border-slate-100 bg-white shadow-sm">
          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Answer</p>
          {revealed ? (
            <div className="mt-3 space-y-4">
              <p className="whitespace-pre-wrap text-sm text-slate-700">{currentCard?.back || '—'}</p>
              <div className="grid grid-cols-2 gap-3">
                <Button block fill="outline" onClick={() => gradeCurrent('again')} disabled={sessionSaving}>
                  Again
                </Button>
                <Button block fill="outline" onClick={() => gradeCurrent('hard')} disabled={sessionSaving}>
                  Hard
                </Button>
                <Button block color="primary" onClick={() => gradeCurrent('good')} disabled={sessionSaving}>
                  Good
                </Button>
                <Button block color="success" onClick={() => gradeCurrent('easy')} disabled={sessionSaving}>
                  Easy
                </Button>
              </div>
              <p className="text-xs text-slate-400">
                自评会更新下一次复习时间（SM-2），本次耗时会计入今日学习时长。
              </p>
            </div>
          ) : (
            <div className="mt-3 space-y-3">
              <p className="text-sm text-slate-500">先自己回想，再点击显示答案。</p>
              <Button block color="primary" onClick={() => setRevealed(true)} disabled={sessionSaving}>
                显示答案
              </Button>
            </div>
          )}
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button
          type="button"
          className="rounded-xl bg-white p-2 text-slate-600 shadow-sm"
          onClick={() => navigate('/')}
        >
          <ArrowLeft size={18} />
        </button>
        <div className="text-sm font-semibold text-slate-900">答题复习</div>
        <div />
      </div>

      <Card className="rounded-2xl border border-slate-100 bg-white shadow-sm">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Due Today</p>
            <p className="display-font text-3xl font-semibold text-slate-900">{dueCount}</p>
            <p className="mt-1 text-xs text-slate-500">题库共 {totalCount} 张</p>
          </div>
          <Button size="small" color="primary" onClick={startSession} disabled={dueCount === 0}>
            开始复习
          </Button>
        </div>
      </Card>

      <Card title="生成 / 创建" className="rounded-2xl border border-slate-100 bg-white shadow-sm">
        <div className="space-y-3">
          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
              Source Date
            </div>
            <div className="flex items-center gap-2">
              <Input
                value={sourceDate}
                placeholder="YYYY-MM-DD"
                onChange={setSourceDate}
                clearable
              />
              <Button
                size="small"
                fill="outline"
                onClick={() => {
                  if (!isValidDate(sourceDate)) {
                    Toast.show({ content: '日期格式不正确' })
                    return
                  }
                  setParams({ date: sourceDate })
                  Toast.show({ content: '已应用日期' })
                }}
              >
                应用
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="small"
                fill="outline"
                onClick={() => {
                  if (!isValidDate(sourceDate)) {
                    Toast.show({ content: '日期格式不正确' })
                    return
                  }
                  navigate(`/day/${sourceDate}`)
                }}
              >
                去打卡/笔记
              </Button>
              <Button size="small" fill="outline" onClick={() => navigate('/calendar')}>
                去日历选日期
              </Button>
            </div>
          </div>
          <Button
            block
            fill="outline"
            onClick={runGenerate}
            disabled={generating}
          >
            <span className="inline-flex items-center justify-center gap-2">
              <Sparkles size={18} />
              {generating ? '生成中...' : `从 ${sourceDate} 学习内容生成 5 张`}
            </span>
          </Button>
          <Button block onClick={openManual}>
            <span className="inline-flex items-center justify-center gap-2">
              <Plus size={18} />
              手动创建题卡
            </span>
          </Button>
          <p className="text-xs text-slate-400">
            生成的题卡会先进入草稿，可编辑后再保存到题库；复习耗时会计入今日学习时长。
          </p>
        </div>
      </Card>

      {generatedCards.length ? (
        <Card title="题卡草稿" className="rounded-2xl border border-slate-100 bg-white shadow-sm">
          <div className="space-y-4">
            {generatedCards.map((draft, index) => (
              <div key={`${index}-${draft.question}`} className="space-y-2 rounded-xl bg-slate-50 p-3">
                <Input
                  placeholder="题目"
                  value={draft.question}
                  onChange={(value) =>
                    setGeneratedCards((prev) =>
                      prev.map((item, i) => (i === index ? { ...item, question: value } : item))
                    )
                  }
                  maxLength={120}
                  clearable
                />
                <TextArea
                  placeholder="答案"
                  value={draft.answer}
                  onChange={(value) =>
                    setGeneratedCards((prev) =>
                      prev.map((item, i) => (i === index ? { ...item, answer: value } : item))
                    )
                  }
                  rows={3}
                  showCount
                  maxLength={800}
                />
              </div>
            ))}
            <div className="flex items-center gap-3">
              <Button block color="primary" onClick={saveGenerated}>
                保存到题库
              </Button>
              <Button block fill="outline" onClick={() => setGeneratedCards([])}>
                清空草稿
              </Button>
            </div>
          </div>
        </Card>
      ) : null}

      <Card title="题库（按到期排序）" className="rounded-2xl border border-slate-100 bg-white shadow-sm">
        {cards.length ? (
          <div className="space-y-3">
            {cards
              .slice()
              .sort((a, b) => String(a?.srs?.dueDate || '').localeCompare(String(b?.srs?.dueDate || '')))
              .slice(0, 12)
              .map((card) => (
                <button
                  key={card.id}
                  type="button"
                  className="w-full rounded-xl bg-slate-50 p-3 text-left"
                  onClick={() => openEditor(card)}
                >
                  <p className="line-clamp-2 text-sm font-semibold text-slate-900">{card.front}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    下次：{card?.srs?.dueDate || '—'} · 来源：{card?.source?.date || '—'}
                  </p>
                </button>
              ))}
            {cards.length > 12 ? (
              <p className="text-xs text-slate-400">仅展示前 12 张（后续可加“全部题库/搜索”）。</p>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-slate-500">还没有题卡，先生成或手动创建一张。</p>
        )}
      </Card>

      <Dialog
        visible={manualOpen}
        title="手动创建题卡"
        closeOnMaskClick
        closeOnAction={false}
        onClose={() => setManualOpen(false)}
        actions={[
          { key: 'cancel', text: '取消' },
          { key: 'save', text: '保存', bold: true },
        ]}
        onAction={(action) => {
          if (action.key === 'save') {
            saveManual()
          } else {
            setManualOpen(false)
          }
        }}
        content={
          <div className="space-y-3">
            <Input
              placeholder="题目（front）"
              value={manualFront}
              onChange={setManualFront}
              maxLength={120}
              clearable
            />
            <TextArea
              placeholder="参考答案（back）"
              value={manualBack}
              onChange={setManualBack}
              rows={5}
              showCount
              maxLength={800}
            />
            <p className="text-xs text-slate-400">来源日期：{sourceDate}</p>
          </div>
        }
      />

      <Dialog
        visible={editOpen}
        title="编辑题卡"
        closeOnMaskClick
        closeOnAction={false}
        onClose={() => setEditOpen(false)}
        actions={[
          { key: 'delete', text: '删除', danger: true },
          { key: 'cancel', text: '取消' },
          { key: 'save', text: '保存', bold: true },
        ]}
        onAction={(action) => {
          if (action.key === 'save') {
            saveEdit()
          } else if (action.key === 'delete') {
            deleteCard()
          } else {
            setEditOpen(false)
          }
        }}
        content={
          <div className="space-y-3">
            <Input
              placeholder="题目（front）"
              value={editFront}
              onChange={setEditFront}
              maxLength={120}
              clearable
            />
            <TextArea
              placeholder="参考答案（back）"
              value={editBack}
              onChange={setEditBack}
              rows={5}
              showCount
              maxLength={800}
            />
            <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
              <p>下次复习：{editCard?.srs?.dueDate || '—'}</p>
              <p>
                状态：rep {Number(editCard?.srs?.repetition) || 0} · interval{' '}
                {Number(editCard?.srs?.intervalDays) || 0}d · EF {Number(editCard?.srs?.easeFactor) || 2.5}
              </p>
            </div>
            <p className="text-xs text-slate-400">
              自评判分不走 AI；若要重置到期日，可删除后重新生成。
            </p>
          </div>
        }
      />
    </div>
  )
}

export default Review
