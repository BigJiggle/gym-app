import { useState, useEffect } from 'react'
import type { Meal } from '../../types'

function isoWeekKey(): string {
  const d = new Date()
  const day = d.getDay() === 0 ? 7 : d.getDay()
  const monday = new Date(d)
  monday.setDate(d.getDate() - (day - 1))
  return monday.toLocaleDateString('en-CA')
}

interface GroceryItem {
  food: string
  baseName: string
  weeklyQty: string
  category: 'protein' | 'carb' | 'fat' | 'vegetable' | 'dairy' | 'other'
  checked: boolean
}

const PROTEIN_KEYWORDS = ['chicken', 'beef', 'salmon', 'tuna', 'turkey', 'egg', 'whey', 'pea protein', 'soy protein', 'tilapia', 'shrimp', 'tofu', 'tempeh', 'pork', 'paneer', 'tikka', 'tinga', 'carne', 'falafel', 'halloumi', 'kimchi', 'bulgogi', 'natto', 'miso', 'edamame', 'dal', 'chana', 'cottage']
const CARB_KEYWORDS = ['rice', 'oat', 'potato', 'quinoa', 'pasta', 'bread', 'tortilla', 'roti', 'pita', 'noodle', 'soba', 'cream of rice', 'rice cake', 'banana', 'apple', 'berries', 'orange', 'mango', 'plantain', 'bean', 'lentil', 'hummus']
const VEG_KEYWORDS = ['broccoli', 'spinach', 'asparagus', 'green bean', 'zucchini', 'pepper', 'cucumber', 'romaine', 'kale', 'mixed veg', 'salad', 'saag', 'tomato', 'onion', 'garlic', 'kimchi', 'seaweed', 'nori']
const FAT_KEYWORDS = ['avocado', 'almond', 'cashew', 'walnut', 'peanut butter', 'almond butter', 'olive oil', 'tahini', 'ghee', 'coconut oil', 'feta', 'cotija', 'cheese']
const DAIRY_KEYWORDS = ['greek yogurt', 'yogurt', 'dahi', 'cottage cheese', 'milk', 'whey', 'labneh']

function categorize(foodName: string): GroceryItem['category'] {
  const lower = foodName.toLowerCase()
  if (DAIRY_KEYWORDS.some((k) => lower.includes(k))) return 'dairy'
  if (PROTEIN_KEYWORDS.some((k) => lower.includes(k))) return 'protein'
  if (VEG_KEYWORDS.some((k) => lower.includes(k))) return 'vegetable'
  if (CARB_KEYWORDS.some((k) => lower.includes(k))) return 'carb'
  if (FAT_KEYWORDS.some((k) => lower.includes(k))) return 'fat'
  return 'other'
}

function multiplyQty(foodStr: string, days = 7): string {
  let matched = false
  const result = foodStr
    .replace(/\((\d+(?:\.\d+)?)\s*g\)/g, (_, qty) => {
      matched = true
      const total = Math.round(parseFloat(qty) * days)
      return `(${total}g/wk)`
    })
    .replace(/x(\d+)/g, (_, n) => {
      matched = true
      return `x${parseInt(n) * days}/wk`
    })
  // Plain food names with no gram or count notation (e.g. "Banana", "Apple")
  // would otherwise show with no weekly quantity at all — append a count.
  return matched ? result : `${result} ×${days}/wk`
}

function buildGroceryItems(meals: Meal[]): GroceryItem[] {
  interface AccumEntry {
    food: string
    baseName: string
    totalGPerDay: number  // -1 means no gram info available
    count: number
    category: GroceryItem['category']
  }
  const map = new Map<string, AccumEntry>()
  for (const meal of meals) {
    for (const food of meal.foods) {
      const baseName = food.replace(/\s*\(.*?\)/g, '').replace(/\s*x\d+/g, '').trim()
      const key = baseName.toLowerCase()
      // Match gram amounts like "(150g)" or "(200g cooked)"
      const gramsMatch = food.match(/\((\d+(?:\.\d+)?)\s*g(?:[^)]*)\)/)
      const grams = gramsMatch ? parseFloat(gramsMatch[1]) : -1
      if (map.has(key)) {
        const entry = map.get(key)!
        entry.count++
        if (entry.totalGPerDay >= 0 && grams >= 0) {
          entry.totalGPerDay += grams
        } else {
          entry.totalGPerDay = -1  // mixed formats — fall back to count-based multiplier
        }
      } else {
        map.set(key, { food, baseName, totalGPerDay: grams, count: 1, category: categorize(food) })
      }
    }
  }
  return Array.from(map.values()).map(({ food, baseName, totalGPerDay, count, category }) => {
    const weeklyQty = totalGPerDay >= 0
      ? `${baseName} (${Math.round(totalGPerDay * 7)}g/wk)`
      : multiplyQty(food, count * 7)
    return { food, baseName, weeklyQty, category, checked: false }
  })
}

