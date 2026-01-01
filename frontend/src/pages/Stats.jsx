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
      {/* Bento Grid Top Row - Streak + Share */}
      <div className="bento-grid bento-grid-2-uneven">
        {/* Streak Card - Primary Gradient */}
        <Card className="bento-card bento-card-primary !border-0 !shadow-md">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-[0.2em] text-white/70 font-medium">Streak</p>
              <p className="display-font text-3xl font-semibold text-white mt-1">{streakDays}</p>
              <p className="text-xs text-white/70 mt-0.5">天连续打卡</p>
            </div>
            <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center">
              <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 16.121A3 3 0 1012.015 11L11 14H9c0 .768.293 1.536.879 2.121z" />
              </svg>
            </div>
          </div>
        </Card>

        {/* Share Actions */}
        <Card className="bento-card bento-card-compact !p-3">
          <div className="flex flex-col gap-2">
            <Button
              size="small"
              fill="outline"
              onClick={() => navigate('/settings')}
              disabled={loading}
              className="!rounded-full"
            >
              修改周目标
            </Button>
            <Button
              size="small"
              fill="outline"
              onClick={handleShare}
              disabled={loading || streakDays === 0}
              className="!rounded-full"
            >
              <Share2 size={14} className="mr-1" />
              分享
            </Button>
          </div>
        </Card>
      </div>

      {/* Week Overview Card */}
      <Card className="bento-card">
        <div className="flex items-center justify-between p-3 pb-2">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center">
              <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <p className="text-xs font-semibold text-slate-700 uppercase tracking-wider">本周学习</p>
          </div>
          <div className="text-right">
            <p className="display-font text-lg font-semibold text-slate-900">
              {weeklyMinutes}/{weeklyGoal}
            </p>
            <p className="text-[10px] text-slate-400">{weekRange.start.format('MM-DD')} ~ {weekRange.end.format('MM-DD')}</p>
          </div>
        </div>

        <div className="px-3 pb-3">
          {/* Progress Bar */}
          <div className="mb-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-slate-400">周目标进度</span>
              <span className="text-xs font-semibold text-emerald-600">{Math.round(weeklyProgress * 100)}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-500"
                style={{ width: `${weeklyProgress * 100}%` }}
              />
            </div>
          </div>

          {/* Week Bar Chart */}
          <div className="h-24">
            <div className="grid h-full grid-cols-7 gap-1.5">
              {weekDays.map((day) => (
                <div key={day.key} className="flex flex-col items-center justify-end gap-1">
                  <div className="flex h-full w-full items-end">
                    <div
                      className="w-full rounded-t-md bg-gradient-to-t from-emerald-500 to-emerald-400"
                      style={{ height: `${Math.max(4, Math.round((day.minutes / weekMax) * 100))}%` }}
                      title={`${day.key} · ${day.minutes} min`}
                    />
                  </div>
                  <span className="text-[9px] font-medium text-slate-400">{day.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Card>

      {/* Month Summary Card */}
      <Card className="bento-card">
        <div className="flex items-center justify-between p-3 pb-2">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
              <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <p className="text-xs font-semibold text-slate-700 uppercase tracking-wider">本月概览</p>
          </div>
          <Button size="mini" onClick={() => navigate('/calendar')} disabled={loading} className="!rounded-full">
            看日历
          </Button>
        </div>

        <div className="px-3 pb-3">
          <div className="grid grid-cols-3 gap-2 mb-3">
            <div className="bg-slate-50 rounded-xl p-2.5 text-center">
              <p className="stat-value text-lg">{monthSummary.total}</p>
              <p className="text-[10px] text-slate-400 mt-0.5">总分钟</p>
            </div>
            <div className="bg-slate-50 rounded-xl p-2.5 text-center">
              <p className="stat-value text-lg">{monthSummary.activeDays}</p>
              <p className="text-[10px] text-slate-400 mt-0.5">活跃天</p>
            </div>
            <div className="bg-slate-50 rounded-xl p-2.5 text-center">
              <p className="stat-value text-lg">{monthSummary.avg}</p>
              <p className="text-[10px] text-slate-400 mt-0.5">日均</p>
            </div>
          </div>

          <div className="bg-emerald-50 rounded-xl px-3 py-2 flex items-center justify-between">
            <span className="text-xs text-emerald-700">最佳日</span>
            <span className="text-sm font-semibold text-emerald-800">
              {monthSummary.best.date || '—'}（{monthSummary.best.minutes} min）
            </span>
          </div>
        </div>
      </Card>

      {/* AI Report Card */}
      <Card className="bento-card !bg-gradient-to-br from-violet-50 to-indigo-50 !border-violet-100">
        <div className="flex items-center gap-2 p-3 pb-2">
          <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center">
            <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <p className="text-xs font-semibold text-violet-700 uppercase tracking-wider">AI 报告</p>
        </div>

        <div className="px-3 pb-3">
          <p className="text-sm text-slate-600">
            基于你本周/本月的学习记录生成总结与建议
          </p>
          <div className="mt-3 flex items-center gap-2">
            <Button
              block
              color="primary"
              onClick={() => requestReport('weekly')}
              disabled={reportLoading}
              className="!rounded-full"
            >
              {reportLoading ? '生成中...' : '生成周报'}
            </Button>
            <Button
              block
              fill="outline"
              onClick={() => requestReport('monthly')}
              disabled={reportLoading}
              className="!rounded-full"
            >
              {reportLoading ? '生成中...' : '生成月报'}
            </Button>
          </div>
          {reportData?.report ? (
            <p className="mt-2 text-[10px] text-slate-400">
              最近一次：{reportData.type} · {reportData.periodStart} ~ {reportData.periodEnd}
            </p>
          ) : null}
        </div>
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
