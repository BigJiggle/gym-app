// Client-side generator of alternative food combos for the "Swap Meal" sheet.
// Portions are computed dynamically from meal.calories to match the nutrition
// engine, and the results are filtered against the user's food exclusions AND
// their dietary restrictions.
//
// Why restrictions are handled here explicitly: the meal-plan *engine* respects
// dietary_restrictions (via restrictionsToAliasKeys + EXCLUSION_ALIASES), but the
// swap sheet is a separate, purely client-side path. It previously received only
// `food_exclusions` and matched them by naive substring — so a user who set a
// restriction like "Nut allergy" or "Dairy-free" (which the app stores in
// `dietary_restrictions`, NOT `food_exclusions`) was still offered — and could
// persist by tapping — almonds / dairy. That is an allergen-safety leak. We mirror
// the engine's restriction→food mapping here as name fragments so the swap sheet
// honours the same restrictions the generated plan already does.
import type { Meal } from '../../types'

// User-facing restriction labels → lowercase food-name fragments that can appear
// in the swap candidates below. Mirrors the nutrition engine's
// RESTRICTION_TO_ALIAS_KEYS + EXCLUSION_ALIASES (electron/services), reduced to the
// display-name fragments a swap candidate string can contain. Keys are compared
// lowercased/trimmed so any casing of a stored restriction label matches.
const RESTRICTION_FORBIDDEN_TERMS: Record<string, string[]> = {
  'dairy-free':      ['yogurt', 'cottage cheese', 'whey', 'casein', 'cheese', 'kefir', 'paneer', 'ghee', 'labneh'],
  'nut allergy':     ['almond', 'walnut', 'cashew', 'pecan', 'hazelnut', 'pistachio', 'macadamia', 'brazil nut', 'pine nut', 'mixed nuts', 'trail mix'],
  'peanut allergy':  ['peanut'],
  'sesame allergy':  ['sesame', 'tahini'],
  'coconut allergy': ['coconut'],
  'gluten-free':     ['oats', 'oat ', 'bread', 'pasta', 'barley', 'couscous', 'bulgur', 'bagel', 'naan', 'tortilla', 'cracker', 'pretzel', 'seitan', 'noodle', 'wheat'],
  'low fodmap':      ['oats', 'oat ', 'bread', 'pasta', 'barley', 'couscous', 'bulgur', 'bagel', 'naan', 'tortilla', 'cracker', 'pretzel', 'seitan', 'noodle', 'wheat'],
  'no pork':         ['pork', 'ham', 'bacon', 'sausage', 'hot dog'],
  'no shellfish':    ['shrimp', 'crab', 'lobster', 'scallop', 'oyster', 'mussel', 'clam', 'squid', 'crawfish'],
  'no fish':         ['salmon', 'tuna', 'tilapia', 'cod', 'halibut', 'sardine', 'mackerel', 'sea bass', 'trout', 'mahi', 'swordfish', 'herring', 'anchov'],
  'no beef':         ['beef', 'sirloin', 'steak', 'carne asada', 'bulgogi'],
  'no eggs':         ['egg'],
  'no soy':          ['tofu', 'tempeh', 'edamame', 'soy', 'miso'],
  'no chicken':      ['chicken'],
}

