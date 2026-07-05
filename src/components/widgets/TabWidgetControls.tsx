import { useState } from 'react'
import type { WidgetStore } from './createWidgetStore'

export interface TabWidgetMeta {
  id: string
  title: string
  description: string
}

interface TabWidgetControlsProps {
  store: WidgetStore<string>
  items: TabWidgetMeta[]
  // Optional heading (e.g. "Plan widgets"). Defaults to a generic label.
  label?: string
}

// Reusable "Customize" control for a tab's widget layout. It owns only the
// add/remove catalog + persistence (via the given store's distinct localStorage
// key); the page itself gates each card with `store.useEnabledIds()` so no card
// markup has to move. Drag-reorder is a separate backlog item.
export default function TabWidgetControls({ store, items, label = 'Widgets' }: TabWidgetControlsProps) {
  const enabledIds = store.useEnabledIds()
  const [open, setOpen] = useState(false)
  const enabled = new Set(enabledIds)
  const shownCount = items.filter((i) => enabled.has(i.id)).length

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
          {label}
          <span className="ml-2 text-gray-600 normal-case font-normal">{shownCount}/{items.length} shown</span>
        </h2>
        <button
          onClick={() => setOpen((o) => !o)}
          className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${
            open
              ? 'bg-brand-600 border-brand-500 text-white'
              : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-600'
          }`}
        >
          {open ? 'Done' : 'Customize'}
        </button>
      </div>

      {open && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 space-y-1.5">
          <p className="text-xs text-gray-500 mb-1">Add or remove sections. Your choice is saved on this device.</p>
          {items.map((item) => {
            const isEnabled = enabled.has(item.id)
            return (
              <div
                key={item.id}
                className="flex items-start justify-between gap-3 py-1.5 border-b border-gray-800/60 last:border-0"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-200">{item.title}</p>
                  <p className="text-xs text-gray-600">{item.description}</p>
                </div>
                <button
                  onClick={() => (isEnabled ? store.disable(item.id) : store.enable(item.id))}
                  className={`flex-shrink-0 text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${
                    isEnabled
                      ? 'bg-gray-800 border-gray-700 text-gray-400 hover:border-red-700 hover:text-red-400'
                      : 'bg-brand-600 border-brand-500 text-white hover:bg-brand-500'
                  }`}
                >
                  {isEnabled ? 'Remove' : '+ Add'}
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
