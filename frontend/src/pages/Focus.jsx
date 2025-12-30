import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import { Button, Card, Dialog, Input, TextArea, Toast } from 'antd-mobile'
import { ArrowLeft, Pause, Play, RotateCcw } from 'lucide-react'
import { checkin, generateAiFeedback, getStudyLogByDate } from '../services/api.js'
import { loadAiConfig } from '../utils/storage.js'

const FOCUS_MINUTES = 25
const BREAK_MINUTES = 5

function formatTime(seconds) {
  const clamped = Math.max(0, Math.floor(seconds))
  const minutes = String(Math.floor(clamped / 60)).padStart(2, '0')
  const remain = String(clamped % 60).padStart(2, '0')
  return `${minutes}:${remain}`
}

function Focus({ user }) {
  const navigate = useNavigate()
  const todayKey = useMemo(() => dayjs().format('YYYY-MM-DD'), [])

  const [phase, setPhase] = useState('focus') // focus | break
  const [running, setRunning] = useState(false)
  const [secondsLeft, setSecondsLeft] = useState(FOCUS_MINUTES * 60)
  const [saving, setSaving] = useState(false)

  const [recordOpen, setRecordOpen] = useState(false)
  const [recordNote, setRecordNote] = useState('')
  const [todayLog, setTodayLog] = useState(null)

  const endAtRef = useRef(null)
  const tickRef = useRef(null)

  const phaseLabel = phase === 'focus' ? '专注' : '休息'
  const phaseMinutes = phase === 'focus' ? FOCUS_MINUTES : BREAK_MINUTES
  const totalSeconds = phaseMinutes * 60
  const progress = Math.min(1, Math.max(0, (totalSeconds - secondsLeft) / totalSeconds))

  const loadToday = async () => {
    if (!user?.id) return
    try {
      const data = await getStudyLogByDate(user.id, todayKey)
      setTodayLog(data)
    } catch {
      setTodayLog(null)
    }
  }

  useEffect(() => {
    loadToday()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  const stopTicker = () => {
    if (tickRef.current) {
      window.clearInterval(tickRef.current)
      tickRef.current = null
    }
  }

  const startTicker = () => {
    stopTicker()
    tickRef.current = window.setInterval(() => {
      if (!endAtRef.current) return
      const left = Math.max(0, Math.ceil((endAtRef.current - Date.now()) / 1000))
      setSecondsLeft(left)
      if (left <= 0) {
        stopTicker()
        setRunning(false)
        endAtRef.current = null
        if (phase === 'focus') {
          setRecordOpen(true)
        } else {
          Toast.show({ content: '休息结束，准备下一轮专注' })
          setPhase('focus')
          setSecondsLeft(FOCUS_MINUTES * 60)
        }
      }
    }, 250)
  }

  useEffect(() => {
    return () => stopTicker()
  }, [])

  const start = () => {
    if (running) return
    endAtRef.current = Date.now() + secondsLeft * 1000
    setRunning(true)
    startTicker()
  }

  const pause = () => {
    if (!running) return
    if (endAtRef.current) {
      const left = Math.max(0, Math.ceil((endAtRef.current - Date.now()) / 1000))
      setSecondsLeft(left)
    }
    endAtRef.current = null
    setRunning(false)
    stopTicker()
  }

  const reset = () => {
    endAtRef.current = null
    setRunning(false)
    stopTicker()
    setSecondsLeft(phase === 'focus' ? FOCUS_MINUTES * 60 : BREAK_MINUTES * 60)
  }

  const switchPhase = (nextPhase) => {
    endAtRef.current = null
    setRunning(false)
    stopTicker()
    setPhase(nextPhase)
    setSecondsLeft(nextPhase === 'focus' ? FOCUS_MINUTES * 60 : BREAK_MINUTES * 60)
  }

  const record = async ({ withFeedback }) => {
    if (!user?.id) return
    setSaving(true)
    try {
      const note = recordNote.trim()
      const content = note
        ? `番茄钟（25/5）专注：${note}`
        : `番茄钟专注 ${FOCUS_MINUTES} 分钟`

      const updated = await checkin({
        userId: user.id,
        date: todayKey,
        duration: FOCUS_MINUTES,
        content,
        mode: 'increment',
        generateFeedback: withFeedback,
        ai: loadAiConfig(),
      })
      setTodayLog(updated)
      setRecordOpen(false)
      setRecordNote('')

      if (withFeedback) {
        Toast.show({ content: '已记录，AI 点评生成中' })
      } else {
        Toast.show({ content: '已记录本次专注' })
      }

      setPhase('break')
      setSecondsLeft(BREAK_MINUTES * 60)
    } catch {
      Toast.show({ content: '记录失败，请稍后重试' })
    } finally {
      setSaving(false)
    }
  }

  const generateFeedbackNow = async () => {
    if (!user?.id) return
    if (!todayKey) return
    setSaving(true)
    try {
      const updated = await generateAiFeedback(user.id, todayKey, loadAiConfig())
      setTodayLog(updated)
      Toast.show({ content: updated?.aiFeedback?.trim() ? '点评已生成' : '点评生成失败' })
    } catch {
      Toast.show({ content: '生成点评失败' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm text-slate-600 shadow-sm"
          onClick={() => navigate(-1)}
        >
          <ArrowLeft size={18} />
          返回
        </button>
        <div className="text-sm font-semibold text-slate-900">Focus Timer</div>
        <button
          type="button"
          className="rounded-xl bg-white px-3 py-2 text-sm text-slate-600 shadow-sm"
          onClick={loadToday}
          disabled={saving}
        >
          刷新
        </button>
      </div>

      <Card className="rounded-2xl border border-slate-100 bg-white shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-400">{phaseLabel}</p>
            <p className="display-font text-5xl font-semibold text-slate-900">
              {formatTime(secondsLeft)}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              默认 {FOCUS_MINUTES}/{BREAK_MINUTES} · 今日累计{' '}
              {todayLog?.duration ? `${todayLog.duration} 分钟` : '0 分钟'}
            </p>
          </div>
          <div className="flex flex-col gap-2">
            {!running ? (
              <Button color="primary" onClick={start} disabled={saving}>
                <span className="inline-flex items-center gap-2">
                  <Play size={18} />
                  开始
                </span>
              </Button>
            ) : (
              <Button color="warning" onClick={pause} disabled={saving}>
                <span className="inline-flex items-center gap-2">
                  <Pause size={18} />
                  暂停
                </span>
              </Button>
            )}
            <Button fill="outline" onClick={reset} disabled={saving}>
              <span className="inline-flex items-center gap-2">
                <RotateCcw size={18} />
                重置
              </span>
            </Button>
          </div>
        </div>

        <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-emerald-500" style={{ width: `${progress * 100}%` }} />
        </div>

        <div className="mt-3 flex items-center gap-2">
          <Button
            size="small"
            fill={phase === 'focus' ? 'solid' : 'outline'}
            color="primary"
            onClick={() => switchPhase('focus')}
            disabled={saving || running}
          >
            专注
          </Button>
          <Button
            size="small"
            fill={phase === 'break' ? 'solid' : 'outline'}
            onClick={() => switchPhase('break')}
            disabled={saving || running}
          >
            休息
          </Button>
        </div>
      </Card>

      <Card title="AI 点评" className="rounded-2xl border border-slate-100 bg-white shadow-sm">
        {todayLog?.duration > 0 ? (
          <div className="space-y-3">
            <p className="text-sm text-slate-700">
              {todayLog.aiFeedback === null
                ? '点评生成中…'
                : todayLog?.aiFeedback?.trim()
                  ? todayLog.aiFeedback
                  : '尚未生成点评（可手动生成）'}
            </p>
            <Button size="small" fill="outline" onClick={generateFeedbackNow} disabled={saving}>
              生成点评
            </Button>
          </div>
        ) : (
          <p className="text-sm text-slate-500">累计学习时长大于 0 后可生成点评。</p>
        )}
      </Card>

      <Dialog
        visible={recordOpen}
        title="专注完成"
        closeOnMaskClick={!saving}
        closeOnAction={false}
        onClose={() => {
          if (saving) return
          setRecordOpen(false)
          setRecordNote('')
        }}
        actions={[
          { key: 'skip', text: '跳过记录' },
          { key: 'save', text: saving ? '记录中...' : '记录', disabled: saving },
          {
            key: 'saveWithAi',
            text: saving ? '记录中...' : '记录并生成点评',
            bold: true,
            disabled: saving,
          },
        ]}
        onAction={(action) => {
          if (action.key === 'save') {
            record({ withFeedback: false })
          }
          if (action.key === 'saveWithAi') {
            record({ withFeedback: true })
          }
          if (action.key === 'skip') {
            setRecordOpen(false)
            setRecordNote('')
            setPhase('break')
            setSecondsLeft(BREAK_MINUTES * 60)
          }
        }}
        content={
          <div className="space-y-3">
            <Input value={todayKey} readOnly />
            <TextArea
              placeholder="写一句专注内容（可选）"
              value={recordNote}
              onChange={setRecordNote}
              rows={3}
              showCount
              maxLength={120}
            />
          </div>
        }
      />
    </div>
  )
}

export default Focus

