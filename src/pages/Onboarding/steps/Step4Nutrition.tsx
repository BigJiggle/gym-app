import { Select } from '../../../components/ui'
import type { OnboardingData } from '../useOnboarding'

const MEAL_COUNTS = [3, 4, 5, 6]
const SNACK_COUNTS = [0, 1, 2, 3]

const COMMON_RESTRICTIONS = [
  'Gluten-free',
  'Dairy-free',
  'No pork',
  'No shellfish',
  'Nut allergy',
  'Low FODMAP'
]

interface Props {
  data: OnboardingData
  update: (d: Partial<OnboardingData>) => void
}

export default function Step4Nutrition({ data, update }: Props) {
  const meals = Math.max(3, data.meal_count ?? 4)

  const toggleRestriction = (r: string) => {
    const prev = data.dietary_restrictions ?? []
    update({
      dietary_restrictions: prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]
    })
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-gray-100">Nutrition Preferences</h2>
        <p className="text-sm text-gray-400 mt-1">
          Used to generate your meal plan structure and food suggestions.
        </p>
      </div>

      <Select
        label="Dietary Approach"
        value={data.dietary_preference ?? 'omnivore'}
        onChange={(e) =>
          update({
            dietary_preference: e.target.value as 'omnivore' | 'vegetarian' | 'vegan'
          })
        }
        options={[
          { value: 'omnivore', label: 'Omnivore — all food groups' },
          { value: 'vegetarian', label: 'Vegetarian — no meat/fish' },
          { value: 'vegan', label: 'Vegan — plant-based only' }
        ]}
      />

      {/* Meal count */}
      <div>
        <label className="text-sm font-medium text-gray-300 mb-2 block">
          Meals Per Day: <span className="text-brand-400 font-bold">{meals}</span>
        </label>
        <div className="flex gap-2">
          {MEAL_COUNTS.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => update({ meal_count: Math.max(3, n) })}
              className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                meals === n
                  ? 'bg-brand-600/20 border-brand-500 text-brand-400'
                  : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600'
              }`}
            >
              {n}
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-500 mt-1.5">
          Main meals only — snacks are set separately below.
        </p>
      </div>

      {/* Snack Count */}
      <div>
        <label className="text-sm font-medium text-gray-300 mb-2 block">
          Snacks Per Day:{' '}
          <span className="text-brand-400 font-bold">
            {data.snack_count ?? 0}
          </span>
          <span className="text-gray-500 font-normal ml-1 text-xs">— ~200 kcal each, placed between main meals</span>
        </label>
        <div className="flex gap-2">
          {SNACK_COUNTS.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => update({ snack_count: n })}
              className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                (data.snack_count ?? 0) === n
                  ? 'bg-brand-600/20 border-brand-500 text-brand-400'
                  : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600'
              }`}
            >
              {n === 0 ? 'None' : n}
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-500 mt-1.5">
          Snacks are fixed at ~200 kcal; main meals split the remaining calories.
        </p>
      </div>

      {/* Dietary restrictions */}
      <div>
        <label className="text-sm font-medium text-gray-300 mb-2 block">
          Dietary Restrictions (select all that apply)
        </label>
        <div className="flex flex-wrap gap-2">
          {COMMON_RESTRICTIONS.map((r) => {
            const selected = (data.dietary_restrictions ?? []).includes(r)
            return (
              <button
                key={r}
                type="button"
                onClick={() => toggleRestriction(r)}
                className={`px-3 py-1.5 rounded-lg text-xs border transition-colors ${
                  selected
                    ? 'bg-brand-600/20 border-brand-500 text-brand-400'
                    : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500'
                }`}
              >
                {r}
              </button>
            )
          })}
        </div>
      </div>

      <div className="bg-amber-900/20 border border-amber-800/40 rounded-lg p-3 text-xs text-amber-400">
        <strong>Disclaimer:</strong> The nutrition plan provided is for educational and structural
        guidance only. Always consult a registered dietitian or sports nutritionist for
        personalized clinical advice.
      </div>
    </div>
  )
}
