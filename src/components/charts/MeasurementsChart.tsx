import { useState } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import type { CheckIn } from '../../types'

interface Props {
  checkins: CheckIn[]
  units?: 'metric' | 'imperial'
}

type MeasKey = 'waist_cm' | 'chest_cm' | 'hip_cm' | 'arm_cm' | 'thigh_cm'

const MEASURES: { key: MeasKey; label: string; color: string }[] = [
  { key: 'waist_cm',  label: 'Waist',  color: '#f97316' },
  { key: 'chest_cm', label: 'Chest',  color: '#3b82f6' },
  { key: 'hip_cm',   label: 'Hip',    color: '#a855f7' },
  { key: 'arm_cm',   label: 'Arm',    color: '#22c55e' },
  { key: 'thigh_cm', label: 'Thigh',  color: '#eab308' },
]

function toDisplay(cm: number, imperial: boolean) {
  return imperial ? Math.round(cm / 2.54 * 10) / 10 : Math.round(cm * 10) / 10
}

const CustomTooltip = ({ active, payload, label, unit }: {
  active?: boolean
  payload?: { name: string; value: number; color: string }[]
  label?: string
  unit: string
}) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs space-y-0.5">
      <p className="text-gray-400 mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: <strong>{p.value} {unit}</strong>
        </p>
      ))}
    </div>
  )
}

export default function MeasurementsChart({ checkins, units = 'metric' }: Props) {
  const imperial = units === 'imperial'
  const unit = imperial ? 'in' : 'cm'

  // Determine which measurements have at least 2 data points
  const available = MEASURES.filter(
    (m) => checkins.filter((c) => c[m.key] != null).length >= 2
  )

  const [active, setActive] = useState<Set<MeasKey>>(
    () => new Set(available.length > 0 ? [available[0].key] : [])
  )

  if (available.length === 0) return null

  // Build chart data from oldest to newest
  const sorted = [...checkins].reverse()
  const data = sorted
    .filter((c) => available.some((m) => c[m.key] != null))
    .map((c) => {
      const point: Record<string, number | string> = {
        label: `Wk ${c.week_number}`,
      }
      for (const m of available) {
        if (c[m.key] != null) {
          point[m.label] = toDisplay(c[m.key]!, imperial)
        }
      }
      return point
    })

  function toggleMeasure(key: MeasKey) {
    setActive((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        if (next.size === 1) return prev
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  const visibleMeasures = available.filter((m) => active.has(m.key))

  return (
    <div>
      {/* Toggle buttons */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {available.map((m) => {
          const on = active.has(m.key)
          return (
            <button
              key={m.key}
              onClick={() => toggleMeasure(m.key)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                on
                  ? 'text-white border-transparent'
                  : 'border-gray-700 text-gray-500 hover:border-gray-600'
              }`}
              style={on ? { backgroundColor: m.color, borderColor: m.color } : {}}
            >
              {m.label}
            </button>
          )
        })}
        <span className="text-xs text-gray-600 self-center ml-1">({unit})</span>
      </div>

      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
          <XAxis
            dataKey="label"
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
          <Tooltip content={<CustomTooltip unit={unit} />} />
          {visibleMeasures.map((m) => (
            <Line
              key={m.key}
              type="monotone"
              dataKey={m.label}
              stroke={m.color}
              strokeWidth={2}
              dot={{ fill: m.color, r: 4, strokeWidth: 0 }}
              activeDot={{ r: 6 }}
              connectNulls={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
