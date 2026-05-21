import {
  EXCLUSION_ALIASES,
  FOOD_SUBSTITUTES,
  FOOD_CATEGORY,
  FOOD_DISPLAY,
  SNACK_ONLY_FOODS,
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
  if (goal === 'maintain') return 0
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


const PORTION_BY_CATEGORY: Record<string, string> = {
  protein: '(150g)', carb: '(200g cooked)', fat: '(30g)', veg: '(200g)',
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

// Returns the food string for a meal slot, respecting exclusions and preferences.
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
  defaultStr: string,
  preferences?: string[],
  isMainMeal = true
): string {
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
            // Use FOOD_DISPLAY for correct portion, fall back to auto-generated label
            if (FOOD_DISPLAY[prefId]) return FOOD_DISPLAY[prefId]
            const label = prefId.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
            return `${label} ${PORTION_BY_CATEGORY[category]}`
          }
        }
      }
    }
    return defaultStr
  }
  // Iterate substitutes in order — skip any whose food_id is itself excluded
  const subs = FOOD_SUBSTITUTES[id] as FoodSubstituteTuple[] | undefined
  if (subs) {
    for (const [subId, subDisplay] of subs) {
      if (!isExcluded(subId, exclusions)) return subDisplay
    }
  }
  return defaultStr
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
  include_snacks?: boolean,
  culture_pref?: string,
  dietary_restrictions?: string[]
): Meal[] {
  // Merge specific food ID exclusions with aliases derived from restriction labels
  const restrictionAliases = restrictionsToAliasKeys(dietary_restrictions ?? [])
  const allExclusions = [...(food_exclusions ?? []), ...restrictionAliases]
  const allPreferences = food_preferences ?? []
  const mealTemplates = getMealTemplates(mealCount, dietary_preference, include_snacks, allExclusions, cooking_time_pref ?? 'medium', culture_pref ?? 'any', allPreferences)

  const SNACK_CAL = 200
  const snackCount = mealTemplates.filter(t => t.name.toLowerCase().includes('snack')).length
  const mainCount = mealTemplates.length - snackCount
  const totalSnackCal = snackCount * SNACK_CAL
  const mainCalories = Math.max(800, totalCal - totalSnackCal)
  const perMainCal = mainCount > 0 ? Math.round(mainCalories / mainCount) : 0

  // Protein and fat are fixed by body weight; carbs fill the rest
  // Distribute macros proportionally across meal types
  const proteinCalRatio = (protein_g * 4) / totalCal
  const fatCalRatio = (fat_g * 9) / totalCal

  return mealTemplates.map((t) => {
    const isSnack = t.name.toLowerCase().includes('snack')
    const cal = isSnack ? SNACK_CAL : perMainCal
    const pro = Math.round((cal * proteinCalRatio) / 4)
    const fat = Math.round((cal * fatCalRatio) / 9)
    const carb = Math.max(0, Math.round((cal - pro * 4 - fat * 9) / 4))
    return {
      name: t.name,
      time: t.time,
      calories: cal,
      protein_g: pro,
      carbs_g: carb,
      fat_g: fat,
      foods: t.foods(dietary_preference)
    }
  })
}

interface MealTemplate {
  name: string
  time: string
  foods: (pref: string) => string[]
}

// Culture-specific food swaps
const cultureFoods: Record<string, Record<string, string>> = {
  indian: {
    protein_main: 'Chicken Tikka (150g)',
    protein_alt: 'Dal (150g cooked)',
    carb_main: 'Basmati Rice (200g cooked)',
    carb_alt: 'Whole Wheat Roti (2 pieces)',
    veg: 'Saag (Spinach Puree) (150g)',
    dairy: 'Dahi/Yogurt (200g)',
    fat: 'Ghee (10g)',
    plant_protein: 'Paneer (150g)',
  },
  mexican: {
    protein_main: 'Chicken Tinga (150g)',
    protein_alt: 'Carne Asada (150g)',
    carb_main: 'Black Beans (150g cooked)',
    carb_alt: 'Corn Tortilla x2',
    veg: 'Pico de Gallo (100g)',
    dairy: 'Cotija Cheese (30g)',
    fat: 'Avocado (100g)',
    plant_protein: 'Pinto Beans (150g cooked)',
  },
  mediterranean: {
    protein_main: 'Grilled Chicken (150g)',
    protein_alt: 'Grilled Halloumi (100g)',
    carb_main: 'Whole Wheat Pita (1 piece)',
    carb_alt: 'Quinoa (185g cooked)',
    veg: 'Cucumber & Tomato Salad (150g)',
    dairy: 'Greek Yogurt (200g)',
    fat: 'Hummus (50g)',
    plant_protein: 'Falafel (100g)',
  },
  asian: {
    protein_main: 'Chicken Breast (150g)',
    protein_alt: 'Silken Tofu (200g)',
    carb_main: 'Jasmine Rice (200g cooked)',
    carb_alt: 'Soba Noodles (200g cooked)',
    veg: 'Edamame (150g)',
    dairy: 'Soy Milk (200ml)',
    fat: 'Sesame Oil (10g)',
    plant_protein: 'Firm Tofu (200g)',
  },
}

