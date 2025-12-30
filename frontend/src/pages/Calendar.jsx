import { useEffect, useMemo, useState } from 'react'
import dayjs from 'dayjs'
import { Card, Dialog, Toast } from 'antd-mobile'
import { getStudyLogs } from '../services/api.js'

function getHeatColor(duration) {
  if (duration <= 0) return '#f3f4f6'
  if (duration <= 60) return '#dcfce7'
  if (duration <= 180) return '#86efac'
  return '#22c55e'
}

function Calendar({ user }) {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(false)

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
  }, [user])

  const logMap = useMemo(() => {
    return new Map(logs.map((log) => [log.date, log]))
  }, [logs])

  const days = useMemo(() => {
    const startOfMonth = dayjs().startOf('month')
    const endOfMonth = dayjs().endOf('month')
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
  }, [logMap])

  const handleSelect = (day) => {
    const title = day.date
    if (!day.duration) {
      Dialog.alert({
        title,
        content: '当天没有学习记录，明天继续加油。',
        confirmText: '知道了',
      })
      return
    }
    if (!day.feedback) {
      Dialog.alert({
        title,
        content: 'AI 点评生成中，请稍后再来查看。',
        confirmText: '知道了',
      })
      return
    }
    Dialog.alert({
      title,
      content: day.feedback,
      confirmText: '知道了',
    })
  }

  return (
    <div className="space-y-4">
      <Card title="Calendar Heatmap" className="rounded-2xl border border-slate-100 bg-white shadow-sm">
        <div className="grid grid-cols-7 gap-2">
          {days.map((day) => (
            <button
              key={day.date}
              type="button"
              onClick={() => handleSelect(day)}
              disabled={!day.inMonth || loading}
              className={`flex h-10 w-full items-center justify-center rounded-lg text-xs font-semibold ${
                day.inMonth ? 'text-slate-700' : 'text-slate-300'
              }`}
              style={{ backgroundColor: getHeatColor(day.duration) }}
            >
              {day.label}
            </button>
          ))}
        </div>
        <p className="mt-3 text-xs text-slate-400">
          绿色越深代表当日学习时长越多。
        </p>
      </Card>
    </div>
  )
}

export default Calendar
