import { useState } from 'react'
import { Link } from 'react-router-dom'
import { WIDGETS } from '../../components/widgets/registry'
import { useWidgets } from '../../components/widgets/useWidgets'
import { useHasShow } from '../../components/widgets/competitionLogs'

export default function AddWidgets() {
  const { enabledIds, enable, disable } = useWidgets()
  const hasShow = useHasShow()
  const [hovered, setHovered] = useState<string | null>(null)
  // Competition-only widgets aren't offered in the catalog until a show exists.
  const catalog = WIDGETS.filter((w) => !w.competitionOnly || hasShow)

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">Add Widgets</h1>
          <p className="text-gray-500 text-sm mt-0.5">Hover to preview. Add or remove widgets from your dashboard.</p>
        </div>
        <Link to="/dashboard">
          <button className="text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-700 bg-gray-800 text-gray-300 hover:border-brand-600 hover:text-brand-400 transition-colors">
            ← Back to Dashboard
          </button>
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {catalog.map((w) => {
          const isEnabled = enabledIds.includes(w.id)
          const { Component } = w
          return (
            <div
              key={w.id}
              onMouseEnter={() => setHovered(w.id)}
              onMouseLeave={() => setHovered((h) => (h === w.id ? null : h))}
              className="bg-gray-900 border border-gray-800 rounded-xl p-4"
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <div>
                  <h2 className="font-semibold text-gray-100">{w.title}</h2>
                  <p className="text-xs text-gray-500 mt-0.5">{w.description}</p>
                </div>
                {isEnabled ? (
                  <button
                    onClick={() => disable(w.id)}
                    className="flex-shrink-0 text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-700 bg-gray-800 text-gray-400 hover:border-red-700 hover:text-red-400 transition-colors"
                  >
                    Remove
                  </button>
                ) : (
                  <button
                    onClick={() => enable(w.id)}
                    className="flex-shrink-0 text-xs font-medium px-3 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-500 text-white transition-colors"
                  >
                    + Add
                  </button>
                )}
              </div>

              {/* Live preview */}
              <div className="mt-3 border-t border-gray-800 pt-3">
                <p className="text-xs text-gray-600 mb-2">
                  {hovered === w.id ? 'Preview' : (isEnabled ? 'On your dashboard' : 'Hover to preview')}
                </p>
                <div className="pointer-events-none select-none opacity-95">
                  <Component />
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
