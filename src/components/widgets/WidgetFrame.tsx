import type { ReactNode } from 'react'

interface WidgetFrameProps {
  editing: boolean
  onDelete: () => void
  dragHandleProps?: React.HTMLAttributes<HTMLButtonElement>
  children: ReactNode
}

export default function WidgetFrame({ editing, onDelete, dragHandleProps, children }: WidgetFrameProps) {
  return (
    <div className={`relative ${editing ? 'ring-2 ring-brand-600/50 rounded-xl' : ''}`}>
      {editing && (
        <div className="absolute -top-2 -right-2 z-10 flex items-center gap-1">
          <button
            {...dragHandleProps}
            className="cursor-grab active:cursor-grabbing bg-gray-800 border border-gray-600 text-gray-300 rounded-lg w-7 h-7 flex items-center justify-center text-xs shadow"
            aria-label="Drag to reorder"
            title="Drag to reorder"
          >
            ⠿
          </button>
          <button
            onClick={onDelete}
            className="bg-red-900/80 border border-red-700 text-red-200 rounded-lg w-7 h-7 flex items-center justify-center text-xs shadow hover:bg-red-800"
            aria-label="Remove widget"
            title="Remove widget"
          >
            ✕
          </button>
        </div>
      )}
      <div className={editing ? 'pointer-events-none select-none' : ''}>{children}</div>
    </div>
  )
}