function getCultureFood(culturePref: string, key: string, pref: string, fallback: string): string {
  if (culturePref === 'any') return fallback
  const culture = cultureFoods[culturePref]
  if (!culture) return fallback
  // Adjust for dietary preference
  if (key === 'protein_main' && (pref === 'vegan' || pref === 'vegetarian')) {
    return culture.plant_protein ?? fallback
  }
  return culture[key] ?? fallback
}

function getMealTemplates(
  count: number,
  _pref: string,
  includeSnacks: boolean = false,
  exclusions: string[] = [],
  cookingPref: string = 'medium',
  culturePref: string = 'any',
  preferences: string[] = []
): MealTemplate[] {
  const all: MealTemplate[] = [
    {
      name: 'Breakfast',
      time: '07:00',
      foods: (p) => {
        if (p === 'vegan') {
          return [
            getFood('oats', exclusions, 'Oats (80g dry)', preferences),
            getFood('soy_protein', exclusions, 'Soy Protein Shake (35g)', preferences),
            getFood('banana', exclusions, 'Banana', preferences),
            getCultureFood(culturePref, 'fat', p, getFood('almond_butter', exclusions, 'Almond Butter (15g)', preferences))
          ]
        }
        if (p === 'vegetarian') {
          return [
            getFood('oats', exclusions, 'Oats (80g dry)', preferences),
            getCultureFood(culturePref, 'dairy', p, getFood('greek_yogurt', exclusions, 'Greek Yogurt (200g)', preferences)),
            getFood('banana', exclusions, 'Banana', preferences),
            getFood('almonds', exclusions, 'Almonds (20g)', preferences)
          ]
        }
        return [
          getFood('oats', exclusions, 'Oats (80g dry)', preferences),
          getFood('eggs', exclusions, 'Whole Eggs x3', preferences),
          getFood('egg_whites', exclusions, 'Egg Whites x3', preferences),
          getFood('berries', exclusions, 'Berries (100g)', preferences)
        ]
      }
    },
    {
      name: 'Mid-Morning',
      time: '10:00',
      foods: (p) => {
        if (p === 'vegan') {
          return [
            getFood('brown_rice', exclusions, 'Brown Rice (150g cooked)', preferences),
            getFood('tofu', exclusions, 'Tofu (150g)', preferences),
            getFood('mixed_veg', exclusions, 'Mixed Vegetables (200g)', preferences)
          ]
        }
        if (p === 'vegetarian') {
          return [
            getFood('brown_rice', exclusions, 'Brown Rice (150g cooked)', preferences),
            getFood('cottage_cheese', exclusions, 'Cottage Cheese (150g)', preferences),
            getFood('mixed_veg', exclusions, 'Vegetables (200g)', preferences)
          ]
        }
        return [
          getFood('brown_rice', exclusions, 'Brown Rice (150g cooked)', preferences),
          getFood('chicken_breast', exclusions, 'Chicken Breast (150g)', preferences),
          getFood('broccoli', exclusions, 'Broccoli (200g)', preferences)
        ]
      }
    },
    {
      name: 'Lunch',
      time: '13:00',
      foods: (p) => {
        if (p === 'vegan') {
          return [
            getCultureFood(culturePref, 'plant_protein', p, getFood('tempeh', exclusions, 'Tofu (200g)', preferences)),
            getCultureFood(culturePref, 'carb_main', p, getFood('sweet_potato', exclusions, 'Sweet Potato (200g)', preferences)),
            getCultureFood(culturePref, 'veg', p, getFood('spinach', exclusions, 'Spinach (100g)', preferences))
          ]
        }
        return [
          getCultureFood(culturePref, 'protein_main', p, getFood('chicken_breast', exclusions, 'Chicken Breast (180g)', preferences)),
          getCultureFood(culturePref, 'carb_main', p, getFood('white_rice', exclusions, 'White Rice (200g cooked)', preferences)),
          getCultureFood(culturePref, 'veg', p, getFood('broccoli', exclusions, 'Broccoli (200g)', preferences))
        ]
      }
    },
    {
      name: 'Pre-Workout',
      time: '16:00',
      foods: (p) => {
        if (p === 'vegan') {
          return [
            getFood('rice_cakes', exclusions, 'Rice Cakes x3', preferences),
            getFood('pea_protein', exclusions, 'Pea Protein Shake (35g)', preferences),
            getFood('apple', exclusions, 'Apple', preferences)
          ]
        }
        return [
          getFood('rice_cakes', exclusions, 'Rice Cakes x3', preferences),
          getFood('whey_protein', exclusions, 'Whey Protein Shake (35g)', preferences),
          getFood('apple', exclusions, 'Apple', preferences)
        ]
      }
    },
    {
      name: 'Post-Workout',
      time: '18:30',
      foods: (p) => {
        if (p === 'vegan') {
          return [
            getFood('white_rice', exclusions, 'White Rice (200g cooked)', preferences),
            getFood('soy_protein', exclusions, 'Soy Protein Shake (35g)', preferences),
            getFood('banana', exclusions, 'Banana', preferences)
          ]
        }
        return [
          getFood('white_rice', exclusions, 'White Rice (200g cooked)', preferences),
          getFood('whey_protein', exclusions, 'Whey Protein Shake (35g)', preferences),
          getFood('banana', exclusions, 'Banana', preferences)
        ]
      }
    },
    {
      name: 'Dinner',
      time: '20:00',
      foods: (p) => {
        if (p === 'vegan') {
          return [
            getFood('quinoa', exclusions, 'Quinoa (150g cooked)', preferences),
            getCultureFood(culturePref, 'plant_protein', p, getFood('black_beans', exclusions, 'Black Beans (150g)', preferences)),
            getFood('mixed_veg', exclusions, 'Roasted Vegetables (250g)', preferences)
          ]
        }
        if (p === 'vegetarian') {
          return [
            getCultureFood(culturePref, 'carb_alt', p, getFood('pasta', exclusions, 'Pasta (150g cooked)', preferences)),
            getCultureFood(culturePref, 'plant_protein', p, getFood('ricotta', exclusions, 'Ricotta (100g)', preferences)),
            getCultureFood(culturePref, 'veg', p, getFood('mixed_veg', exclusions, 'Vegetables (100g)', preferences))
          ]
        }
        return [
          getCultureFood(culturePref, 'carb_main', p, getFood('white_rice', exclusions, 'White Rice (150g cooked)', preferences)),
          getCultureFood(culturePref, 'protein_main', p, getFood('salmon', exclusions, 'Salmon Fillet (180g)', preferences)),
          getCultureFood(culturePref, 'veg', p, getFood('asparagus', exclusions, 'Asparagus (200g)', preferences))
        ]
      }
    },
    {
      name: 'Mid-Morning Snack',
      time: '10:30',
      // isMainMeal = false: snack-only foods (greek_yogurt, apple, etc.) are
      // intentionally present here and must not be filtered by preferences.
      foods: (p) =>
        p === 'vegan'
          ? [
              getFood('pea_protein', exclusions, 'Pea Protein Shake (35g)', preferences, false),
              getFood('apple', exclusions, 'Apple', preferences, false)
            ]
          : [
              getFood('greek_yogurt', exclusions, 'Greek Yogurt (150g)', preferences, false),
              getFood('berries', exclusions, 'Mixed Berries (100g)', preferences, false)
            ]
    },
    {
      name: 'Afternoon Snack',
      time: '15:30',
      // isMainMeal = false: same reason as Mid-Morning Snack.
      foods: (p) =>
        p === 'vegan'
          ? [
              getFood('rice_cakes',    exclusions, 'Rice Cakes x2',        preferences, false),
              getFood('almond_butter', exclusions, 'Almond Butter (16g)',  preferences, false),
              getFood('banana',        exclusions, 'Banana (half)',         preferences, false)
            ]
          : [
              getFood('cottage_cheese', exclusions, 'Cottage Cheese (150g)', preferences, false),
              getFood('rice_cakes',     exclusions, 'Rice Cakes x2',         preferences, false)
            ]
    }
  ]

  let indices: number[]
  if (includeSnacks) {
    if (count <= 3) indices = [0, 2, 5]
    else if (count === 4) indices = [0, 6, 2, 5]
    else if (count === 5) indices = [0, 6, 2, 7, 5]
    else indices = [0, 6, 1, 2, 7, 5]
  } else {
    if (count <= 3) indices = [0, 2, 5]
    else if (count === 4) indices = [0, 2, 3, 5]
    else if (count === 5) indices = [0, 1, 2, 4, 5]
    else indices = [0, 1, 2, 3, 4, 5]
  }

  return indices.slice(0, count).map((i) => all[i])
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
  include_snacks?: boolean,
  culture_pref?: string,
  dietary_restrictions?: string[]
) {
  return buildMeals(totalCal, protein_g, carbs_g, fat_g, mealCount, dietary_preference, food_exclusions, food_preferences, cooking_time_pref, include_snacks, culture_pref, dietary_restrictions)
}

export function generateNutritionPlan(input: NutritionInput): NutritionPlan {
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

  const meals = buildMeals(
    calories,
    protein_g,
    carbs_g,
    fat_g,
    input.meal_count,
    input.dietary_preference,
    input.food_exclusions,
    input.food_preferences,
    input.cooking_time_pref,
    input.include_snacks,
    input.culture_pref,
    input.dietary_restrictions
  )

  return {
    calories_target: calories,
    protein_g,
    carbs_g,
    fat_g,
    meal_count: input.meal_count,
    phase: PHASE_MAP[input.goal] ?? 'deficit',
    meals
  }
}
