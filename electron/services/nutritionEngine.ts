import {
  EXCLUSION_ALIASES,
  FOOD_SUBSTITUTES,
  FOOD_CATEGORY,
  SNACK_ONLY_FOODS,
  FOOD_CALORIES_PER_100G,
  type FoodSubstituteTuple,
} from './foodDatabase'

export interface NutritionInput {
  weight_kg: number
  height_cm: number
  age: number
  sex: string
  activity_level: string
  goal: string
  dietary_preference: string
  meal_count: number
  weeks_out?: number
  dietary_restrictions?: string[]   // high-level labels like "Dairy-free", "No pork"
  food_exclusions?: string[]        // specific food IDs from the food picker
  food_preferences?: string[]
  cooking_time_pref?: string
  meal_prep_style?: string
  snack_count?: number
  include_snacks?: boolean
  culture_pref?: string
}

export interface Meal {
  name: string
  time: string
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
  foods: string[]
}

export interface NutritionPlan {
  calories_target: number
  protein_g: number
  carbs_g: number
  fat_g: number
  meal_count: number
  phase: 'deficit' | 'maintenance' | 'surplus'
  meals: Meal[]
}

export const ACTIVITY_MULTIPLIERS: Record<string, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
}

const PHASE_MAP: Record<string, 'deficit' | 'maintenance' | 'surplus'> = {
  cut: 'deficit',
  maintain: 'maintenance',
  recomp: 'deficit',
  bulk: 'surplus',
}

// Phase-aware calorie adjustment — deficit tightens as show approaches.
// Bulk: lean surplus off-season; if a show exists, treat like cut (comp prep overrides bulk intent).
// Peak week (0-1 wk): ease off so muscles fill out on stage.
export function getPhaseAwareDeficit(weeksOut: number | undefined, goal: string): number {
  if (goal === 'maintain') {
    // Off-season / no show → true maintenance calories.
    if (weeksOut === undefined) return 0
    // A show is on the calendar: pure maintenance won't get the athlete stage-lean.
    // Apply a mild, phase-aware deficit that still eases off into peak week so the
    // physique fills out on stage.
    if (weeksOut > 12) return -200
    if (weeksOut > 4)  return -300
    if (weeksOut > 1)  return -350
    return -150 // peak week ease-off
  }
  if (goal === 'bulk') {
    // Off-season lean surplus; if somehow bulk+show coexist, treat as cut
    if (weeksOut === undefined) return 300
    // Show exists — comp prep wins, use cut deficit
    if (weeksOut > 16) return -300
    if (weeksOut > 12) return -400
    if (weeksOut > 8)  return -500
    if (weeksOut > 4)  return -600
    if (weeksOut > 1)  return -700
    return -200  // peak week
  }
  const isRecomp = goal === 'recomp'
  if (weeksOut === undefined) return isRecomp ? -150 : -350
  if (weeksOut > 16) return isRecomp ? -100 : -300
  if (weeksOut > 12) return isRecomp ? -150 : -400
  if (weeksOut > 8)  return isRecomp ? -200 : -500
  if (weeksOut > 4)  return isRecomp ? -250 : -600
  if (weeksOut > 1)  return isRecomp ? -300 : -700
  return isRecomp ? -100 : -200  // peak week
}

// Maps user-facing dietary restriction labels → EXCLUSION_ALIASES keys.
// Allows "Dairy-free" to automatically exclude every food in EXCLUSION_ALIASES['dairy'].
const RESTRICTION_TO_ALIAS_KEYS: Record<string, string[]> = {
  'dairy-free':      ['dairy'],
  'no pork':         ['pork'],
  'no shellfish':    ['shellfish'],
  'nut allergy':     ['nuts'],
  'peanut allergy':  ['peanuts'],
  'sesame allergy':  ['sesame'],
  'coconut allergy': ['coconut'],
  'gluten-free':     ['gluten'],
  'no beef':         ['beef'],
  'no fish':         ['fish'],
  'no eggs':         ['eggs'],
  'no soy':          ['soy'],
  'no chicken':      ['chicken'],
  'low fodmap':      ['gluten'],
}

// Converts an array of user restriction labels into alias keys usable by isExcluded.
export function restrictionsToAliasKeys(restrictions: string[]): string[] {
  const keys: string[] = []
  for (const r of restrictions) {
    const mapped = RESTRICTION_TO_ALIAS_KEYS[r.toLowerCase().trim()]
    if (mapped) keys.push(...mapped)
  }
  return keys
}

// ─────────────────────────────────────────────
// TemplateFoodItem — structured food description used to dynamically compute portions
// ─────────────────────────────────────────────
interface TemplateFoodItem {
  id: string
  display: string
  // protein/carb/fat → portions scale with meal calories
  // veg/fruit/powder → fixed gram amounts (ROLE_FIXED_G)
  // fixed → fixedLabel is always returned as-is
  role: 'protein' | 'carb' | 'veg' | 'fat' | 'fruit' | 'powder' | 'fixed'
  fixedLabel?: string   // if set, calcPortionStr returns this string directly
  unitSuffix?: string   // appended after grams: 'dry', 'cooked'
}

// Fraction of meal calories allocated to each scalable role
const MEAL_CAL_FRACTIONS: Record<string, number> = { protein: 0.45, carb: 0.35, fat: 0.15 }
// Fixed gram amounts for roles that don't scale
const ROLE_FIXED_G: Record<string, number> = { veg: 120, fruit: 100, powder: 30 }
// Clamp ranges for scalable roles
const ROLE_MIN_G: Record<string, number> = { protein: 40, carb: 30, fat: 5 }
const ROLE_MAX_G: Record<string, number> = { protein: 280, carb: 280, fat: 30 }

