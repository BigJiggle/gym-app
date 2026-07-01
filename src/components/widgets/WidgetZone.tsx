import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useWidgets } from './useWidgets'
import type { WidgetId } from './useWidgets'
import { getWidget } from './registry'
import WidgetFrame from './WidgetFrame'

export default function WidgetZone() {
  const { enabledIds, disable, reorder } = useWidgets()
  const [editing, setEditing] = useState(false)
  const dragIndex = useRef<number | null>(null)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function startLongPress(e: React.PointerEvent) {
    // Don't hijack interaction with a widget's own controls — only a hold on the
    // card body should enter rearrange mode.
    if ((e.target as HTMLElement).closest('button, input, textarea, select, a')) return
    longPressTimer.current = setTimeout(() => setEditing(true), 400)
  }
  function cancelLongPress() {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null }
  }

  // Clear a pending long-press timer if the zone unmounts mid-hold.
  useEffect(() => () => { if (longPressTimer.current) clearTimeout(longPressTimer.current) }, [])

  function handleDelete(id: WidgetId) {
    if (window.confirm('Are you sure you want to remove this widget?')) disable(id)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">My Widgets</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setEditing((e) => !e)}
            className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${editing ? 'bg-brand-600 border-brand-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-600'}`}
          >
            {editing ? 'Done' : 'Rearrange'}
          </button>
          <Link
            to="/widgets"
            className="text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-700 bg-gray-800 text-gray-300 hover:border-brand-600 hover:text-brand-400 transition-colors"
          >
            + Add Widgets
          </Link>
        </div>
      </div>

      {enabledIds.length === 0 ? (
        <div className="bg-gray-900 border border-dashed border-gray-700 rounded-xl p-6 text-center">
          <p className="text-sm text-gray-400 mb-2">No widgets on your dashboard.</p>
          <Link to="/widgets" className="text-xs font-medium text-brand-400 hover:text-brand-300">+ Add Widgets</Link>
        </div>
      ) : (
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
          {enabledIds.map((id, index) => {
            const def = getWidget(id)
            if (!def) return null
            const { Component } = def
            return (
              <div
                key={id}
                onPointerDown={editing ? undefined : startLongPress}
                onPointerUp={cancelLongPress}
                onPointerLeave={cancelLongPress}
                draggable={editing}
                onDragStart={() => { dragIndex.current = index }}
                onDragOver={(e) => { if (editing) e.preventDefault() }}
                onDrop={() => {
                  if (dragIndex.current !== null && dragIndex.current !== index) {
                    reorder(dragIndex.current, index)
                  }
                  dragIndex.current = null
                }}
                onDragEnd={() => { dragIndex.current = null }}
              >
                <WidgetFrame editing={editing} onDelete={() => handleDelete(id)}>
                  <Component />
                </WidgetFrame>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
