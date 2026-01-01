import { useEffect, useMemo, useState } from 'react'
import dayjs from 'dayjs'
import { Button, Card, Popup, ProgressBar, Toast } from 'antd-mobile'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { getStudyLogs, getTaskOccurrences } from '../services/api.js'

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
    const data = []
    for (let i = 6; i >= 0; i -= 1) {
      const date = today.subtract(i, 'day').format('YYYY-MM-DD')
      data.push(Number(logMap.get(date)?.duration) || 0)
    }
    const max = Math.max(...data, 1)
    return { data, max }
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
      <Card title="学习总览" className="rounded-2xl border border-slate-100 bg-white shadow-sm">
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="space-y-1">
            <p className="text-xs text-slate-500">本月总时长</p>
            <p className="text-lg font-semibold text-slate-800">{monthStats.totalMinutes} 分钟</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-slate-500">日均</p>
            <p className="text-lg font-semibold text-slate-800">{monthStats.avgMinutes} 分钟</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-slate-500">最佳日</p>
            <p className="text-lg font-semibold text-slate-800">
              {monthStats.bestDuration ? `${monthStats.bestDuration} 分钟` : '—'}
            </p>
            <p className="text-[11px] text-slate-400">{monthStats.bestDate || '暂无'}</p>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <div className="rounded-xl bg-emerald-50 px-3 py-2">
            <p className="text-[11px] text-emerald-600">连续打卡</p>
            <p className="text-base font-semibold text-emerald-700">{streak} 天</p>
          </div>
          <div className="flex-1">
            <div className="mb-1 flex items-center justify-between text-[11px] text-slate-500">
              <span>本周进度</span>
              <span>
                {weeklyProgress.minutes} / {WEEKLY_GOAL_MINUTES} 分钟
              </span>
            </div>
            <ProgressBar percent={weeklyProgress.percent} />
          </div>
        </div>
        <div className="mt-3 flex items-end gap-1">
          {recentTrend.data.map((val, idx) => {
            const height = recentTrend.max ? Math.max(12, Math.round((val / recentTrend.max) * 48)) : 12
            return (
              <div key={idx} className="flex-1">
                <div
                  className="w-full rounded-t-md bg-emerald-400"
                  style={{ height, opacity: 0.3 + (val > 0 ? 0.5 : 0) }}
                />
                <p className="mt-1 text-center text-[11px] text-slate-400">{idx === 6 ? '今' : ''}</p>
              </div>
            )
          })}
        </div>
      </Card>

      <Card
        title="Calendar Heatmap"
        extra={
          <div className="flex items-center gap-2">
            <Button
              size="small"
              fill="outline"
              onClick={() => setMonthCursor((prev) => prev.subtract(1, 'month'))}
              disabled={loading}
            >
              <ChevronLeft size={16} />
            </Button>
            <div className="min-w-[6.5rem] text-center text-sm font-semibold text-slate-700">
              {monthCursor.format('YYYY-MM')}
            </div>
            <Button size="small" fill="outline" onClick={handleToday} disabled={loading}>
              今天
            </Button>
            <Button
              size="small"
              fill="outline"
              onClick={() => setMonthCursor((prev) => prev.add(1, 'month'))}
              disabled={loading}
            >
              <ChevronRight size={16} />
            </Button>
          </div>
        }
        className="rounded-2xl border border-slate-100 bg-white shadow-sm"
      >
        <div className="mb-1 grid grid-cols-7 gap-4 text-center text-[11px] font-medium text-slate-400">
          {WEEKDAY_HEADERS.map((label) => (
            <span key={label}>{label}</span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-4">
          {days.map((day) => (
            <button
              key={day.date}
              type="button"
              onClick={() => handleSelect(day)}
              disabled={!day.inMonth || loading}
              className={`flex h-8 w-full items-center justify-center rounded-[4px] text-xs font-semibold ${
                day.inMonth ? 'text-slate-700' : 'text-slate-300'
              }`}
              style={{ backgroundColor: getHeatColor(day.duration) }}
            >
              {day.label}
            </button>
          ))}
        </div>
        <p className="mt-3 text-xs text-slate-400">绿色越深代表当日学习时长越多。</p>
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
