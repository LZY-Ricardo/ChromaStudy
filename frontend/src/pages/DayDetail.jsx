import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Button, Card, Dialog, Input, TextArea, Toast } from 'antd-mobile'
import { ArrowLeft } from 'lucide-react'
import {
  checkin,
  generateAiFeedback,
  generateReviewQuestions,
  getStudyLogByDate,
} from '../services/api.js'
import { loadAiConfig } from '../utils/storage.js'
import { loadReview, saveReview } from '../utils/review.js'

function DayDetail({ user }) {
  const navigate = useNavigate()
  const { date = '' } = useParams()
  const normalizedDate = String(date).trim()
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(normalizedDate)

  const [log, setLog] = useState(null)
  const [loading, setLoading] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [duration, setDuration] = useState('')
  const [content, setContent] = useState('')
  const pollingRef = useRef(false)
  const [reviewQuestions, setReviewQuestions] = useState([])
  const [reviewAnswers, setReviewAnswers] = useState({})
  const [reviewWorking, setReviewWorking] = useState(false)

  const load = async () => {
    if (!user?.id || !validDate) return
    setLoading(true)
    try {
      const data = await getStudyLogByDate(user.id, normalizedDate)
      setLog(data)
    } catch {
      Toast.show({ content: '加载失败，请稍后重试' })
    } finally {
      setLoading(false)
    }
  }

  const pollFeedbackIfNeeded = async () => {
    if (!user?.id || !validDate) return
    if (pollingRef.current) return

    const shouldPoll =
      log && log.duration > 0 && log.aiFeedback === null
    if (!shouldPoll) return

    pollingRef.current = true
    try {
      for (let attempt = 0; attempt < 12; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 2000))
        const latest = await getStudyLogByDate(user.id, normalizedDate)
        if (latest?.aiFeedback && latest.aiFeedback.trim()) {
          setLog(latest)
          return
        }
      }
    } catch {
      // ignore
    } finally {
      pollingRef.current = false
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, normalizedDate])

  useEffect(() => {
    if (!user?.id || !validDate) return
    const stored = loadReview(user.id, normalizedDate)
    if (stored?.questions && Array.isArray(stored.questions)) {
      setReviewQuestions(stored.questions)
      setReviewAnswers(stored.answers && typeof stored.answers === 'object' ? stored.answers : {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, normalizedDate])

  useEffect(() => {
    pollFeedbackIfNeeded()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [log?.aiFeedback, log?.duration])

  const openEditor = () => {
    setDuration(log ? String(log.duration) : '')
    setContent(log?.content ?? '')
    setEditOpen(true)
  }

  const submit = async () => {
    const minutes = Number.parseInt(duration, 10)
    if (!Number.isFinite(minutes) || minutes <= 0) {
      Toast.show({ content: '请输入学习时长（分钟）' })
      return
    }
    if (!content.trim()) {
      Toast.show({ content: '请输入学习内容' })
      return
    }
    setLoading(true)
    try {
      const updated = await checkin({
        userId: user.id,
        date: normalizedDate,
        duration: minutes,
        content: content.trim(),
        ai: loadAiConfig(),
      })
      setLog(updated)
      setEditOpen(false)
      Toast.show({ content: '已保存，AI 点评生成中' })
    } catch {
      Toast.show({ content: '保存失败，请稍后重试' })
    } finally {
      setLoading(false)
    }
  }

  const generateFeedbackNow = async () => {
    if (!user?.id || !validDate) return
    setLoading(true)
    try {
      const updated = await generateAiFeedback(user.id, normalizedDate, loadAiConfig())
      setLog(updated)
      Toast.show({ content: updated?.aiFeedback?.trim() ? '点评已生成' : '点评生成失败' })
    } catch {
      Toast.show({ content: '生成点评失败' })
    } finally {
      setLoading(false)
    }
  }

  const generateReview = async () => {
    if (!user?.id || !validDate) return
    if (!log?.duration || log.duration <= 0) {
      Toast.show({ content: '当天还没有学习记录' })
      return
    }
    setReviewWorking(true)
    try {
      const questions = await generateReviewQuestions(user.id, normalizedDate, loadAiConfig())
      if (!Array.isArray(questions) || questions.length === 0) {
        Toast.show({ content: '未生成复盘问题，请稍后再试' })
        return
      }
      const answers = {}
      questions.forEach((_, index) => {
        answers[index] = ''
      })
      setReviewQuestions(questions)
      setReviewAnswers(answers)
      saveReview(user.id, normalizedDate, { questions, answers, updatedAt: Date.now() })
      Toast.show({ content: '复盘问题已生成' })
    } catch {
      Toast.show({ content: '生成复盘问题失败' })
    } finally {
      setReviewWorking(false)
    }
  }

  const updateAnswer = (index, value) => {
    setReviewAnswers((prev) => {
      const next = { ...prev, [index]: value }
      saveReview(user.id, normalizedDate, {
        questions: reviewQuestions,
        answers: next,
        updatedAt: Date.now(),
      })
      return next
    })
  }

  if (!validDate) {
    return (
      <div className="space-y-4">
        <Card className="rounded-2xl border border-slate-100 bg-white shadow-sm">
          <p className="text-sm text-slate-600">无效日期</p>
        </Card>
        <Button block onClick={() => navigate(-1)}>
          返回
        </Button>
      </div>
    )
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
        <div className="text-sm font-semibold text-slate-900">{normalizedDate}</div>
        <button
          type="button"
          className="rounded-xl bg-white px-3 py-2 text-sm text-slate-600 shadow-sm"
          onClick={load}
          disabled={loading}
        >
          刷新
        </button>
      </div>

      <Card className="rounded-2xl border border-slate-100 bg-white shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Summary</p>
            <p className="mt-1 text-sm text-slate-600">
              {log ? `学习时长：${log.duration} 分钟` : '当天暂无打卡'}
            </p>
          </div>
          <Button size="small" color="primary" fill="outline" onClick={openEditor} disabled={loading}>
            {log ? '编辑' : '新增'}
          </Button>
        </div>
      </Card>

      <Card title="笔记" className="rounded-2xl border border-slate-100 bg-white shadow-sm">
        <p className="whitespace-pre-wrap text-sm text-slate-700">
          {log?.content ? log.content : '暂无内容'}
        </p>
      </Card>

      <Card title="AI 点评" className="rounded-2xl border border-slate-100 bg-white shadow-sm">
        {log?.duration > 0 ? (
          <div className="space-y-3">
            <p className="text-sm text-slate-700">
              {log.aiFeedback === null
                ? '点评生成中…'
                : log?.aiFeedback?.trim()
                  ? log.aiFeedback
                  : '尚未生成点评（可手动生成）'}
            </p>
            <div className="flex items-center gap-2">
              <Button size="small" fill="outline" onClick={generateFeedbackNow} disabled={loading}>
                生成点评
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-500">完成一次学习记录后才会生成点评。</p>
        )}
      </Card>

      <Card title="AI 复盘" className="rounded-2xl border border-slate-100 bg-white shadow-sm">
        {log?.duration > 0 ? (
          <div className="space-y-3">
            <p className="text-sm text-slate-500">
              生成 3 个复盘问题，回答后会本地保存（当前版本不写入数据库）。
            </p>
            <Button
              size="small"
              color="primary"
              fill="outline"
              onClick={generateReview}
              disabled={reviewWorking}
            >
              {reviewWorking
                ? '生成中...'
                : reviewQuestions.length
                  ? '重新生成复盘问题'
                  : '生成复盘问题'}
            </Button>

            {reviewQuestions.length ? (
              <div className="space-y-3">
                {reviewQuestions.map((q, index) => (
                  <div key={`${index}-${q}`} className="space-y-2 rounded-xl bg-slate-50 p-3">
                    <p className="text-sm font-semibold text-slate-700">
                      Q{index + 1}. {q}
                    </p>
                    <TextArea
                      placeholder="你的回答"
                      value={reviewAnswers[index] ?? ''}
                      onChange={(value) => updateAnswer(index, value)}
                      rows={3}
                      showCount
                      maxLength={240}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-400">还没有复盘问题，先生成一次。</p>
            )}
          </div>
        ) : (
          <p className="text-sm text-slate-500">当天有学习记录后才可复盘。</p>
        )}
      </Card>

      <Dialog
        visible={editOpen}
        title={log ? '编辑打卡' : '新增打卡'}
        closeOnMaskClick={!loading}
        closeOnAction={false}
        onClose={() => setEditOpen(false)}
        actions={[
          { key: 'cancel', text: '取消' },
          { key: 'submit', text: loading ? '保存中...' : '保存', bold: true, disabled: loading },
        ]}
        onAction={(action) => {
          if (action.key === 'submit') {
            submit()
          } else {
            setEditOpen(false)
          }
        }}
        content={
          <div className="space-y-3">
            <Input
              type="number"
              inputMode="numeric"
              placeholder="学习时长（分钟）"
              value={duration}
              onChange={setDuration}
              clearable
            />
            <TextArea
              placeholder="今天学习了什么？"
              value={content}
              onChange={setContent}
              rows={6}
              showCount
              maxLength={500}
            />
          </div>
        }
      />
    </div>
  )
}

export default DayDetail
