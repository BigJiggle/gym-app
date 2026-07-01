import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useWidgets } from './useWidgets'
import type { WidgetId } from './useWidgets'
import { getWidget } from './registry'
import WidgetFrame from './WidgetFrame'

export default function WidgetZone() {
  const { enabledIds, disable, reorder } = useWidgets()
  const [editing, setEditing] = useState(false)
  // Source index of the widget being dragged, and the card currently hovered as
  // a drop target — both drive the visual "you can / can't drop here" cues.
  const [dragging, setDragging] = useState<number | null>(null)
  const [overIndex, setOverIndex] = useState<number | null>(null)
  const dragIndex = useRef<number | null>(null)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function endDrag() {
    dragIndex.current = null
    setDragging(null)
    setOverIndex(null)
  }

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

      {editing && enabledIds.length > 1 && (
        <p className="text-xs text-gray-500">
          Drag a widget onto an outlined slot to place it there. Release over the dimmed
          widget or empty space to cancel.
        </p>
      )}

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
            const isSource = dragging === index
            const isTarget = overIndex === index && dragging !== null && dragging !== index
            const isDroppable = dragging !== null && dragging !== index
            const dropCue = isTarget
              ? 'ring-2 ring-brand-400 ring-offset-2 ring-offset-gray-950'
              : isDroppable
                ? 'outline outline-2 outline-dashed outline-brand-700/60 outline-offset-2'
                : ''
            return (
              <div
                key={id}
                className={`relative rounded-xl transition-all ${isSource ? 'opacity-40' : ''} ${dropCue}`}
                onPointerDown={editing ? undefined : startLongPress}
                onPointerUp={cancelLongPress}
                onPointerLeave={cancelLongPress}
                draggable={editing}
                onDragStart={() => { dragIndex.current = index; setDragging(index) }}
                onDragEnter={() => {
                  if (editing && dragIndex.current !== null && dragIndex.current !== index) {
                    setOverIndex(index)
                  }
                }}
                onDragOver={(e) => { if (editing) e.preventDefault() }}
                onDrop={() => {
                  if (dragIndex.current !== null && dragIndex.current !== index) {
                    reorder(dragIndex.current, index)
                  }
                  endDrag()
                }}
                onDragEnd={endDrag}
              >
                {isTarget && (
                  <span className="absolute -top-2 left-1/2 -translate-x-1/2 z-20 text-[10px] font-semibold uppercase tracking-wider bg-brand-500 text-white rounded-full px-2 py-0.5 shadow pointer-events-none">
                    Drop here
                  </span>
                )}
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
