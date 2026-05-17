import type { ReactNode } from 'react'

interface CardProps {
  children: ReactNode
  className?: string
  title?: string
  subtitle?: string
  action?: ReactNode
}

export default function Card({ children, className = '', title, subtitle, action }: CardProps) {
  return (
    <div className={`bg-gray-900 border border-gray-800 rounded-xl p-4 ${className}`}>
      {(title || action) && (
        <div className="flex items-start justify-between mb-3">
          <div>
            {title && <h3 className="font-semibold text-gray-100">{title}</h3>}
            {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
          </div>
          {action && <div className="ml-3 flex-shrink-0">{action}</div>}
        </div>
      )}
      {children}
    </div>
  )
}

export function StatCard({
  label,
  value,
  unit,
  delta,
  color = 'brand'
}: {
  label: string
  value: string | number
  unit?: string
  delta?: string
  color?: 'brand' | 'green' | 'red' | 'blue'
}) {
  const colorMap = {
    brand: 'text-brand-400',
    green: 'text-green-400',
    red: 'text-red-400',
    blue: 'text-blue-400'
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">{label}</p>
      <div className="flex items-baseline gap-1">
        <span className={`text-2xl font-bold ${colorMap[color]}`}>{value}</span>
        {unit && <span className="text-sm text-gray-500">{unit}</span>}
      </div>
      {delta && <p className="text-xs text-gray-500 mt-1">{delta}</p>}
    </div>
  )
}
