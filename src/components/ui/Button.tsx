import type { ButtonHTMLAttributes, ReactNode } from 'react'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  children: ReactNode
}

const VARIANTS = {
  primary: 'bg-brand-600 hover:bg-brand-500 text-white font-semibold border border-brand-600',
  secondary: 'bg-gray-800 hover:bg-gray-700 text-gray-200 font-medium border border-gray-700',
  ghost: 'text-gray-400 hover:text-gray-100 hover:bg-gray-800 border border-transparent',
  danger: 'bg-red-900/40 hover:bg-red-800/40 text-red-400 border border-red-800/50'
}

const SIZES = {
  sm: 'px-3 py-1.5 text-sm rounded-md',
  md: 'px-4 py-2 text-sm rounded-lg',
  lg: 'px-6 py-3 text-base rounded-lg'
}

export default function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  children,
  ...props
}: Props) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 transition-colors
        disabled:opacity-50 disabled:cursor-not-allowed
        ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}
