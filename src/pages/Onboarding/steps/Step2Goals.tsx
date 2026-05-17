import { useState } from 'react'
import { Select } from '../../../components/ui'
import type { OnboardingData } from '../useOnboarding'

const DIVISIONS = [
  { value: "Men's Physique", label: "Men's Physique" },
  { value: "Classic Physique", label: "Classic Physique" },
  { value: "Open Bodybuilding", label: "Open Bodybuilding" },
  { value: "212 Bodybuilding", label: "212 Bodybuilding" },
  { value: "Bikini", label: "Bikini" },
  { value: "Wellness", label: "Wellness" },
  { value: "Figure", label: "Figure" },
  { value: "Women's Physique", label: "Women's Physique" },
  { value: "Fitness", label: "Fitness" },
  { value: "Physique (NPC/NANBF)", label: "Physique (Amateur)" },
]

interface Props {
  data: OnboardingData
  update: (d: Partial<OnboardingData>) => void
}

export default function Step2Goals({ data, update }: Props) {
  const [competing, setCompeting] = useState(() => !!(data.show_date || data.division))

  function toggleCompeting(val: boolean) {
    setCompeting(val)
    if (!val) update({ show_date: undefined, division: undefined })
  }

  const today = new Date().toLocaleDateString('en-CA')

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-gray-100">Goals & Competition</h2>
        <p className="text-sm text-gray-400 mt-1">Set your primary goal and tell us about any upcoming shows.</p>
      </div>

      <Select
        label="Primary Goal"
        value={data.goal ?? 'cut'}
        onChange={(e) => update({ goal: e.target.value as 'cut' | 'maintain' | 'recomp' | 'bulk' })}
        options={[
          { value: 'bulk', label: 'Bulk — off-season muscle build' },
          { value: 'cut', label: 'Cut — reduce body fat' },
          { value: 'maintain', label: 'Maintain — hold current condition' },
          { value: 'recomp', label: 'Recomposition — lose fat, build muscle' },
        ]}
      />

      {/* Competing toggle */}
      <div>
        <p className="text-sm font-medium text-gray-300 mb-2">Are you prepping for a competition?</p>
        <div className="flex gap-2">
          {[{ label: 'Yes', val: true }, { label: 'No', val: false }].map(({ label, val }) => (
            <button
              key={label}
              type="button"
              onClick={() => toggleCompeting(val)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                competing === val
                  ? 'bg-brand-600/20 border-brand-500 text-brand-400'
                  : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Competition details — only shown if competing */}
      {competing && (
        <div className="space-y-3 pl-3 border-l-2 border-brand-700">
          <Select
            label="Division"
            value={data.division ?? ''}
            onChange={(e) => update({ division: e.target.value || undefined })}
            options={[{ value: '', label: 'Select division...' }, ...DIVISIONS]}
          />
          <div>
            <label className="text-sm font-medium text-gray-300 mb-1.5 block">Show Date</label>
            <input
              type="date"
              value={data.show_date ?? ''}
              onChange={(e) => update({ show_date: e.target.value || undefined })}
              min={today}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200"
            />
            <p className="text-xs text-gray-600 mt-1">This sets your prep countdown and personalises your training phases. You can add more shows later in Settings.</p>
          </div>
        </div>
      )}

      {/* Past experience */}
      <div>
        <label className="text-sm font-medium text-gray-300 mb-2 block">Past Competition Experience</label>
        <div className="flex flex-wrap gap-2">
          {['No shows (no experience)', '1–2 shows', '3–5 shows', '5+ shows'].map((opt) => {
            const selected = data.competition_history?.includes(opt)
            return (
              <button
                key={opt}
                type="button"
                onClick={() => {
                  const prev = data.competition_history ?? []
                  update({ competition_history: selected ? prev.filter((x) => x !== opt) : [...prev, opt] })
                }}
                className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                  selected
                    ? 'bg-brand-600/20 border-brand-500 text-brand-400'
                    : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500'
                }`}
              >
                {opt}
              </button>
            )
          })}
        </div>
      </div>

      {/* Natural athlete */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => update({ is_natural: !data.is_natural })}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            data.is_natural ? 'bg-brand-600' : 'bg-gray-700'
          }`}
        >
          <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${data.is_natural ? 'translate-x-6' : 'translate-x-1'}`} />
        </button>
        <div>
          <p className="text-sm font-medium text-gray-300">Natural athlete</p>
          <p className="text-xs text-gray-500">Context only — no different protocols either way.</p>
        </div>
      </div>
    </div>
  )
}