const CATEGORY_CONFIG = [
  { id: 'protein', label: 'Proteins', icon: '🥩', color: 'text-red-400' },
  { id: 'carb', label: 'Carbs & Grains', icon: '🍚', color: 'text-yellow-400' },
  { id: 'vegetable', label: 'Vegetables', icon: '🥦', color: 'text-green-400' },
  { id: 'dairy', label: 'Dairy', icon: '🥛', color: 'text-blue-300' },
  { id: 'fat', label: 'Fats & Oils', icon: '🥑', color: 'text-amber-400' },
  { id: 'other', label: 'Other', icon: '🛒', color: 'text-gray-400' },
] as const

interface Props {
  meals: Meal[]
  planId: number
}

export default function GroceryList({ meals, planId }: Props) {
  const storageKey = `grocery_checked_${planId}_${isoWeekKey()}`

  const [items, setItems] = useState<GroceryItem[]>(() => {
    const base = buildGroceryItems(meals)
    try {
      const saved = localStorage.getItem(storageKey)
      if (saved) {
        const checkedSet: string[] = JSON.parse(saved)
        return base.map(item => ({ ...item, checked: checkedSet.includes(item.baseName) }))
      }
    } catch { /* ignore corrupt storage */ }
    return base
  })
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const checkedNames = items.filter(i => i.checked).map(i => i.baseName)
    try {
      localStorage.setItem(storageKey, JSON.stringify(checkedNames))
    } catch { /* ignore storage errors */ }
  }, [items, storageKey])

  function toggleItem(baseName: string) {
    setItems((prev) =>
      prev.map((item) => item.baseName === baseName ? { ...item, checked: !item.checked } : item)
    )
  }

  function markAllBought() {
    setItems((prev) => prev.map((item) => ({ ...item, checked: true })))
  }

  function clearChecked() {
    setItems((prev) => prev.map((item) => ({ ...item, checked: false })))
  }

  function copyList() {
    const text = CATEGORY_CONFIG
      .map(({ id, label }) => {
        const catItems = items.filter((i) => i.category === id)
        if (!catItems.length) return ''
        return `${label}:\n${catItems.map((i) => `  • ${i.weeklyQty}`).join('\n')}`
      })
      .filter(Boolean)
      .join('\n\n')
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const checkedCount = items.filter((i) => i.checked).length

  if (!meals.length) {
    return (
      <div className="py-12 text-center text-gray-500 text-sm">
        Generate a nutrition plan first to see your grocery list.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-semibold text-gray-200">Weekly Shopping List</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Based on your meal plan × 7 days · {items.length} items
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={copyList}
              className="text-xs text-gray-400 hover:text-brand-400 border border-gray-700 hover:border-brand-700 rounded-lg px-3 py-1.5 transition-colors"
            >
              {copied ? '✓ Copied' : 'Copy List'}
            </button>
            {checkedCount > 0 ? (
              <button
                onClick={clearChecked}
                className="text-xs text-gray-400 hover:text-red-400 border border-gray-700 hover:border-red-800 rounded-lg px-3 py-1.5 transition-colors"
              >
                Clear ({checkedCount})
              </button>
            ) : (
              <button
                onClick={markAllBought}
                className="text-xs text-gray-400 hover:text-green-400 border border-gray-700 hover:border-green-800 rounded-lg px-3 py-1.5 transition-colors"
              >
                Check All
              </button>
            )}
          </div>
        </div>
        {checkedCount > 0 && (
          <div className="mt-2 h-1 bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-green-500 transition-all"
              style={{ width: `${Math.round((checkedCount / items.length) * 100)}%` }}
            />
          </div>
        )}
      </div>

      {/* Categorized items */}
      {CATEGORY_CONFIG.map(({ id, label, icon, color }) => {
        const catItems = items.filter((i) => i.category === id)
        if (!catItems.length) return null
        return (
          <div key={id} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <h4 className={`font-semibold text-sm mb-3 flex items-center gap-2 ${color}`}>
              <span>{icon}</span>
              {label}
              <span className="text-gray-600 font-normal">({catItems.length})</span>
            </h4>
            <div className="space-y-2">
              {catItems.map((item) => (
                <label
                  key={item.baseName}
                  className="flex items-center gap-3 cursor-pointer group"
                >
                  <input
                    type="checkbox"
                    checked={item.checked}
                    onChange={() => toggleItem(item.baseName)}
                    className="accent-brand-500 flex-shrink-0"
                  />
                  <span
                    className={`text-sm leading-snug transition-colors ${
                      item.checked ? 'text-gray-600 line-through' : 'text-gray-300 group-hover:text-gray-200'
                    }`}
                  >
                    {item.weeklyQty}
                  </span>
                </label>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