function calcPortionStr(item: TemplateFoodItem, mealCal: number): string {
  if (item.fixedLabel) return item.fixedLabel
  const { role, id, display, unitSuffix } = item
  const suffix = unitSuffix ? ` ${unitSuffix}` : ''

  if (role === 'veg' || role === 'fruit' || role === 'powder') {
    return `${display} (${ROLE_FIXED_G[role]}g${suffix})`
  }

  const calPer100g = FOOD_CALORIES_PER_100G[id]
  if (!calPer100g) return `${display} (100g${suffix})`

  const fraction = MEAL_CAL_FRACTIONS[role] ?? 0.35
  const budget = mealCal * fraction
  // Round to nearest 5g
  let grams = Math.round((budget / calPer100g) * 100 / 5) * 5
  const min = ROLE_MIN_G[role] ?? 30
  const max = ROLE_MAX_G[role] ?? 300
  grams = Math.max(min, Math.min(max, grams))

  return `${display} (${grams}g${suffix})`
}

// ─────────────────────────────────────────────
// Cook-time meal richness
// ─────────────────────────────────────────────
// A meal's calories/macros are computed independently of its `foods` display list
// (see buildMeals), so we can vary how elaborate the plate reads without touching the
// macro targets. Cook time controls that richness:
//   'quick'  → under 15 min: trim to the two core components (protein + carb), minimal prep
//   'medium' → 15–30 min: the hand-authored template, unchanged
//   'chef'   → 30+ min: append rotating garnishes/sides for a more elaborate, varied plate
// Garnishes are allergen-free, vegan, fixed-label items so they never collide with a
// user's exclusions/restrictions and never enter portion/calorie math.
const CHEF_GARNISHES: TemplateFoodItem[] = [
  { id: 'herbs',       display: 'Fresh Herbs & Lemon',    role: 'fixed', fixedLabel: 'Fresh Herbs & Lemon' },
  { id: 'side_salad',  display: 'Mixed Side Salad',       role: 'fixed', fixedLabel: 'Mixed Side Salad' },
  { id: 'roasted_veg', display: 'Roasted Seasonal Veg',   role: 'fixed', fixedLabel: 'Roasted Seasonal Veg' },
  { id: 'garlic_evoo', display: 'Garlic & Olive Oil',     role: 'fixed', fixedLabel: 'Garlic & Olive Oil Drizzle' },
  { id: 'spice_rub',   display: 'Spice Rub & Marinade',   role: 'fixed', fixedLabel: 'Spice Rub & Marinade' },
  { id: 'pickled_veg', display: 'Pickled Vegetables',     role: 'fixed', fixedLabel: 'Pickled Vegetables' },
]

function applyCookingStyle(
  foods: TemplateFoodItem[],
  cookingPref: string,
  mealIndex: number,
  isSnack: boolean
): TemplateFoodItem[] {
  if (cookingPref === 'quick') {
    // Fast, minimal prep: keep just the core components. Snacks already read as simple
    // (≤2 items) so slicing leaves them untouched.
    return foods.length > 2 ? foods.slice(0, 2) : foods
  }
  if (cookingPref === 'chef' && !isSnack) {
    // Elaborate main meals: add two rotating garnishes for variety. Snacks stay simple —
    // a herb garnish on a yogurt snack would read as noise.
    const n = CHEF_GARNISHES.length
    const g1 = CHEF_GARNISHES[mealIndex % n]
    const g2 = CHEF_GARNISHES[(mealIndex + 3) % n]
    return [...foods, g1, g2]
  }
  return foods
}

// ─────────────────────────────────────────────
// Meal-prep style food consolidation
// ─────────────────────────────────────────────
// How the user preps changes which foods land on the plate (macros are unaffected —
// see buildMeals; consolidation only swaps food identities of the same role, and every
// portion is derived from the meal's calories, not the food, so totals never move):
//   'daily' → cook fresh each day: every meal keeps its own varied foods (default).
//   'batch' → cook in bulk once: all cooked main meals converge on ONE shared protein and
//             ONE shared carb — the batch-cooked staples portioned across the day.
//   'mixed' → part batch, part fresh: cooked mains share ONE batch protein but keep their
//             own carbs.
// A "cooked main" is a non-snack meal carrying both a protein-role and a carb-role item
// (Lunch/Dinner/Mid-Morning). Breakfast (no protein-role item), grab-and-go meals, and
// snacks are never consolidated — you don't batch-cook eggs or a protein shake.
function isCookedMain(foods: TemplateFoodItem[], name: string): boolean {
  return (
    !name.toLowerCase().includes('snack') &&
    foods.some(f => f.role === 'protein') &&
    foods.some(f => f.role === 'carb')
  )
}

function applyPrepStyle(
  foodLists: TemplateFoodItem[][],
  templates: MealTemplate[],
  prepStyle: string
): TemplateFoodItem[][] {
  if (prepStyle !== 'batch' && prepStyle !== 'mixed') return foodLists
  const baseIdx = foodLists.findIndex((foods, i) => isCookedMain(foods, templates[i].name))
  if (baseIdx < 0) return foodLists // no cooked main to batch (e.g. only breakfast + snacks)
  const baseProtein = foodLists[baseIdx].find(f => f.role === 'protein')
  const baseCarb = foodLists[baseIdx].find(f => f.role === 'carb')
  return foodLists.map((foods, i) => {
    if (!isCookedMain(foods, templates[i].name)) return foods
    return foods.map(f => {
      if (baseProtein && f.role === 'protein') return baseProtein
      if (prepStyle === 'batch' && baseCarb && f.role === 'carb') return baseCarb
      return f
    })
  })
}

// Checks if a food ID is excluded, including via alias and normalized human-readable name.
function isExcluded(id: string, exclusions: string[]): boolean {
  if (!exclusions.length) return false
  if (exclusions.includes(id)) return true
  for (const exc of exclusions) {
    // Normalize: "Egg Whites" → "egg_whites", handle hyphens and special chars
    const normalized = exc.toLowerCase().replace(/[\s\-]+/g, '_').replace(/[^a-z0-9_]/g, '')
    if (normalized === id) return true                    // direct normalized match
    const aliases = EXCLUSION_ALIASES[normalized]
    if (aliases?.includes(id)) return true                // alias-key lookup
  }
  return false
}