// Generates alternative food combos for a given meal slot, filtered by the user's
// food exclusions and dietary restrictions. Same input always yields the same
// output (no AI, no engine/DB changes).
export function getSwapAlternatives(
  meal: Meal,
  dietary: string,
  exclusions: string[] = [],
  restrictions: string[] = []
): string[][] {
  // Expand active restriction labels into the food-name fragments they forbid.
  const restrictionTerms = restrictions.flatMap(
    (r) => RESTRICTION_FORBIDDEN_TERMS[r.toLowerCase().trim()] ?? []
  )

  const isExcluded = (foods: string[]) =>
    foods.some((food) => {
      const f = food.toLowerCase()
      return (
        exclusions.some((ex) => f.includes(ex.replace(/_/g, ' '))) ||
        restrictionTerms.some((term) => f.includes(term))
      )
    })

  const isVegan = dietary === 'vegan'
  const isVeg = dietary === 'vegetarian'
  const mealName = meal.name.toLowerCase()
  const mc = meal.calories

  // Returns gram amount scaled to mealCal * fraction, rounded to nearest 5g, clamped to [min, max]
  const pg = (calPer100g: number, fraction: number, min = 30, max = 280): number => {
    const g = Math.round((mc * fraction / calPer100g) * 100 / 5) * 5
    return Math.max(min, Math.min(max, g))
  }

  let candidates: string[][]

  if (mealName.includes('breakfast')) {
    candidates = isVegan
      ? [
          [`Tofu Scramble (${pg(76, 0.45)}g)`, `Oats (${pg(389, 0.35)}g dry)`, 'Blueberries (100g)'],
          ['Soy Protein Shake (30g)', 'Banana (100g)', `Almond Butter (${pg(614, 0.15, 5, 30)}g)`],
          [`Cream of Rice (${pg(380, 0.35)}g dry)`, 'Pea Protein Shake (30g)', 'Mixed Berries (100g)'],
        ]
      : [
          [`Greek Yogurt (${pg(59, 0.45)}g)`, `Oats (${pg(389, 0.35)}g dry)`, 'Mixed Berries (100g)'],
          ['Egg Whites x6', `Sweet Potato (${pg(86, 0.35)}g)`, 'Spinach (100g)'],
          ['Whey Protein Shake (30g)', `Oats (${pg(389, 0.35)}g dry)`, 'Banana (100g)'],
        ]
  } else if (mealName.includes('snack')) {
    candidates = isVegan
      ? [
          ['Rice Cakes x2', 'Pea Protein Shake (30g)'],
          ['Apple (100g)', 'Almond Butter (16g)'],
          ['Edamame (100g)'],
        ]
      : [
          [`Greek Yogurt (${pg(59, 0.45, 100, 250)}g)`, 'Apple (100g)'],
          [`Cottage Cheese (${pg(98, 0.45, 100, 250)}g)`, 'Rice Cakes x2'],
          ['Whey Protein Shake (30g)', 'Banana (100g)'],
        ]
  } else if (isVegan) {
    candidates = [
      [`Tempeh (${pg(195, 0.45)}g)`, `Brown Rice (${pg(111, 0.35)}g cooked)`, 'Broccoli (120g)', `Walnuts (${pg(654, 0.15, 5, 30)}g)`],
      [`Tofu (${pg(76, 0.45)}g)`, `Quinoa (${pg(120, 0.35)}g cooked)`, 'Mixed Veg (120g)', `Avocado (${pg(160, 0.15, 20, 80)}g)`],
      ['Edamame (120g)', `Sweet Potato (${pg(86, 0.35)}g)`, 'Kale (100g)', `Almond Butter (${pg(614, 0.15, 5, 30)}g)`],
    ]
  } else if (isVeg) {
    candidates = [
      [`Cottage Cheese (${pg(98, 0.45)}g)`, `Sweet Potato (${pg(86, 0.35)}g)`, 'Green Beans (120g)', `Almonds (${pg(579, 0.15, 5, 30)}g)`],
      [`Greek Yogurt (${pg(59, 0.45)}g)`, `Quinoa (${pg(120, 0.35)}g cooked)`, 'Spinach (100g)', `Almonds (${pg(579, 0.15, 5, 30)}g)`],
      ['Eggs x3', `Brown Rice (${pg(111, 0.35)}g cooked)`, 'Broccoli (120g)', `Almonds (${pg(579, 0.15, 5, 30)}g)`],
    ]
  } else {
    candidates = [
      [`Turkey Breast (${pg(157, 0.45)}g)`, `White Rice (${pg(130, 0.35)}g cooked)`, 'Asparagus (150g)', `Almonds (${pg(579, 0.15, 5, 30)}g)`],
      [`Salmon Fillet (${pg(208, 0.45)}g)`, `Sweet Potato (${pg(86, 0.35)}g)`, 'Spinach (100g)', `Almonds (${pg(579, 0.15, 5, 30)}g)`],
      [`Lean Ground Beef (${pg(176, 0.45)}g)`, `Quinoa (${pg(120, 0.35)}g cooked)`, 'Bell Pepper (150g)', `Almonds (${pg(579, 0.15, 5, 30)}g)`],
    ]
  }

  return candidates.filter((alt) => !isExcluded(alt))
}
