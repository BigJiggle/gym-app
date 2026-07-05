import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { WidgetStore } from './createWidgetStore'
import TabWidgetControls from './TabWidgetControls'
import type { TabWidgetMeta } from './TabWidgetControls'

interface TabWidgetZoneProps {
  store: WidgetStore<string>
  items: TabWidgetMeta[]
  // Rendered content for each widget id. A falsy value (e.g. a widget whose data
  // isn't ready yet) is skipped while its stored slot is preserved, so drag
  // reorder indices stay aligned with the persisted list.
  nodes: Record<string, ReactNode>
  label?: string
}

// Reorderable widget zone for a tab (Training / Nutrition). It reuses the
// dashboard WidgetZone mechanics — a Rearrange toggle, long-press to enter
// rearrange mode, and HTML5 drag with dashed drop-target cues — but renders
// caller-supplied nodes (already full cards) in the store's persisted order
// instead of registry components, and delegates add/remove to TabWidgetControls.
// Reorder persists through the store's own localStorage key.
export default function TabWidgetZone({ store, items, nodes, label }: TabWidgetZoneProps) {
  const enabledIds = store.useEnabledIds()
  const [editing, setEditing] = useState(false)
  // Source index of the widget being dragged, and the card currently hovered as a
  // drop target — both drive the "you can / can't drop here" cues.
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
    // Don't hijack a widget's own controls — only a hold on the card body should
    // enter rearrange mode.
    if ((e.target as HTMLElement).closest('button, input, textarea, select, a')) return
    longPressTimer.current = setTimeout(() => setEditing(true), 400)
  }
  function cancelLongPress() {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null }
  }

  // Clear a pending long-press timer if the zone unmounts mid-hold.
  useEffect(() => () => { if (longPressTimer.current) clearTimeout(longPressTimer.current) }, [])

  // Keep each widget's real index in the stored list (so reorder stays correct)
  // while skipping ids with no renderable node (data not ready / unknown id).
  const visible = enabledIds
    .map((id, index) => ({ id, index, node: nodes[id] }))
    .filter((e) => e.node)

  const rearrangeBtn = visible.length > 1 ? (
    <button
      onClick={() => setEditing((v) => !v)}
      className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${editing ? 'bg-brand-600 border-brand-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-600'}`}
    >
      {editing ? 'Done' : 'Rearrange'}
    </button>
  ) : null

  return (
    <div className="space-y-6">
      <TabWidgetControls store={store} items={items} label={label} actionsSlot={rearrangeBtn} />

      {editing && visible.length > 1 && (
        <p className="text-xs text-gray-500 -mt-3">
          Drag a widget onto an outlined slot to place it there. Release over the dimmed
          widget or empty space to cancel.
        </p>
      )}

      <div className="space-y-6">
        {visible.map(({ id, index, node }) => {
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
                  store.reorder(dragIndex.current, index)
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
              {node}
            </div>
          )
        })}
      </div>
    </div>
  )
}
