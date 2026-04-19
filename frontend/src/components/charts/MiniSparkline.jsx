import { LineChart, Line, ResponsiveContainer } from 'recharts'

export default function MiniSparkline({ data = [], height = 32, color = '#6366f1' }) {
  if (data.length < 2) return null

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
        <Line
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={1.5}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
