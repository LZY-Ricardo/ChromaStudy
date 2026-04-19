import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'

const DAY_COLORS = ['#6366f1', '#8b5cf6', '#a78bfa', '#818cf8', '#6366f1', '#8b5cf6', '#a78bfa']
const DAY_NAMES = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const { day, minutes } = payload[0].payload
  return (
    <div className="rounded-lg bg-white px-3 py-2 shadow-lg border border-slate-100 text-xs">
      <p className="font-semibold text-slate-700">{day}</p>
      <p className="text-violet-600">{minutes} min</p>
    </div>
  )
}

export default function DayDistributionChart({ data = [], height = 160 }) {
  const pieData = data.map((d, i) => ({
    ...d,
    day: DAY_NAMES[i] || d.label,
  }))

  const hasData = pieData.some((d) => d.minutes > 0)
  if (!hasData) {
    return <div className="flex items-center justify-center text-xs text-slate-400" style={{ height }}>暂无数据</div>
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie
          data={pieData}
          dataKey="minutes"
          nameKey="day"
          cx="50%"
          cy="50%"
          innerRadius={36}
          outerRadius={60}
          paddingAngle={2}
          cornerRadius={4}
        >
          {pieData.map((entry, index) => (
            <Cell key={entry.day} fill={entry.minutes > 0 ? DAY_COLORS[index] : '#f1f5f9'} />
          ))}
        </Pie>
        <Tooltip content={<CustomTooltip />} />
      </PieChart>
    </ResponsiveContainer>
  )
}