function titleCase(id: string): string {
  return id.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

// Returns a TemplateFoodItem for a meal slot, respecting exclusions and preferences.
// If the default food is excluded → iterate FOOD_SUBSTITUTES until finding one not excluded.
// If a preferred food matches the same macro category and is not excluded → use it instead.
//
// isMainMeal (default true): when true, foods in SNACK_ONLY_FOODS are skipped during
// preference substitution. This prevents greek_yogurt/apple/etc. from replacing
// salmon or rice in Dinner/Lunch because they share the same macro category.
// Pass false for snack meal templates where snack foods are explicitly appropriate.
function getFood(
  id: string,
  exclusions: string[],
  fallback: TemplateFoodItem,
  preferences?: string[],
  isMainMeal = true
): TemplateFoodItem {
  if (!isExcluded(id, exclusions)) {
    if (preferences?.length) {
      const category = FOOD_CATEGORY[id]
      if (category) {
        for (const prefId of preferences) {
          if (prefId === id) break                          // already the preferred food
          if (isExcluded(prefId, exclusions)) continue
          // Skip snack-only foods when substituting into main meal slots so that a
          // preference for greek_yogurt or apple never replaces salmon or rice in dinner.
          if (isMainMeal && SNACK_ONLY_FOODS.has(prefId)) continue
          if (FOOD_CATEGORY[prefId] === category) {
            return { id: prefId, display: titleCase(prefId), role: fallback.role, unitSuffix: fallback.unitSuffix }
          }
        }
      }
    }
    return fallback
  }
  // Iterate substitutes in order — skip any whose food_id is itself excluded
  const subs = FOOD_SUBSTITUTES[id] as FoodSubstituteTuple[] | undefined
  if (subs) {
    for (const [subId] of subs) {
      if (!isExcluded(subId, exclusions)) {
        const role = (FOOD_CATEGORY[subId] as TemplateFoodItem['role']) ?? fallback.role
        return { id: subId, display: titleCase(subId), role, unitSuffix: fallback.unitSuffix }
      }
    }
  }
  return fallback
}

export function calcBMR(weight_kg: number, height_cm: number, age: number, sex: string): number {
  const base = 10 * weight_kg + 6.25 * height_cm - 5 * age
  return sex === 'female' ? base - 161 : base + 5
}

function buildMeals(
  totalCal: number,
  protein_g: number,
  carbs_g: number,
  fat_g: number,
  mealCount: number,
  dietary_preference: string,
  food_exclusions?: string[],
  food_preferences?: string[],
  cooking_time_pref?: string,
  snack_count?: number,
  culture_pref?: string,
  dietary_restrictions?: string[],
  meal_prep_style?: string
): Meal[] {
  // Merge specific food ID exclusions with aliases derived from restriction labels
  const restrictionAliases = restrictionsToAliasKeys(dietary_restrictions ?? [])
  const allExclusions = [...(food_exclusions ?? []), ...restrictionAliases]
  const allPreferences = food_preferences ?? []
  const snackCount = snack_count ?? 0
  const mealTemplates = getMealTemplates(mealCount, snackCount, dietary_preference, allExclusions, culture_pref ?? 'any', allPreferences)

  // On very low-calorie plans (e.g. 1200 kcal min) a fixed 200 kcal snack can exceed
  // the per-main-meal allocation. Cap at the even per-slot share so snacks never
  // outsize main meals. When there are no snacks the value is unused.
  const SNACK_CAL = snackCount > 0
    ? Math.min(200, Math.floor(totalCal / mealTemplates.length))
    : 200
  const mainCount = mealTemplates.length - snackCount
  const totalSnackCal = snackCount * SNACK_CAL
  // Do not inflate mainCalories with an 800-floor — when snack_count=3 on a 1200 kcal
  // plan the guard caused meal sums to exceed the daily target by ~200 kcal.
  const mainCalories = Math.max(0, totalCal - totalSnackCal)
  const perMainCal = mainCount > 0 ? Math.round(mainCalories / mainCount) : 0

  // Protein and fat are fixed by body weight; carbs fill the rest
  // Distribute macros proportionally across meal types
  const proteinCalRatio = (protein_g * 4) / totalCal
  const fatCalRatio = (fat_g * 9) / totalCal

  // Pass 1: build each meal's food list, applying cook-time styling per meal.
  const styledLists = mealTemplates.map((t, i) => {
    const isSnack = t.name.toLowerCase().includes('snack')
    const rawFoods = t.foods(dietary_preference)
    // Cook time modulates how elaborate the plate reads (macros are unaffected).
    return applyCookingStyle(rawFoods, cooking_time_pref ?? 'medium', i, isSnack)
  })
  // Pass 2: meal-prep style consolidates food selection across cooked main meals
  // (batch/mixed share a protein ± carb). 'daily' leaves the varied lists untouched.
  const preppedLists = applyPrepStyle(styledLists, mealTemplates, meal_prep_style ?? 'daily')

  return mealTemplates.map((t, i) => {
    const isSnack = t.name.toLowerCase().includes('snack')
    const cal = isSnack ? SNACK_CAL : perMainCal
    const pro = Math.round((cal * proteinCalRatio) / 4)
    const fat = Math.round((cal * fatCalRatio) / 9)
    const carb = Math.max(0, Math.round((cal - pro * 4 - fat * 9) / 4))

    const foods = preppedLists[i].map(item => calcPortionStr(item, cal))

    return {
      name: t.name,
      time: t.time,
      calories: cal,
      protein_g: pro,
      carbs_g: carb,
      fat_g: fat,
      foods
    }
  })
}

interface MealTemplate {
  name: string
  time: string
  foods: (pref: string) => TemplateFoodItem[]
}

// Culture-specific food items — each entry is a TemplateFoodItem so portions scale correctly
const cultureFoods: Record<string, Record<string, TemplateFoodItem>> = {
  indian: {
    protein_main:  { id: 'chicken_tikka', display: 'Chicken Tikka',        role: 'protein' },
    protein_alt:   { id: 'dal',           display: 'Dal',                  role: 'protein', unitSuffix: 'cooked' },
    carb_main:     { id: 'basmati_rice',  display: 'Basmati Rice',         role: 'carb',    unitSuffix: 'cooked' },
    carb_alt:      { id: 'roti',          display: 'Whole Wheat Roti',     role: 'fixed',   fixedLabel: 'Whole Wheat Roti (2 pieces)' },
    veg:           { id: 'spinach',       display: 'Saag (Spinach Puree)', role: 'veg' },
    dairy:         { id: 'greek_yogurt',  display: 'Dahi/Yogurt',          role: 'protein', fixedLabel: 'Dahi/Yogurt (200g)' },
    fat:           { id: 'ghee',          display: 'Ghee',                 role: 'fat' },
    plant_protein: { id: 'paneer',        display: 'Paneer',               role: 'protein' },
  },
  mexican: {
    protein_main:  { id: 'chicken_breast', display: 'Chicken Tinga',   role: 'protein' },
    protein_alt:   { id: 'carne_asada',    display: 'Carne Asada',     role: 'protein' },
    carb_main:     { id: 'black_beans',    display: 'Black Beans',     role: 'carb',    unitSuffix: 'cooked' },
    carb_alt:      { id: 'corn_tortilla',  display: 'Corn Tortilla',   role: 'fixed',   fixedLabel: 'Corn Tortilla x2' },
    veg:           { id: 'mixed_veg',      display: 'Pico de Gallo',   role: 'veg',     fixedLabel: 'Pico de Gallo (100g)' },
    dairy:         { id: 'cheddar',        display: 'Cotija Cheese',   role: 'fat',     fixedLabel: 'Cotija Cheese (30g)' },
    fat:           { id: 'avocado',        display: 'Avocado',         role: 'fat' },
    plant_protein: { id: 'pinto_beans',    display: 'Pinto Beans',     role: 'carb',    unitSuffix: 'cooked' },
  },
  mediterranean: {
    protein_main:  { id: 'chicken_breast', display: 'Grilled Chicken',        role: 'protein' },
    protein_alt:   { id: 'halloumi',       display: 'Grilled Halloumi',        role: 'protein', fixedLabel: 'Grilled Halloumi (100g)' },
    carb_main:     { id: 'pita_bread',     display: 'Whole Wheat Pita',        role: 'fixed',   fixedLabel: 'Whole Wheat Pita (1 piece)' },
    carb_alt:      { id: 'quinoa',         display: 'Quinoa',                  role: 'carb',    unitSuffix: 'cooked' },
    veg:           { id: 'mixed_veg',      display: 'Cucumber & Tomato Salad', role: 'veg',     fixedLabel: 'Cucumber & Tomato Salad (150g)' },
    dairy:         { id: 'greek_yogurt',   display: 'Greek Yogurt',            role: 'protein', fixedLabel: 'Greek Yogurt (200g)' },
    fat:           { id: 'chickpeas',      display: 'Hummus',                  role: 'fat',     fixedLabel: 'Hummus (50g)' },
    plant_protein: { id: 'chickpeas',      display: 'Falafel',                 role: 'protein', fixedLabel: 'Falafel (100g)' },
  },
  asian: {
    protein_main:  { id: 'chicken_breast', display: 'Chicken Breast', role: 'protein' },
    protein_alt:   { id: 'tofu',           display: 'Silken Tofu',    role: 'protein' },
    carb_main:     { id: 'jasmine_rice',   display: 'Jasmine Rice',   role: 'carb',    unitSuffix: 'cooked' },
    carb_alt:      { id: 'pasta',          display: 'Soba Noodles',   role: 'fixed',   fixedLabel: 'Soba Noodles (200g cooked)' },
    veg:           { id: 'edamame',        display: 'Edamame',        role: 'veg',     fixedLabel: 'Edamame (150g)' },
    dairy:         { id: 'soy_protein',    display: 'Soy Milk',       role: 'powder',  fixedLabel: 'Soy Milk (200ml)' },
    fat:           { id: 'sesame_seeds',   display: 'Sesame Oil',     role: 'fat',     fixedLabel: 'Sesame Oil (10g)' },
    plant_protein: { id: 'tofu',           display: 'Firm Tofu',      role: 'protein' },
  },
  west_african: {
    protein_main: { id: 'tilapia',       display: 'Grilled Tilapia',       role: 'protein' },
    protein_alt:  { id: 'lean_beef',     display: 'Egusi Beef Stew',       role: 'protein', fixedLabel: 'Egusi Beef Stew (200g)' },
    carb_main:    { id: 'white_rice',    display: 'Jollof Rice',            role: 'carb',    unitSuffix: 'cooked' },
    carb_alt:     { id: 'sweet_potato',  display: 'Fried Plantain',         role: 'carb',    fixedLabel: 'Fried Plantain (150g)' },
    veg:          { id: 'mixed_veg',     display: 'Sautéed Greens',         role: 'veg' },
    dairy:        { id: 'coconut_oil',   display: 'Coconut Milk',           role: 'fat',     fixedLabel: 'Coconut Milk (200ml)' },
    fat:          { id: 'peanut_butter', display: 'Groundnut Sauce',        role: 'fat',     fixedLabel: 'Groundnut Sauce (30g)' },
    plant_protein:{ id: 'black_beans',   display: 'Black-Eyed Pea Stew',   role: 'protein', unitSuffix: 'cooked' },
  },
  japanese: {
    protein_main:  { id: 'chicken_breast', display: 'Yakitori Chicken',    role: 'protein' },
    protein_alt:   { id: 'salmon',         display: 'Salmon Sashimi',       role: 'protein', fixedLabel: 'Salmon Sashimi (120g)' },
    carb_main:     { id: 'jasmine_rice',   display: 'Steamed Rice',         role: 'carb',    unitSuffix: 'cooked' },
    carb_alt:      { id: 'pasta',          display: 'Soba Noodles',         role: 'fixed',   fixedLabel: 'Soba Noodles (200g cooked)' },
    veg:           { id: 'mixed_veg',      display: 'Nori Seaweed Salad',   role: 'veg',     fixedLabel: 'Nori Seaweed Salad (100g)' },
    dairy:         { id: 'soy_protein',    display: 'Miso Soup',            role: 'fixed',   fixedLabel: 'Miso Soup (250ml)' },
    fat:           { id: 'sesame_seeds',   display: 'Sesame Oil',           role: 'fat',     fixedLabel: 'Sesame Oil (10g)' },
    plant_protein: { id: 'edamame',        display: 'Edamame',              role: 'veg',     fixedLabel: 'Edamame (150g)' },
  },
  korean: {
    protein_main:  { id: 'lean_beef',    display: 'Bulgogi Beef',           role: 'protein' },
    protein_alt:   { id: 'tofu',         display: 'Korean Fried Tofu',      role: 'protein', fixedLabel: 'Korean Fried Tofu (200g)' },
    carb_main:     { id: 'white_rice',   display: 'Bibimbap Rice Bowl',     role: 'carb',    fixedLabel: 'Bibimbap Rice Bowl (250g cooked)' },
    carb_alt:      { id: 'pasta',        display: 'Japchae Noodles',        role: 'fixed',   fixedLabel: 'Japchae Noodles (200g cooked)' },
    veg:           { id: 'mixed_veg',    display: 'Kimchi',                 role: 'veg',     fixedLabel: 'Kimchi (150g)' },
    dairy:         { id: 'soy_protein',  display: 'Soy Milk',               role: 'fixed',   fixedLabel: 'Soy Milk (200ml)' },
    fat:           { id: 'sesame_seeds', display: 'Sesame Oil',             role: 'fat',     fixedLabel: 'Sesame Oil (10g)' },
    plant_protein: { id: 'tofu',         display: 'Braised Tofu',           role: 'protein', fixedLabel: 'Braised Tofu (200g)' },
  },
  middle_eastern: {
    protein_main:  { id: 'lamb_kebab',   display: 'Grilled Lamb Kebab',     role: 'protein', fixedLabel: 'Grilled Lamb Kebab (150g)' },
    protein_alt:   { id: 'lentils',      display: 'Lentil Soup',            role: 'protein', fixedLabel: 'Lentil Soup (300g)' },
    carb_main:     { id: 'couscous',     display: 'Couscous',               role: 'carb',    unitSuffix: 'cooked' },
    carb_alt:      { id: 'pita_bread',   display: 'Pita Bread',             role: 'fixed',   fixedLabel: 'Pita Bread (1 piece)' },
    veg:           { id: 'mixed_veg',    display: 'Tabbouleh Salad',        role: 'veg',     fixedLabel: 'Tabbouleh (150g)' },
    dairy:         { id: 'greek_yogurt', display: 'Labneh',                 role: 'protein', fixedLabel: 'Labneh (150g)' },
    fat:           { id: 'chickpeas',    display: 'Hummus',                 role: 'fat',     fixedLabel: 'Hummus (50g)' },
    plant_protein: { id: 'chickpeas',    display: 'Spiced Chickpeas',       role: 'protein', unitSuffix: 'cooked' },
  },
}

function getCultureFood(culturePref: string, key: string, pref: string, fallback: TemplateFoodItem, exclusions: string[] = []): TemplateFoodItem {
  if (culturePref === 'any') return fallback
  const culture = cultureFoods[culturePref]
  if (!culture) return fallback
  if (key === 'protein_main' && (pref === 'vegan' || pref === 'vegetarian')) {
    const item = culture.plant_protein ?? fallback
    return isExcluded(item.id, exclusions) ? fallback : item
  }
  const item = culture[key] ?? fallback
  return isExcluded(item.id, exclusions) ? fallback : item
}

function getMealTemplates(
  mainCount: number,
  snackCount: number,
  _pref: string,
  exclusions: string[] = [],
  culturePref: string = 'any',
  preferences: string[] = []
): MealTemplate[] {
  const all: MealTemplate[] = [
    // ── 0: Breakfast ──
    {
      name: 'Breakfast',
      time: '07:00',
      foods: (p) => {
        if (p === 'vegan') {
          return [
            getFood('oats',         exclusions, { id: 'oats',         display: 'Oats',              role: 'carb',    unitSuffix: 'dry' }, preferences),
            getFood('soy_protein',  exclusions, { id: 'soy_protein',  display: 'Soy Protein Shake', role: 'powder' }, preferences),
            getFood('banana',       exclusions, { id: 'banana',       display: 'Banana',            role: 'fruit' },  preferences),
            getCultureFood(culturePref, 'fat', p,
              getFood('almond_butter', exclusions, { id: 'almond_butter', display: 'Almond Butter', role: 'fat' }, preferences), exclusions
            ),
          ]
        }
        if (p === 'vegetarian') {
          return [
            getFood('oats', exclusions, { id: 'oats', display: 'Oats', role: 'carb', unitSuffix: 'dry' }, preferences),
            getCultureFood(culturePref, 'dairy', p,
              getFood('greek_yogurt', exclusions, { id: 'greek_yogurt', display: 'Greek Yogurt', role: 'protein' }, preferences), exclusions
            ),
            getFood('banana',  exclusions, { id: 'banana',  display: 'Banana',  role: 'fruit' }, preferences),
            getFood('almonds', exclusions, { id: 'almonds', display: 'Almonds', role: 'fat' },   preferences),
          ]
        }
        return [
          getFood('oats',    exclusions, { id: 'oats',    display: 'Oats',       role: 'carb',  unitSuffix: 'dry' }, preferences),
          getFood('eggs',    exclusions, { id: 'eggs',    display: 'Whole Eggs', role: 'fixed', fixedLabel: 'Whole Eggs x3' }, preferences),
          getFood('berries', exclusions, { id: 'berries', display: 'Berries',    role: 'fruit' }, preferences),
          getFood('almonds', exclusions, { id: 'almonds', display: 'Almonds',    role: 'fat' }, preferences),
        ]
      }
    },
    // ── 1: Mid-Morning ──
    {
      name: 'Mid-Morning',
      time: '10:00',
      foods: (p) => {
        if (p === 'vegan') {
          return [
            getFood('brown_rice',    exclusions, { id: 'brown_rice',    display: 'Brown Rice',       role: 'carb',    unitSuffix: 'cooked' }, preferences),
            getFood('tofu',          exclusions, { id: 'tofu',          display: 'Tofu',             role: 'protein' }, preferences),
            getFood('mixed_veg',     exclusions, { id: 'mixed_veg',     display: 'Mixed Vegetables', role: 'veg' },    preferences),
            getFood('almond_butter', exclusions, { id: 'almond_butter', display: 'Almond Butter',   role: 'fat' },    preferences),
          ]
        }
        if (p === 'vegetarian') {
          return [
            getFood('brown_rice',     exclusions, { id: 'brown_rice',     display: 'Brown Rice',     role: 'carb',    unitSuffix: 'cooked' }, preferences),
            getFood('cottage_cheese', exclusions, { id: 'cottage_cheese', display: 'Cottage Cheese', role: 'protein' }, preferences),
            getFood('mixed_veg',      exclusions, { id: 'mixed_veg',      display: 'Vegetables',     role: 'veg' },    preferences),
            getFood('almonds',        exclusions, { id: 'almonds',        display: 'Almonds',        role: 'fat' },    preferences),
          ]
        }
        return [
          getFood('brown_rice',    exclusions, { id: 'brown_rice',    display: 'Brown Rice',    role: 'carb',    unitSuffix: 'cooked' }, preferences),
          getFood('chicken_breast',exclusions, { id: 'chicken_breast',display: 'Chicken Breast',role: 'protein' }, preferences),
          getFood('broccoli',      exclusions, { id: 'broccoli',      display: 'Broccoli',      role: 'veg' },    preferences),
          getFood('almonds',       exclusions, { id: 'almonds',       display: 'Almonds',       role: 'fat' },    preferences),
        ]
      }
    },
    // ── 2: Lunch ──
    {
      name: 'Lunch',
      time: '13:00',
      foods: (p) => {
        if (p === 'vegan') {
          return [
            getCultureFood(culturePref, 'plant_protein', p,
              getFood('tempeh', exclusions, { id: 'tempeh', display: 'Tempeh', role: 'protein' }, preferences), exclusions
            ),
            getCultureFood(culturePref, 'carb_main', p,
              getFood('sweet_potato', exclusions, { id: 'sweet_potato', display: 'Sweet Potato', role: 'carb' }, preferences), exclusions
            ),
            getCultureFood(culturePref, 'veg', p,
              getFood('spinach', exclusions, { id: 'spinach', display: 'Spinach', role: 'veg' }, preferences), exclusions
            ),
            getCultureFood(culturePref, 'fat', p,
              getFood('avocado', exclusions, { id: 'avocado', display: 'Avocado', role: 'fat' }, preferences), exclusions
            ),
          ]
        }
        if (p === 'vegetarian') {
          // getCultureFood with key 'plant_protein' + pref 'vegetarian' correctly selects
          // the culture-specific plant protein. For culture='any' it returns the fallback
          // (cottage_cheese) rather than falling through to chicken_breast.
          return [
            getCultureFood(culturePref, 'plant_protein', p,
              getFood('cottage_cheese', exclusions, { id: 'cottage_cheese', display: 'Cottage Cheese', role: 'protein' }, preferences), exclusions
            ),
            getCultureFood(culturePref, 'carb_main', p,
              getFood('brown_rice', exclusions, { id: 'brown_rice', display: 'Brown Rice', role: 'carb', unitSuffix: 'cooked' }, preferences), exclusions
            ),
            getCultureFood(culturePref, 'veg', p,
              getFood('broccoli', exclusions, { id: 'broccoli', display: 'Broccoli', role: 'veg' }, preferences), exclusions
            ),
            getCultureFood(culturePref, 'fat', p,
              getFood('almonds', exclusions, { id: 'almonds', display: 'Almonds', role: 'fat' }, preferences), exclusions
            ),
          ]
        }
        return [
          getCultureFood(culturePref, 'protein_main', p,
            getFood('chicken_breast', exclusions, { id: 'chicken_breast', display: 'Chicken Breast', role: 'protein' }, preferences), exclusions
          ),
          getCultureFood(culturePref, 'carb_main', p,
            getFood('white_rice', exclusions, { id: 'white_rice', display: 'White Rice', role: 'carb', unitSuffix: 'cooked' }, preferences), exclusions
          ),
          getCultureFood(culturePref, 'veg', p,
            getFood('broccoli', exclusions, { id: 'broccoli', display: 'Broccoli', role: 'veg' }, preferences), exclusions
          ),
          getCultureFood(culturePref, 'fat', p,
            getFood('almonds', exclusions, { id: 'almonds', display: 'Almonds', role: 'fat' }, preferences), exclusions
          ),
        ]
      }
    },
    // ── 3: Pre-Workout ──
    {
      name: 'Pre-Workout',
      time: '16:00',
      foods: (p) => {
        if (p === 'vegan') {
          return [
            getFood('rice_cakes', exclusions, { id: 'rice_cakes', display: 'Rice Cakes', role: 'fixed', fixedLabel: 'Rice Cakes x3' }, preferences),
            getFood('pea_protein', exclusions, { id: 'pea_protein', display: 'Pea Protein Shake', role: 'powder' }, preferences),
            getFood('apple', exclusions, { id: 'apple', display: 'Apple', role: 'fruit' }, preferences),
          ]
        }
        return [
          getFood('rice_cakes',   exclusions, { id: 'rice_cakes',   display: 'Rice Cakes',         role: 'fixed',  fixedLabel: 'Rice Cakes x3' }, preferences),
          getFood('whey_protein', exclusions, { id: 'whey_protein', display: 'Whey Protein Shake', role: 'powder' }, preferences),
          getFood('apple',        exclusions, { id: 'apple',        display: 'Apple',              role: 'fruit' },  preferences),
        ]
      }
    },
    // ── 4: Post-Workout ──
    {
      name: 'Post-Workout',
      time: '18:30',
      foods: (p) => {
        if (p === 'vegan') {
          return [
            getFood('white_rice',  exclusions, { id: 'white_rice',  display: 'White Rice',       role: 'carb',   unitSuffix: 'cooked' }, preferences),
            getFood('soy_protein', exclusions, { id: 'soy_protein', display: 'Soy Protein Shake',role: 'powder' }, preferences),
            getFood('banana',      exclusions, { id: 'banana',      display: 'Banana',           role: 'fruit' },  preferences),
          ]
        }
        return [
          getFood('white_rice',   exclusions, { id: 'white_rice',   display: 'White Rice',        role: 'carb',   unitSuffix: 'cooked' }, preferences),
          getFood('whey_protein', exclusions, { id: 'whey_protein', display: 'Whey Protein Shake',role: 'powder' }, preferences),
          getFood('banana',       exclusions, { id: 'banana',       display: 'Banana',            role: 'fruit' },  preferences),
        ]
      }
    },
    // ── 5: Dinner ──
    {
      name: 'Dinner',
      time: '20:00',
      foods: (p) => {
        if (p === 'vegan') {
          return [
            getFood('quinoa', exclusions, { id: 'quinoa', display: 'Quinoa', role: 'carb', unitSuffix: 'cooked' }, preferences),
            getCultureFood(culturePref, 'plant_protein', p,
              getFood('black_beans', exclusions, { id: 'black_beans', display: 'Black Beans', role: 'protein' }, preferences), exclusions
            ),
            getFood('mixed_veg', exclusions, { id: 'mixed_veg', display: 'Roasted Vegetables', role: 'veg' }, preferences),
            getCultureFood(culturePref, 'fat', p,
              getFood('walnuts', exclusions, { id: 'walnuts', display: 'Walnuts', role: 'fat' }, preferences), exclusions
            ),
          ]
        }
        if (p === 'vegetarian') {
          return [
            getCultureFood(culturePref, 'carb_alt', p,
              getFood('pasta', exclusions, { id: 'pasta', display: 'Pasta', role: 'carb', unitSuffix: 'cooked' }, preferences), exclusions
            ),
            getCultureFood(culturePref, 'plant_protein', p,
              getFood('ricotta', exclusions, { id: 'ricotta', display: 'Ricotta', role: 'protein' }, preferences), exclusions
            ),
            getCultureFood(culturePref, 'veg', p,
              getFood('mixed_veg', exclusions, { id: 'mixed_veg', display: 'Vegetables', role: 'veg' }, preferences), exclusions
            ),
            getCultureFood(culturePref, 'fat', p,
              getFood('olive_oil', exclusions, { id: 'olive_oil', display: 'Olive Oil', role: 'fat', fixedLabel: 'Olive Oil (15g)' }, preferences), exclusions
            ),
          ]
        }
        return [
          getCultureFood(culturePref, 'carb_main', p,
            getFood('white_rice', exclusions, { id: 'white_rice', display: 'White Rice', role: 'carb', unitSuffix: 'cooked' }, preferences), exclusions
          ),
          getCultureFood(culturePref, 'protein_main', p,
            getFood('salmon', exclusions, { id: 'salmon', display: 'Salmon Fillet', role: 'protein' }, preferences), exclusions
          ),
          getCultureFood(culturePref, 'veg', p,
            getFood('asparagus', exclusions, { id: 'asparagus', display: 'Asparagus', role: 'veg' }, preferences), exclusions
          ),
          getCultureFood(culturePref, 'fat', p,
            getFood('olive_oil', exclusions, { id: 'olive_oil', display: 'Olive Oil', role: 'fat', fixedLabel: 'Olive Oil (15g)' }, preferences), exclusions
          ),
        ]
      }
    },
    // ── 6: Mid-Morning Snack ──
    {
      name: 'Mid-Morning Snack',
      time: '11:00',
      // isMainMeal = false: snack-only foods (greek_yogurt, apple, etc.) are
      // intentionally present here and must not be filtered by preferences.
      foods: (p) =>
        p === 'vegan'
          ? [
              getFood('pea_protein', exclusions, { id: 'pea_protein', display: 'Pea Protein Shake', role: 'powder' }, preferences, false),
              getFood('apple',       exclusions, { id: 'apple',       display: 'Apple',             role: 'fruit' },  preferences, false),
            ]
          : [
              getFood('greek_yogurt', exclusions, { id: 'greek_yogurt', display: 'Greek Yogurt',  role: 'protein' }, preferences, false),
              getFood('berries',      exclusions, { id: 'berries',      display: 'Mixed Berries',  role: 'fruit' },   preferences, false),
            ]
    },
    // ── 7: Afternoon Snack ──
    {
      name: 'Afternoon Snack',
      time: '15:00',
      // isMainMeal = false: same reason as Mid-Morning Snack.
      foods: (p) =>
        p === 'vegan'
          ? [
              getFood('rice_cakes',    exclusions, { id: 'rice_cakes',    display: 'Rice Cakes',    role: 'fixed', fixedLabel: 'Rice Cakes x2' },       preferences, false),
              getFood('almond_butter', exclusions, { id: 'almond_butter', display: 'Almond Butter', role: 'fat',   fixedLabel: 'Almond Butter (16g)' }, preferences, false),
              getFood('banana',        exclusions, { id: 'banana',        display: 'Banana',         role: 'fixed', fixedLabel: 'Banana (half)' },       preferences, false),
            ]
          : [
              getFood('cottage_cheese', exclusions, { id: 'cottage_cheese', display: 'Cottage Cheese', role: 'protein' }, preferences, false),
              getFood('rice_cakes',     exclusions, { id: 'rice_cakes',     display: 'Rice Cakes',     role: 'fixed', fixedLabel: 'Rice Cakes x2' }, preferences, false),
            ]
    },
    // ── 8: Evening Snack ──
    {
      name: 'Evening Snack',
      time: '21:00',
      foods: (p) =>
        p === 'vegan'
          ? [
              getFood('rice_cakes',    exclusions, { id: 'rice_cakes',    display: 'Rice Cakes',    role: 'fixed', fixedLabel: 'Rice Cakes x2' },       preferences, false),
              getFood('almond_butter', exclusions, { id: 'almond_butter', display: 'Almond Butter', role: 'fat',   fixedLabel: 'Almond Butter (16g)' }, preferences, false),
            ]
          : [
              getFood('cottage_cheese', exclusions, { id: 'cottage_cheese', display: 'Cottage Cheese', role: 'protein' }, preferences, false),
              getFood('almonds',        exclusions, { id: 'almonds',        display: 'Almonds',        role: 'fat' },      preferences, false),
            ]
    },
  ]

  // Select main meal templates (indices 0-5) based on mainCount
  const mainSets: Record<number, number[]> = {
    3: [0, 2, 5],
    4: [0, 2, 3, 5],
    5: [0, 1, 2, 4, 5],
    6: [0, 1, 2, 3, 4, 5],
  }
  const mainOrder = [0, 1, 2, 3, 4, 5]
  let mainIndices: number[]
  if (mainSets[mainCount]) {
    // Curated combinations for the common 3–6 range
    mainIndices = mainSets[mainCount].slice(0, mainCount)
  } else if (mainCount <= 2) {
    // 1–2 meals: take the earliest slots from the 3-meal set (Breakfast, Lunch)
    mainIndices = mainSets[3].slice(0, Math.max(0, mainCount))
  } else {
    // Beyond the six distinct main templates (7+): cycle through all six in order,
    // repeating as needed so any count yields exactly `mainCount` main meals.
    mainIndices = Array.from({ length: mainCount }, (_, i) => mainOrder[i % mainOrder.length])
  }
  // Snack templates: 6=Mid-Morning Snack (10:30), 7=Afternoon Snack (15:30), 8=Evening Snack (21:00)
  // Cycle through the three distinct snack slots so any snack count is supported.
  const snackOrder = [6, 7, 8]
  const snackIndices = Array.from({ length: Math.max(0, snackCount) }, (_, i) => snackOrder[i % snackOrder.length])
  const combined = [...mainIndices, ...snackIndices].map((i) => all[i])
  combined.sort((a, b) => a.time.localeCompare(b.time))
  return combined
}

// Public re-export for use in plan:recalculateMacros IPC handler
export function buildMealsPublic(
  totalCal: number,
  protein_g: number,
  carbs_g: number,
  fat_g: number,
  mealCount: number,
  dietary_preference: string,
  food_exclusions?: string[],
  food_preferences?: string[],
  cooking_time_pref?: string,
  snack_count?: number,
  culture_pref?: string,
  dietary_restrictions?: string[],
  meal_prep_style?: string
) {
  return buildMeals(totalCal, protein_g, carbs_g, fat_g, mealCount, dietary_preference, food_exclusions, food_preferences, cooking_time_pref, snack_count, culture_pref, dietary_restrictions, meal_prep_style)
}

// Guard against absent / nonsensical bodyweight. A weight of 0 (or NaN) would
// yield 0g protein and 0g fat — physiologically impossible and dangerous to
// present to a user — and could propagate NaN into downstream macro math.
// Shared by every call site that derives protein/fat directly from bodyweight
// (plan generation, check-in macro recalculation, manual macro recalculation).
export function clampWeightKg(weightKg: number | undefined | null, fallback = 70): number {
  return Number.isFinite(weightKg) && (weightKg as number) >= 30 ? (weightKg as number) : fallback
}

export function generateNutritionPlan(input: NutritionInput): NutritionPlan {
  const safeWeightKg = clampWeightKg(input.weight_kg)
  input = { ...input, weight_kg: safeWeightKg }
  const bmr = calcBMR(input.weight_kg, input.height_cm, input.age, input.sex)
  const tdee = Math.round(bmr * (ACTIVITY_MULTIPLIERS[input.activity_level] ?? 1.55))
  const adjustment = getPhaseAwareDeficit(input.weeks_out, input.goal)
  const calories = Math.max(1200, tdee + adjustment)

  const protein_g = Math.round(input.weight_kg * 2.3)
  const fat_g = Math.round(input.weight_kg * 0.9)
  const proteinCals = protein_g * 4
  const fatCals = fat_g * 9
  const carbCals = Math.max(0, calories - proteinCals - fatCals)
  const carbs_g = Math.round(carbCals / 4)

  // A non-finite snack_count (NaN) survives `??` (only null/undefined default) and would
  // poison buildMeals' `mainCount = length - snackCount` math, zeroing out main-meal
  // calories. Resolve to a finite value, then clamp to the supported 0–20 range.
  const rawSnackCount = Number.isFinite(input.snack_count)
    ? (input.snack_count as number)
    : (input.snack_count == null && input.include_snacks ? 1 : 0)
  const resolvedSnackCount = Math.max(0, Math.min(20, Math.round(rawSnackCount)))

  // A non-finite meal_count (e.g. NaN) survives Math.max/Math.min unchanged — NaN
  // propagating into the meal-template builder and .slice(0, NaN) yields zero main
  // meals. Fall back to 4 before clamping so the result is always finite. Meals are
  // supported from 1 to 20.
  const safeMealCount = Number.isFinite(input.meal_count) ? input.meal_count : 4
  const meals = buildMeals(
    calories,
    protein_g,
    carbs_g,
    fat_g,
    Math.max(1, Math.min(20, Math.round(safeMealCount))),
    input.dietary_preference,
    input.food_exclusions,
    input.food_preferences,
    input.cooking_time_pref,
    resolvedSnackCount,
    input.culture_pref,
    input.dietary_restrictions,
    input.meal_prep_style
  )

  // Derive phase from the actual calorie adjustment rather than a static goal→phase map.
  // A 'maintain' goal with a show on the calendar applies a deficit; mapping goal→'maintenance'
  // would label the plan incorrectly while the athlete is actually in a deficit.
  const actualPhase: NutritionPlan['phase'] =
    adjustment < 0 ? 'deficit' : adjustment > 0 ? 'surplus' : 'maintenance'

  return {
    calories_target: calories,
    protein_g,
    carbs_g,
    fat_g,
    meal_count: meals.length,
    phase: actualPhase,
    meals
  }
}
