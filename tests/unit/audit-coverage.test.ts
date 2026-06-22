import { describe, it, expect } from 'vitest'
import {
  FOOD_CALORIES_PER_100G,
  FOOD_CATEGORY,
  FOOD_SUBSTITUTES,
} from '../../electron/services/foodDatabase'

// Replicate template food ids + culture foods coverage requirements.
// Template scalable food ids (role protein/carb/fat/powder) that hit calcPortionStr -> need cal entry
const templateScalableIds = [
  'oats','soy_protein','banana','almond_butter','greek_yogurt','almonds','eggs','berries',
  'brown_rice','tofu','mixed_veg','cottage_cheese','chicken_breast','broccoli','tempeh',
  'sweet_potato','spinach','avocado','white_rice','pea_protein','apple','whey_protein',
  'quinoa','black_beans','walnuts','salmon','asparagus','olive_oil','pasta','ricotta','rice_cakes',
]

describe('audit coverage', () => {
  it('every scalable template food id has a calorie entry', () => {
    const missing = templateScalableIds.filter(id => !(id in FOOD_CALORIES_PER_100G))
    expect(missing, `missing cal entries: ${missing.join(', ')}`).toEqual([])
  })

  it('every food id in FOOD_CATEGORY of role protein/carb/fat has a calorie entry (for preference swaps)', () => {
    const missing: string[] = []
    for (const [id, cat] of Object.entries(FOOD_CATEGORY)) {
      if (cat === 'veg') continue // veg uses fixed grams
      if (!(id in FOOD_CALORIES_PER_100G)) missing.push(`${id}(${cat})`)
    }
    // veg-role foods are fine without cal; report the rest
    expect(missing, `category foods missing cal: ${missing.join(', ')}`).toEqual([])
  })

  it('common substitute subIds have calorie entries', () => {
    const missing = new Set<string>()
    for (const subs of Object.values(FOOD_SUBSTITUTES)) {
      for (const [subId] of subs) {
        const cat = FOOD_CATEGORY[subId]
        if (cat && cat !== 'veg' && !(subId in FOOD_CALORIES_PER_100G)) missing.add(subId)
      }
    }
    expect([...missing], `substitute foods missing cal: ${[...missing].join(', ')}`).toEqual([])
  })
})
