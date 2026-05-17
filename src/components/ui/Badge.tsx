import type { ReactNode } from 'react'

type Variant = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'brand'

const VARIANTS: Record<Variant, string> = {
  default: 'bg-gray-800 text-gray-300 border-gray-700',
  success: 'bg-green-900/40 text-green-400 border-green-800/50',
  warning: 'bg-yellow-900/40 text-yellow-400 border-yellow-800/50',
  danger: 'bg-red-900/40 text-red-400 border-red-800/50',
  info: 'bg-blue-900/40 text-blue-400 border-blue-800/50',
  brand: 'bg-brand-900/40 text-brand-400 border-brand-800/50'
}

export default function Badge({
  children,
  variant = 'default',
  className = ''
}: {
  children: ReactNode
  variant?: Variant
  className?: string
}) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border ${VARIANTS[variant]} ${className}`}
    >
      {children}
    </span>
  )
}
