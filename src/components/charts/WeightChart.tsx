import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine
} from 'recharts'
import type { ProgressEntry } from '../../types'

interface Props {
  entries: ProgressEntry[]
  startWeight?: number
  units?: 'metric' | 'imperial'
}

const CustomTooltip = ({ active, payload, label, units }: { active?: boolean; payload?: { value: number }[]; label?: string; units?: string }) => {
  if (active && payload?.length) {
    return (
      <div className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm">
        <p className="text-gray-400">{label}</p>
        <p className="text-brand-400 font-bold">{payload[0].value} {units === 'imperial' ? 'lbs' : 'kg'}</p>
      </div>
    )
  }
  return null
}

export default function WeightChart({ entries, startWeight, units = 'metric' }: Props) {
  const toDisplay = (kg: number) =>
    units === 'imperial' ? Math.round(kg * 2.20462 * 10) / 10 : kg

  const data = entries.map((e) => ({
    week: `Wk ${e.week_number}`,
    weight: toDisplay(e.weight_kg),
    date: e.check_in_date
  }))

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-gray-600 text-sm">
        No weight data yet. Submit your first check-in to start tracking.
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
        <XAxis
          dataKey="week"
          tick={{ fill: '#6b7280', fontSize: 11 }}
          axisLine={{ stroke: '#374151' }}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: '#6b7280', fontSize: 11 }}
          axisLine={{ stroke: '#374151' }}
          tickLine={false}
          domain={['auto', 'auto']}
        />
        <Tooltip content={<CustomTooltip units={units} />} />
        {startWeight && (
          <ReferenceLine
            y={toDisplay(startWeight)}
            stroke="#4b5563"
            strokeDasharray="4 2"
            label={{ value: 'Start', fill: '#4b5563', fontSize: 10 }}
          />
        )}
        <Line
          type="monotone"
          dataKey="weight"
          stroke="#f97316"
          strokeWidth={2}
          dot={{ fill: '#f97316', r: 4, strokeWidth: 0 }}
          activeDot={{ r: 6, fill: '#fb923c' }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
