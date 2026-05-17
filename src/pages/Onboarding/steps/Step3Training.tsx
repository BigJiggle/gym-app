import { Select } from '../../../components/ui'
import type { OnboardingData } from '../useOnboarding'
import type { CreateUserInput } from '../../../types'

interface Props {
  data: OnboardingData
  update: (d: Partial<OnboardingData>) => void
}

export default function Step3Training({ data, update }: Props) {
  const freq = data.training_frequency ?? 4

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-gray-100">Training Setup</h2>
        <p className="text-sm text-gray-400 mt-1">
          Your training frequency and equipment determine the split structure.
        </p>
      </div>

      {/* Training frequency slider */}
      <div>
        <label className="text-sm font-medium text-gray-300 mb-3 block">
          Training Frequency: <span className="text-brand-400 font-bold">{freq} days/week</span>
        </label>
        <input
          type="range"
          min={2}
          max={6}
          value={freq}
          onChange={(e) => update({ training_frequency: parseInt(e.target.value) })}
          className="w-full accent-brand-500 h-2 rounded-full"
        />
        <div className="flex justify-between text-xs text-gray-500 mt-1">
          <span>2 days</span>
          <span>3 days</span>
          <span>4 days</span>
          <span>5 days</span>
          <span>6 days</span>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          {freq <= 3 && 'Push/Pull/Legs — one round per week'}
          {freq === 4 && 'Upper/Lower — twice per week'}
          {freq >= 5 && 'Push/Pull/Legs — high frequency split'}
        </p>
      </div>

      <Select
        label="Equipment Access"
        value={data.equipment_access ?? 'full_gym'}
        onChange={(e) =>
          update({ equipment_access: e.target.value as 'full_gym' | 'home' | 'minimal' })
        }
        options={[
          { value: 'full_gym', label: 'Full Gym — barbells, cables, machines' },
          { value: 'home', label: 'Home Gym — dumbbells, basic equipment' },
          { value: 'minimal', label: 'Minimal — bodyweight and resistance bands' }
        ]}
      />

      <Select
        label="Overall Activity Level (outside gym)"
        value={data.activity_level ?? 'moderate'}
        onChange={(e) =>
          update({
            activity_level: e.target.value as 'sedentary' | 'light' | 'moderate' | 'active'
          })
        }
        options={[
          { value: 'sedentary', label: 'Sedentary — desk job, minimal daily movement' },
          { value: 'light', label: 'Light — some walking, light daily activity' },
          { value: 'moderate', label: 'Moderate — active job or regular daily movement' },
          { value: 'active', label: 'Active — physically demanding job or very active lifestyle' }
        ]}
      />

      <div>
        <label className="text-sm font-medium text-gray-300 mb-2 block">
          Recovery / Lifestyle Notes (optional)
        </label>
        <textarea
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 placeholder-gray-500
                     focus:outline-none focus:ring-2 focus:ring-brand-500 w-full text-sm resize-none"
          rows={2}
          value={data.recovery_notes ?? ''}
          onChange={(e) => update({ recovery_notes: e.target.value })}
          placeholder="e.g. shift worker, chronic knee issue, limited sleep due to newborn..."
        />
      </div>

      <div className="bg-gray-800/50 rounded-lg p-3 text-xs text-gray-400 border border-gray-700">
        <strong className="text-gray-300">Note:</strong> If you have any injuries or medical
        conditions that affect training, please consult a sports medicine professional before
        following this program.
      </div>

      {/* Split Preference */}
      <div className="mt-5">
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Preferred Training Split
          <span className="text-gray-500 font-normal ml-1">(optional — auto if unsure)</span>
        </label>
        <div className="grid grid-cols-3 gap-2">
          {[
            { value: 'auto', label: 'Auto', desc: 'Based on your days/week' },
            { value: 'ppl', label: 'Push/Pull/Legs', desc: 'Classic 3–6 day split' },
            { value: 'upper_lower', label: 'Upper/Lower', desc: 'Balanced 4-day split' },
            { value: 'arnold', label: 'Arnold Split', desc: 'Chest+Back / Shoulders+Arms / Legs' },
            { value: 'bro', label: 'Bro Split', desc: 'One muscle group per day' },
            { value: 'full_body', label: 'Full Body', desc: 'All muscles every session' },
          ].map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => update({ split_preference: opt.value as CreateUserInput['split_preference'] })}
              className={`p-2 rounded-lg border text-left transition-colors ${
                data.split_preference === opt.value
                  ? 'border-brand-500 bg-brand-600/20 text-brand-400'
                  : 'border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-600'
              }`}
            >
              <p className="text-xs font-semibold">{opt.label}</p>
              <p className="text-xs text-gray-500 mt-0.5">{opt.desc}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
