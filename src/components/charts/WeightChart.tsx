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
  projectedWeightKg?: number
  weeksToShow?: number | null
}

const CustomTooltip = ({ active, payload, label, units }: { active?: boolean; payload?: { value: number; dataKey: string }[]; label?: string; units?: string }) => {
  if (active && payload?.length) {
    const actual = payload.find(p => p.dataKey === 'weight')
    const projected = payload.find(p => p.dataKey === 'projected')
    const displayVal = actual ?? projected
    if (!displayVal) return null
    const isProjected = !!projected && !actual
    return (
      <div className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm">
        <p className="text-gray-400">{label}</p>
        <p className={`font-bold ${isProjected ? 'text-blue-400' : 'text-brand-400'}`}>
          {displayVal.value} {units === 'imperial' ? 'lbs' : 'kg'}
          {isProjected && <span className="text-xs font-normal text-gray-500 ml-1">projected</span>}
        </p>
      </div>
    )
  }
  return null
}

export default function WeightChart({ entries, startWeight, units = 'metric', projectedWeightKg, weeksToShow }: Props) {
  const toDisplay = (kg: number) =>
    units === 'imperial' ? Math.round(kg * 2.20462 * 10) / 10 : kg

  const actualData = entries.map((e) => ({
    week: `Wk ${e.week_number}`,
    weight: toDisplay(e.weight_kg),
    date: e.check_in_date,
    projected: null as number | null,
  }))

  // Append a projected "Show Day" data point when we have a projection
  const showProjection = projectedWeightKg != null && weeksToShow != null && weeksToShow > 0
  const data = showProjection
    ? [
        ...actualData,
        {
          week: 'Show Day',
          weight: null as number | null,
          date: '',
          projected: toDisplay(projectedWeightKg!),
        },
      ]
    : actualData

  if (actualData.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-gray-600 text-sm">
        No weight data yet. Submit your first check-in to start tracking.
      </div>
    )
  }

  return (
    <div>
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
          {/* Actual weight line */}
          <Line
            type="monotone"
            dataKey="weight"
            stroke="#f97316"
            strokeWidth={2}
            dot={{ fill: '#f97316', r: 4, strokeWidth: 0 }}
            activeDot={{ r: 6, fill: '#fb923c' }}
            connectNulls={false}
          />
          {/* Projected trajectory — dashed blue line from last actual to show day */}
          {showProjection && (
            <Line
              type="linear"
              dataKey="projected"
              stroke="#60a5fa"
              strokeWidth={2}
              strokeDasharray="6 3"
              dot={(props) => {
                const { cx, cy, index } = props
                if (index !== data.length - 1) return <g key={`dot-${index}`} />
                return (
                  <g key={`dot-${index}`}>
                    <circle cx={cx} cy={cy} r={6} fill="#1d4ed8" stroke="#60a5fa" strokeWidth={2} />
                    <circle cx={cx} cy={cy} r={3} fill="#93c5fd" />
                  </g>
                )
              }}
              activeDot={{ r: 6, fill: '#93c5fd' }}
              connectNulls
            />
          )}
        </LineChart>
      </ResponsiveContainer>
      {showProjection && (
        <div className="flex items-center gap-4 mt-2 text-xs text-gray-500 justify-end">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-4 h-0.5 bg-brand-500 rounded" />
            Actual
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-4 h-0.5 bg-blue-400 rounded" style={{ backgroundImage: 'repeating-linear-gradient(90deg,#60a5fa 0,#60a5fa 4px,transparent 4px,transparent 7px)' }} />
            Projected to show
          </span>
        </div>
      )}
    </div>
  )
}
