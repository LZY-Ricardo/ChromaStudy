import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'

const COLORS = ['#34d399', '#34d399', '#34d399', '#34d399', '#34d399', '#34d399', '#6ee7b7']

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const { label, minutes } = payload[0].payload
  return (
    <div className="rounded-lg bg-white px-3 py-2 shadow-lg border border-slate-100 text-xs">
      <p className="font-semibold text-slate-700">{label}</p>
      <p className="text-emerald-600">{minutes} min</p>
    </div>
  )
}

export default function WeeklyBarChart({ data = [], height = 96 }) {
  if (!data.length) {
    return <div className="flex items-center justify-center text-xs text-slate-400" style={{ height }}>暂无数据</div>
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
        <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
        <YAxis hide />
        <Tooltip content={<CustomTooltip />} cursor={false} />
        <Bar dataKey="minutes" radius={[4, 4, 0, 0]}>
          {data.map((entry, index) => (
            <Cell key={entry.key} fill={entry.minutes > 0 ? COLORS[index] : '#f1f5f9'} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
