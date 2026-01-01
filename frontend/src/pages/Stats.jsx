import { useEffect, useMemo, useState } from 'react'
import dayjs from 'dayjs'
import { Button, Card, Dialog, Toast } from 'antd-mobile'
import { Share2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { generateReport, getStudyLogs } from '../services/api.js'
import { loadWeeklyGoal } from '../utils/habit.js'
import { loadAiConfig } from '../utils/storage.js'
import ShareDialog from '../components/ShareCard.jsx'

function Stats({ user, syncTick }) {
  const navigate = useNavigate()
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(false)
  const [reportLoading, setReportLoading] = useState(false)
  const [reportData, setReportData] = useState(null)
  const [shareOpen, setShareOpen] = useState(false)

  useEffect(() => {
    if (!user?.id) return
    const load = async () => {
      setLoading(true)
      try {
        const data = await getStudyLogs(user.id)
        setLogs(Array.isArray(data) ? data : [])
      } catch {
        Toast.show({ content: '统计数据加载失败' })
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [syncTick, user?.id])

  const weekRange = useMemo(() => {
    const now = dayjs()
    const day = now.day() // 0 (Sun) - 6 (Sat)
    const diff = (day + 6) % 7 // Monday=0
    const start = now.subtract(diff, 'day').startOf('day')
    return {
      start,
      end: start.add(6, 'day').endOf('day'),
    }
  }, [])

  const weekDays = useMemo(() => {
    const map = new Map(logs.map((log) => [log.date, Number(log.duration) || 0]))
    const days = []
    for (let i = 0; i < 7; i += 1) {
      const d = weekRange.start.add(i, 'day')
      const key = d.format('YYYY-MM-DD')
      days.push({
        key,
        label: d.format('dd'),
        minutes: map.get(key) || 0,
      })
    }
    return days
  }, [logs, weekRange])

  const weeklyMinutes = useMemo(
    () => weekDays.reduce((sum, day) => sum + (day.minutes || 0), 0),
    [weekDays]
  )

  const weeklyGoal = loadWeeklyGoal(user?.id)
  const weeklyProgress = weeklyGoal > 0 ? Math.min(1, weeklyMinutes / weeklyGoal) : 0

  const streakDays = useMemo(() => {
    const map = new Map(logs.map((log) => [log.date, log]))
    let count = 0
    let cursor = dayjs()
    while (true) {
      const key = cursor.format('YYYY-MM-DD')
      const log = map.get(key)
      if (!log || !log.duration || log.duration <= 0) break
      count += 1
      cursor = cursor.subtract(1, 'day')
    }
    return count
  }, [logs])

  const monthRange = useMemo(() => {
    const now = dayjs()
    return {
      start: now.startOf('month'),
      end: now.endOf('month'),
      label: now.format('YYYY-MM'),
    }
  }, [])

  const monthSummary = useMemo(() => {
    const map = new Map(logs.map((log) => [log.date, Number(log.duration) || 0]))
    let total = 0
    let activeDays = 0
    let best = { date: '', minutes: 0 }

    const daysInMonth = monthRange.end.date()
    for (let i = 0; i < daysInMonth; i += 1) {
      const d = monthRange.start.add(i, 'day')
      const key = d.format('YYYY-MM-DD')
      const minutes = map.get(key) || 0
      total += minutes
      if (minutes > 0) {
        activeDays += 1
      }
      if (minutes > best.minutes) {
        best = { date: key, minutes }
      }
    }

    const avg = activeDays > 0 ? Math.round(total / activeDays) : 0
    return { total, activeDays, best, avg }
  }, [logs, monthRange])

  const weekMax = Math.max(1, ...weekDays.map((day) => day.minutes))

  const requestReport = async (type) => {
    if (!user?.id) return
    setReportLoading(true)
    try {
      const payload =
        type === 'monthly'
          ? {
              type: 'monthly',
              periodStart: monthRange.start.format('YYYY-MM-DD'),
              periodEnd: monthRange.end.format('YYYY-MM-DD'),
              ai: loadAiConfig(),
            }
          : {
              type: 'weekly',
              periodStart: weekRange.start.format('YYYY-MM-DD'),
              periodEnd: weekRange.end.format('YYYY-MM-DD'),
              ai: loadAiConfig(),
            }

      const data = await generateReport(user.id, payload)
      setReportData(data)
      Dialog.alert({
        title: type === 'monthly' ? 'AI 月报' : 'AI 周报',
        content: (
          <div className="space-y-3">
            <p className="whitespace-pre-wrap text-sm text-slate-700">{data?.report ?? ''}</p>
            <Button
              size="small"
              fill="outline"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(String(data?.report ?? ''))
                  Toast.show({ content: '已复制' })
                } catch {
                  Toast.show({ content: '复制失败' })
                }
              }}
            >
              复制
            </Button>
          </div>
        ),
        confirmText: '知道了',
      })
    } catch {
      Toast.show({ content: '生成报告失败，请稍后重试' })
    } finally {
      setReportLoading(false)
    }
  }

  // 准备分享数据（使用今日数据）
  const getShareData = () => {
    const today = dayjs().format('YYYY-MM-DD')
    const todayLog = logs.find((log) => log.date === today)
    return {
      date: today,
      duration: todayLog?.duration || 0,
      streak: streakDays,
      completedTasks: [], // Stats 页面没有任务数据
      content: todayLog?.content || '',
    }
  }

  const handleShare = () => {
    setShareOpen(true)
  }

  return (
    <div className="space-y-4">
      <Card className="rounded-2xl border border-slate-100 bg-white shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Streak</p>
            <p className="display-font text-3xl font-semibold text-slate-900">{streakDays} days</p>
            <p className="mt-1 text-xs text-slate-500">口径：当日 duration &gt; 0</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="small"
              fill="outline"
              onClick={() => navigate('/settings')}
              disabled={loading}
            >
              修改周目标
            </Button>
            <Button
              size="small"
              fill="outline"
              onClick={handleShare}
              disabled={loading || streakDays === 0}
            >
              <Share2 size={16} />
            </Button>
          </div>
        </div>
      </Card>

      <Card title="This Week" className="rounded-2xl border border-slate-100 bg-white shadow-sm">
        <div className="flex items-end justify-between">
          <div>
            <p className="display-font text-2xl font-semibold text-slate-900">
              {weeklyMinutes}/{weeklyGoal} min
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {weekRange.start.format('YYYY-MM-DD')} ~ {weekRange.end.format('YYYY-MM-DD')}
            </p>
          </div>
          <div className="text-sm font-semibold text-slate-700">
            {Math.round(weeklyProgress * 100)}%
          </div>
        </div>

        <div className="mt-4 h-3 w-full overflow-hidden rounded-full bg-slate-100/80 shadow-inner">
          <div
            className="h-full rounded-full"
            style={{
              width: `${weeklyProgress * 100}%`,
              background: 'linear-gradient(90deg, var(--cs-success-2), var(--cs-success-3))',
            }}
          />
        </div>

        <div className="mt-4 h-28">
          <div className="grid h-full grid-cols-7 gap-2">
            {weekDays.map((day) => (
              <div key={day.key} className="flex flex-col items-center justify-end gap-2">
                <div className="flex h-full w-full items-end">
                  <div
                    className="w-full rounded-lg bg-emerald-500/90"
                    style={{ height: `${Math.max(6, Math.round((day.minutes / weekMax) * 100))}%` }}
                    title={`${day.key} · ${day.minutes} min`}
                  />
                </div>
                <div className="text-[10px] font-semibold text-slate-500">{day.label}</div>
              </div>
            ))}
          </div>
        </div>
      </Card>

      <Card title="This Month" className="rounded-2xl border border-slate-100 bg-white shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-400">{monthRange.label}</p>
            <p className="display-font text-2xl font-semibold text-slate-900">
              {monthSummary.total} min
            </p>
            <p className="mt-1 text-xs text-slate-500">
              活跃天数 {monthSummary.activeDays} · 活跃日均 {monthSummary.avg} 分钟
            </p>
          </div>
          <Button size="small" onClick={() => navigate('/calendar')} disabled={loading}>
            看日历
          </Button>
        </div>

        <div className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
          <p>
            最佳日：{monthSummary.best.date || '—'}（{monthSummary.best.minutes} 分钟）
          </p>
        </div>
      </Card>

      <Card title="AI 周报 / 月报" className="rounded-2xl border border-slate-100 bg-white shadow-sm">
        <p className="text-sm text-slate-500">
          基于你本周/本月的学习记录生成总结与建议（不保存到数据库）。
        </p>
        <div className="mt-4 flex items-center gap-3">
          <Button block color="primary" onClick={() => requestReport('weekly')} disabled={reportLoading}>
            {reportLoading ? '生成中...' : '生成周报'}
          </Button>
          <Button block fill="outline" onClick={() => requestReport('monthly')} disabled={reportLoading}>
            {reportLoading ? '生成中...' : '生成月报'}
          </Button>
        </div>
        {reportData?.report ? (
          <p className="mt-3 line-clamp-3 text-xs text-slate-400">
            最近一次：{reportData.type} {reportData.periodStart}~{reportData.periodEnd}
          </p>
        ) : null}
      </Card>

      <ShareDialog
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        data={getShareData()}
      />
    </div>
  )
}

export default Stats
