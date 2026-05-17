import { useState } from 'react'
import { FOODS } from '../../../data/foods'
import type { CreateUserInput } from '../../../types'

interface Props {
  data: Partial<CreateUserInput>
  update: (partial: Partial<CreateUserInput>) => void
}

export default function Step5FoodSetup({ data, update }: Props) {
  const [excludeSearch, setExcludeSearch] = useState('')
  const [preferSearch, setPreferSearch] = useState('')

  const exclusions: string[] = data.food_exclusions ?? []
  const preferences: string[] = data.food_preferences ?? []

  function toggleExclusion(id: string) {
    if (exclusions.includes(id)) {
      update({ food_exclusions: exclusions.filter((x) => x !== id) })
    } else {
      update({ food_exclusions: [...exclusions, id] })
      // If it was in preferences, remove it
      if (preferences.includes(id)) {
        update({ food_preferences: preferences.filter((x) => x !== id) })
      }
    }
  }

  function togglePreference(id: string) {
    if (exclusions.includes(id)) return // Can't prefer an excluded food
    if (preferences.includes(id)) {
      update({ food_preferences: preferences.filter((x) => x !== id) })
    } else {
      update({ food_preferences: [...preferences, id] })
    }
  }

  const filteredForExclude = FOODS.filter((f) =>
    f.name.toLowerCase().includes(excludeSearch.toLowerCase())
  )
  const filteredForPrefer = FOODS.filter((f) =>
    !exclusions.includes(f.id) &&
    f.name.toLowerCase().includes(preferSearch.toLowerCase())
  )

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-gray-100">Food Setup</h2>
        <p className="text-sm text-gray-500 mt-1">Customize your meal plans around what works for you.</p>
      </div>

      {/* Cooking Preferences */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">Cook Time Per Meal</label>
        <div className="grid grid-cols-3 gap-2">
          {[
            { value: 'quick', label: 'Quick', desc: 'Under 15 min' },
            { value: 'medium', label: 'Medium', desc: '15–30 min' },
            { value: 'chef', label: 'Chef', desc: '30+ min, no limit' },
          ].map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => update({ cooking_time_pref: opt.value as CreateUserInput['cooking_time_pref'] })}
              className={`p-3 rounded-lg border transition-colors text-left ${
                data.cooking_time_pref === opt.value
                  ? 'border-brand-500 bg-brand-600/20 text-brand-400'
                  : 'border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-600'
              }`}
            >
              <p className="text-sm font-semibold">{opt.label}</p>
              <p className="text-xs text-gray-500 mt-0.5">{opt.desc}</p>
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">Meal Prep Style</label>
        <div className="grid grid-cols-3 gap-2">
          {[
            { value: 'daily', label: 'Daily Cook', desc: 'Fresh each day' },
            { value: 'batch', label: 'Batch Prep', desc: 'Cook once, eat all week' },
            { value: 'mixed', label: 'Mixed', desc: 'Combination approach' },
          ].map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => update({ meal_prep_style: opt.value as CreateUserInput['meal_prep_style'] })}
              className={`p-3 rounded-lg border transition-colors text-left ${
                data.meal_prep_style === opt.value
                  ? 'border-brand-500 bg-brand-600/20 text-brand-400'
                  : 'border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-600'
              }`}
            >
              <p className="text-sm font-semibold">{opt.label}</p>
              <p className="text-xs text-gray-500 mt-0.5">{opt.desc}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Food Exclusions */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1">Foods to Exclude</label>
        <p className="text-xs text-gray-500 mb-2">These will never appear in your meal plan.</p>
        <input
          type="text"
          placeholder="Search foods..."
          value={excludeSearch}
          onChange={(e) => setExcludeSearch(e.target.value)}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 mb-2"
        />
        {/* Selected exclusions chips */}
        {exclusions.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {exclusions.map((id) => {
              const food = FOODS.find((f) => f.id === id)
              return food ? (
                <span
                  key={id}
                  onClick={() => toggleExclusion(id)}
                  className="text-xs bg-red-900/30 text-red-400 border border-red-800/40 rounded-full px-2 py-0.5 cursor-pointer hover:bg-red-900/50 flex items-center gap-1"
                >
                  {food.name} &times;
                </span>
              ) : null
            })}
          </div>
        )}
        <div className="bg-gray-800 border border-gray-700 rounded-lg max-h-36 overflow-y-auto">
          {filteredForExclude.slice(0, 30).map((food) => (
            <div
              key={food.id}
              onClick={() => toggleExclusion(food.id)}
              className={`flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-gray-700 border-b border-gray-700 last:border-0 transition-colors ${
                exclusions.includes(food.id) ? 'bg-red-900/20' : ''
              }`}
            >
              <span className="text-sm text-gray-300">{food.name}</span>
              <span className={`text-xs ${exclusions.includes(food.id) ? 'text-red-400' : 'text-gray-600'}`}>
                {exclusions.includes(food.id) ? '✗ excluded' : '+ exclude'}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Food Preferences */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1">
          Foods You Enjoy <span className="text-gray-500 font-normal">(optional)</span>
        </label>
        <p className="text-xs text-gray-500 mb-2">These will be prioritized in your meal plan.</p>
        <input
          type="text"
          placeholder="Search foods..."
          value={preferSearch}
          onChange={(e) => setPreferSearch(e.target.value)}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 mb-2"
        />
        {preferences.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {preferences.map((id) => {
              const food = FOODS.find((f) => f.id === id)
              return food ? (
                <span
                  key={id}
                  onClick={() => togglePreference(id)}
                  className="text-xs bg-green-900/30 text-green-400 border border-green-800/40 rounded-full px-2 py-0.5 cursor-pointer hover:bg-green-900/50 flex items-center gap-1"
                >
                  {food.name} &times;
                </span>
              ) : null
            })}
          </div>
        )}
        <div className="bg-gray-800 border border-gray-700 rounded-lg max-h-36 overflow-y-auto">
          {filteredForPrefer.slice(0, 30).map((food) => (
            <div
              key={food.id}
              onClick={() => togglePreference(food.id)}
              className={`flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-gray-700 border-b border-gray-700 last:border-0 transition-colors ${
                preferences.includes(food.id) ? 'bg-green-900/20' : ''
              }`}
            >
              <span className="text-sm text-gray-300">{food.name}</span>
              <span className={`text-xs ${preferences.includes(food.id) ? 'text-green-400' : 'text-gray-600'}`}>
                {preferences.includes(food.id) ? '★ preferred' : '+ prefer'}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
