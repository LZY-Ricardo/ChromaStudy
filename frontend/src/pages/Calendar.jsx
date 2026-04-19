import { useEffect, useMemo, useState } from 'react'
import dayjs from 'dayjs'
import { Button, Card, Popup, ProgressBar, Toast } from 'antd-mobile'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { getStudyLogs, getTaskOccurrences } from '../services/api.js'
import WeeklyBarChart from '../components/charts/WeeklyBarChart.jsx'

function getHeatColor(duration) {
  if (duration <= 0) return 'rgba(15, 23, 42, 0.04)'
  if (duration <= 60) return 'var(--cs-success-1)'
  if (duration <= 180) return 'var(--cs-success-2)'
  return 'var(--cs-success-3)'
}

const WEEKLY_GOAL_MINUTES = 600
const WEEKDAY_HEADERS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function Calendar({ user, syncTick }) {
  const navigate = useNavigate()
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(false)
  const [monthCursor, setMonthCursor] = useState(() => dayjs().startOf('month'))
  const [selectedDay, setSelectedDay] = useState('')
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailTasks, setDetailTasks] = useState([])
  const [detailLog, setDetailLog] = useState(null)

  useEffect(() => {
    if (!user?.id) {
      return
    }
    const load = async () => {
      setLoading(true)
      try {
        const data = await getStudyLogs(user.id)
        setLogs(data)
      } catch {
        Toast.show({ content: '日历数据加载失败' })
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [syncTick, user?.id])

  const logMap = useMemo(() => {
    return new Map(logs.map((log) => [log.date, log]))
  }, [logs])

  const monthStats = useMemo(() => {
    const month = monthCursor.month()
    const year = monthCursor.year()
    const monthLogs = logs.filter((log) => {
      const d = dayjs(log.date)
      return d.year() === year && d.month() === month
    })
    const totalMinutes = monthLogs.reduce((sum, item) => sum + (Number(item.duration) || 0), 0)
    const daysInMonth = monthCursor.daysInMonth()
    const avgMinutes = daysInMonth ? Math.round(totalMinutes / daysInMonth) : 0
    const best = monthLogs.reduce(
      (acc, item) =>
        (Number(item.duration) || 0) > acc.duration
          ? { date: item.date, duration: Number(item.duration) || 0 }
          : acc,
      { date: '', duration: 0 }
    )
    return {
      totalMinutes,
      avgMinutes,
      bestDate: best.date,
      bestDuration: best.duration,
    }
  }, [logs, monthCursor])

  const streak = useMemo(() => {
    let count = 0
    let cursor = dayjs()
    while (true) {
      const key = cursor.format('YYYY-MM-DD')
      const log = logMap.get(key)
      if (log && Number(log.duration) > 0) {
        count += 1
        cursor = cursor.subtract(1, 'day')
      } else {
        break
      }
    }
    return count
  }, [logMap])

  const weeklyProgress = useMemo(() => {
    const start = dayjs().startOf('week')
    const end = dayjs().endOf('week')
    const minutes = logs
      .filter((log) => {
        const d = dayjs(log.date)
        return (d.isAfter(start) || d.isSame(start, 'day')) && (d.isBefore(end) || d.isSame(end, 'day'))
      })
      .reduce((sum, item) => sum + (Number(item.duration) || 0), 0)
    const percent = WEEKLY_GOAL_MINUTES ? Math.min(100, Math.round((minutes / WEEKLY_GOAL_MINUTES) * 100)) : 0
    return { minutes, percent }
  }, [logs])

  const recentTrend = useMemo(() => {
    const today = dayjs()
    const chartData = []
    const raw = []
    for (let i = 6; i >= 0; i -= 1) {
      const date = today.subtract(i, 'day')
      const key = date.format('YYYY-MM-DD')
      const val = Number(logMap.get(key)?.duration) || 0
      raw.push(val)
      chartData.push({ key, label: i === 6 ? '今' : date.format('dd'), minutes: val })
    }
    return { raw, chartData, max: Math.max(...raw, 1) }
  }, [logMap])

  const days = useMemo(() => {
    const startOfMonth = monthCursor.startOf('month')
    const endOfMonth = monthCursor.endOf('month')
    const startDate = startOfMonth.startOf('week')
    const endDate = endOfMonth.endOf('week')
    const result = []
    let cursor = startDate
    while (cursor.isBefore(endDate) || cursor.isSame(endDate, 'day')) {
      const date = cursor.format('YYYY-MM-DD')
      const log = logMap.get(date)
      result.push({
        date,
        label: cursor.format('D'),
        duration: log?.duration ?? 0,
        feedback: log?.aiFeedback,
        inMonth: cursor.month() === startOfMonth.month(),
      })
      cursor = cursor.add(1, 'day')
    }
    return result
  }, [logMap, monthCursor])

  useEffect(() => {
    if (!selectedDay || !user?.id) return
    let active = true
    const load = async () => {
      setDetailLoading(true)
      try {
        const items = await getTaskOccurrences(user.id, selectedDay, selectedDay)
        if (active) {
          setDetailTasks(items)
        }
      } catch {
        if (active) {
          Toast.show({ content: '任务数据加载失败' })
        }
      } finally {
        if (active) {
          setDetailLoading(false)
        }
      }
    }
    load()
    return () => {
      active = false
    }
  }, [selectedDay, user?.id])

  useEffect(() => {
    if (!selectedDay) return
    setDetailLog(logMap.get(selectedDay) ?? null)
  }, [logMap, selectedDay])

  const handleSelect = (day) => {
    setSelectedDay(day.date)
    setDetailOpen(true)
  }

  const handleToday = () => {
    setMonthCursor(dayjs().startOf('month'))
  }

  const selectedDateLabel = selectedDay ? dayjs(selectedDay).format('YYYY年MM月DD日 ddd') : ''
  const currentLog = detailLog ?? (selectedDay ? { date: selectedDay, duration: 0, content: '', aiFeedback: '' } : null)

  return (
    <div className="space-y-4">
      {/* Bento Grid Stats Cards */}
      <div className="bento-grid bento-grid-3">
        {/* Month Total */}
        <Card className="bento-card bento-card-compact !p-3">
          <p className="stat-label text-slate-400">本月总时长</p>
          <p className="stat-value text-2xl mt-1">{monthStats.totalMinutes}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">分钟</p>
        </Card>

        {/* Daily Average */}
        <Card className="bento-card bento-card-compact !p-3">
          <p className="stat-label text-slate-400">日均学习</p>
          <p className="stat-value text-2xl mt-1">{monthStats.avgMinutes}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">分钟/天</p>
        </Card>

        {/* Best Day */}
        <Card className="bento-card bento-card-compact !p-3">
          <p className="stat-label text-slate-400">最佳日</p>
          <p className="stat-value text-2xl mt-1">{monthStats.bestDuration || '—'}</p>
          <p className="text-[10px] text-slate-400 mt-0.5 truncate">{monthStats.bestDate || '暂无'}</p>
        </Card>
      </div>

      {/* Streak & Progress Row */}
      <div className="bento-grid bento-grid-2">
        {/* Streak Card */}
        <Card className="bento-card bento-card-success !p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-white/80">连续打卡</p>
              <p className="display-font text-3xl font-semibold text-white mt-1">{streak}</p>
              <p className="text-xs text-white/70 mt-0.5">天</p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 16.121A3 3 0 1012.015 11L11 14H9c0 .768.293 1.536.879 2.121z" />
              </svg>
            </div>
          </div>
        </Card>

        {/* Weekly Progress Card */}
        <Card className="bento-card !p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="stat-label text-slate-400">本周进度</p>
            <p className="text-xs text-slate-500">
              {weeklyProgress.minutes} / {WEEKLY_GOAL_MINUTES}
            </p>
          </div>
          <ProgressBar percent={weeklyProgress.percent} />
          <WeeklyBarChart data={recentTrend.chartData} height={36} />
        </Card>
      </div>

      {/* Calendar Heatmap Card */}
      <Card className="bento-card">
        <div className="flex items-center justify-between p-3 pb-2">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center">
              <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <p className="text-xs font-semibold text-slate-700 uppercase tracking-wider">学习日历</p>
          </div>
          <div className="flex items-center gap-1">
            <Button
              size="mini"
              fill="outline"
              onClick={() => setMonthCursor((prev) => prev.subtract(1, 'month'))}
              disabled={loading}
              className="!rounded-full"
            >
              <ChevronLeft size={14} />
            </Button>
            <span className="min-w-[5rem] text-center text-sm font-semibold text-slate-700">
              {monthCursor.format('YYYY-MM')}
            </span>
            <Button size="mini" fill="outline" onClick={handleToday} disabled={loading} className="!rounded-full">
              今天
            </Button>
            <Button
              size="mini"
              fill="outline"
              onClick={() => setMonthCursor((prev) => prev.add(1, 'month'))}
              disabled={loading}
              className="!rounded-full"
            >
              <ChevronRight size={14} />
            </Button>
          </div>
        </div>
        <div className="px-3 pb-2">
          <div className="mb-2 grid grid-cols-7 gap-1 text-center text-[10px] font-medium text-slate-400">
            {WEEKDAY_HEADERS.map((label) => (
              <span key={label}>{label}</span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {days.map((day) => (
              <button
                key={day.date}
                type="button"
                onClick={() => handleSelect(day)}
                disabled={!day.inMonth || loading}
                className={`heatmap-cell !rounded-lg text-[11px] font-semibold ${
                  day.inMonth ? 'text-slate-700' : 'text-slate-300'
                }`}
                style={{ backgroundColor: getHeatColor(day.duration) }}
                title={day.inMonth ? `${day.date} · ${day.duration} min` : ''}
              >
                {day.label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[10px] text-slate-400 text-center">绿色越深代表当日学习时长越多</p>
        </div>
      </Card>

      <Popup
        visible={detailOpen}
        onMaskClick={() => setDetailOpen(false)}
        bodyStyle={{ borderTopLeftRadius: 16, borderTopRightRadius: 16 }}
      >
        <div className="space-y-3 p-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-800">{selectedDateLabel}</p>
              <p className="text-xs text-slate-500">点击跳转可补记/编辑当日记录</p>
            </div>
            <Button
              size="mini"
              color="primary"
              onClick={() => {
                if (selectedDay) {
                  navigate(`/day/${selectedDay}`)
                  setDetailOpen(false)
                }
              }}
            >
              去记录
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-slate-50 px-3 py-2">
              <p className="text-[11px] text-slate-500">学习时长</p>
              <p className="text-lg font-semibold text-slate-800">
                {currentLog?.duration ? `${currentLog.duration} 分钟` : '暂无'}
              </p>
            </div>
            <div className="rounded-xl bg-slate-50 px-3 py-2">
              <p className="text-[11px] text-slate-500">AI 反馈</p>
              <p className="text-sm text-slate-700">{currentLog?.aiFeedback ? '已生成' : '未生成'}</p>
            </div>
          </div>

          <div className="space-y-2 rounded-xl border border-slate-100 bg-white p-3">
            <p className="text-xs font-medium text-slate-700">今日笔记</p>
            <p className="text-sm text-slate-600">{currentLog?.content || '暂无记录，点击上方去记录补充'}</p>
          </div>

          <div className="space-y-2 rounded-xl border border-slate-100 bg-white p-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-slate-700">任务完成情况</p>
              {detailLoading && <span className="text-[11px] text-slate-400">加载中...</span>}
            </div>
            {detailTasks.length === 0 && !detailLoading && (
              <p className="text-sm text-slate-500">暂无任务或未完成记录。</p>
            )}
            <div className="space-y-2">
              {detailTasks.map((task) => (
                <div
                  key={`${task.taskId}-${task.occurrenceDate}`}
                  className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2"
                >
                  <p className="text-sm text-slate-700">{task.title}</p>
                  <span
                    className={`text-xs font-medium ${
                      task.isDone ? 'text-emerald-600' : 'text-slate-500'
                    }`}
                  >
                    {task.isDone ? '已完成' : '未完成'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Popup>
    </div>
  )
}

export default Calendar
