import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const { week, minutes } = payload[0].payload
  return (
    <div className="rounded-lg bg-white px-3 py-2 shadow-lg border border-slate-100 text-xs">
      <p className="font-semibold text-slate-700">{week}</p>
      <p className="text-indigo-600">{minutes} min</p>
    </div>
  )
}

export default function WeeklyTrendChart({ data = [], height = 120 }) {
  if (!data.length) {
    return <div className="flex items-center justify-center text-xs text-slate-400" style={{ height }}>暂无数据</div>
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
        <defs>
          <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="week" tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
        <YAxis hide />
        <Tooltip content={<CustomTooltip />} />
        <Area
          type="monotone"
          dataKey="minutes"
          stroke="#6366f1"
          strokeWidth={2}
          fill="url(#trendGradient)"
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
