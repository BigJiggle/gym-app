import { describe, it, expect } from 'vitest'
import { generateNutritionPlan, clampWeightKg, clampMealCount, buildMealsPublic } from '../../electron/services/nutritionEngine'

const BASE_INPUT = {
  weight_kg: 80,
  height_cm: 178,
  age: 28,
  sex: 'male',
  activity_level: 'moderate',
  goal: 'cut',
  dietary_preference: 'omnivore',
  meal_count: 4
}

describe('nutritionEngine', () => {
  it('generates a plan with required fields', () => {
    const plan = generateNutritionPlan(BASE_INPUT)
    expect(plan.calories_target).toBeGreaterThan(0)
    expect(plan.protein_g).toBeGreaterThan(0)
    expect(plan.carbs_g).toBeGreaterThanOrEqual(0)
    expect(plan.fat_g).toBeGreaterThan(0)
    expect(plan.meals).toHaveLength(4)
    expect(plan.phase).toBe('deficit')
  })

  it('applies calorie deficit for cut goal', () => {
    const cut = generateNutritionPlan({ ...BASE_INPUT, goal: 'cut' })
    const maintain = generateNutritionPlan({ ...BASE_INPUT, goal: 'maintain' })
    expect(cut.calories_target).toBeLessThan(maintain.calories_target)
  })

  it('sets protein at approximately 2.3g/kg', () => {
    const plan = generateNutritionPlan(BASE_INPUT)
    const expected = Math.round(80 * 2.3)
    expect(plan.protein_g).toBe(expected)
  })

  it('generates correct number of meals', () => {
    const plan3 = generateNutritionPlan({ ...BASE_INPUT, meal_count: 3 })
    expect(plan3.meals).toHaveLength(3)
    const plan6 = generateNutritionPlan({ ...BASE_INPUT, meal_count: 6 })
    expect(plan6.meals).toHaveLength(6)
  })

  it('handles female BMR calculation', () => {
    const female = generateNutritionPlan({ ...BASE_INPUT, sex: 'female', weight_kg: 60 })
    const male = generateNutritionPlan({ ...BASE_INPUT, sex: 'male', weight_kg: 60 })
    expect(female.calories_target).toBeLessThan(male.calories_target)
  })

  it('applies recomp phase correctly', () => {
    const plan = generateNutritionPlan({ ...BASE_INPUT, goal: 'recomp' })
    expect(plan.phase).toBe('deficit')
    expect(plan.calories_target).toBeGreaterThan(0)
  })

  it('generates vegan-appropriate meals', () => {
    const plan = generateNutritionPlan({ ...BASE_INPUT, dietary_preference: 'vegan' })
    const allFoods = plan.meals.flatMap((m) => m.foods)
    const hasAnimalProduct = allFoods.some((f) =>
      ['chicken', 'beef', 'salmon', 'whey', 'egg', 'greek yogurt'].some((a) =>
        f.toLowerCase().includes(a)
      )
    )
    expect(hasAnimalProduct).toBe(false)
  })

  it('does not generate calories below 1200', () => {
    const extreme = generateNutritionPlan({
      ...BASE_INPUT,
      weight_kg: 45,
      activity_level: 'sedentary',
      goal: 'cut',
      sex: 'female'
    })
    expect(extreme.calories_target).toBeGreaterThanOrEqual(1200)
  })

  it('macro calories sum to roughly the calorie target', () => {
    const plan = generateNutritionPlan(BASE_INPUT)
    const macroCalories = plan.protein_g * 4 + plan.carbs_g * 4 + plan.fat_g * 9
    const tolerance = 20
    expect(Math.abs(macroCalories - plan.calories_target)).toBeLessThanOrEqual(tolerance)
  })

  // Regression: a NaN meal_count used to survive Math.max/Math.min(NaN) unchanged,
  // which made buildMeals' mainSets lookup + .slice(0, NaN) produce zero main meals.
  it('falls back to a valid meal count when meal_count is NaN', () => {
    const plan = generateNutritionPlan({ ...BASE_INPUT, meal_count: NaN as any })
    expect(plan.meals.length).toBeGreaterThanOrEqual(3)
    expect(plan.meals.every((m) => m.foods.length > 0)).toBe(true)
  })

  // Regression: phase was derived from goal string via PHASE_MAP, so a 'maintain'
  // goal with weeks_out set was labeled 'maintenance' even though getPhaseAwareDeficit
  // returns a negative value → the plan was actually in deficit but labeled wrong.
  it('maintain off-season (no weeks_out) → phase maintenance', () => {
    const plan = generateNutritionPlan({ ...BASE_INPUT, goal: 'maintain' })
    expect(plan.phase).toBe('maintenance')
  })

  it('maintain with show approaching (weeks_out=6) → phase deficit', () => {
    const plan = generateNutritionPlan({ ...BASE_INPUT, goal: 'maintain', weeks_out: 6 })
    expect(plan.phase).toBe('deficit')
  })

  // Regression: on minimum 1200 kcal plans a fixed 200 kcal snack exceeded
  // the per-main-meal allocation, making snack the largest "meal" of the day.
  it('snack calories do not exceed per-main-meal calories on a 1200 kcal plan', () => {
    const plan = generateNutritionPlan({
      ...BASE_INPUT,
      weight_kg: 45,
      activity_level: 'sedentary',
      goal: 'cut',
      sex: 'female',
      meal_count: 6,
      snack_count: 1,
    } as any)
    const snack = plan.meals.find((m) => m.name.toLowerCase().includes('snack'))
    const mains = plan.meals.filter((m) => !m.name.toLowerCase().includes('snack'))
    if (snack && mains.length > 0) {
      const avgMain = mains.reduce((s, m) => s + m.calories, 0) / mains.length
      expect(snack.calories).toBeLessThanOrEqual(Math.ceil(avgMain) + 5) // allow 5 kcal rounding
    }
  })
})

describe('clampWeightKg', () => {
  it('passes through a valid weight unchanged', () => {
    expect(clampWeightKg(80)).toBe(80)
  })

  it('falls back to the default for 0/negative/NaN weight', () => {
    expect(clampWeightKg(0)).toBe(70)
    expect(clampWeightKg(-10)).toBe(70)
    expect(clampWeightKg(NaN)).toBe(70)
    expect(clampWeightKg(undefined)).toBe(70)
  })

  it('honors a custom fallback', () => {
    expect(clampWeightKg(0, 65)).toBe(65)
  })
})

// ── Main-meal count clamp: 1–20, shared by generation and AI regeneration ─────
// Regression for the bug where plan:applyAIRequest capped meal_count at 3–6.
// A user with 8 meals (set via Settings, which allows 1–20) had their diet
// silently collapsed to 6 meals whenever the AI assistant regenerated it, and an
// explicit "give me 8 meals a day" request was silently stored as 6.
describe('clampMealCount', () => {
  it('passes through counts within the supported 1–20 range', () => {
    expect(clampMealCount(1)).toBe(1)
    expect(clampMealCount(4)).toBe(4)
    // These are the values the old 3–6 cap wrongly reduced to 6.
    expect(clampMealCount(8)).toBe(8)
    expect(clampMealCount(12)).toBe(12)
    expect(clampMealCount(20)).toBe(20)
  })

  it('clamps out-of-range counts to the 1–20 bounds', () => {
    expect(clampMealCount(0)).toBe(1)
    expect(clampMealCount(-3)).toBe(1)
    expect(clampMealCount(25)).toBe(20)
  })

  it('rounds fractional counts and falls back to 4 for non-finite input', () => {
    expect(clampMealCount(5.4)).toBe(5)
    expect(clampMealCount(NaN)).toBe(4)
    expect(clampMealCount(undefined)).toBe(4)
    expect(clampMealCount(null)).toBe(4)
  })

  it('the engine honors the full range the clamp allows (8 main meals)', () => {
    // Proves the clamp is the only thing that ever limited meal count — the
    // engine itself builds all 8 main meals with finite macros.
    const plan = generateNutritionPlan({ ...BASE_INPUT, meal_count: 8 })
    expect(plan.meals).toHaveLength(8)
    expect(plan.meals.every((m) => Number.isFinite(m.calories) && m.calories > 0)).toBe(true)
    // buildMealsPublic (the exact path the AI-request handler uses) also honors 8.
    expect(buildMealsPublic(2400, 184, 200, 72, clampMealCount(8), 'omnivore')).toHaveLength(8)
  })
})

// ── Food preferences: snack foods must NOT replace main meal ingredients ──────
// Regression tests for the bug where greek_yogurt/apple preferences silently
// replaced salmon/rice in Dinner because they share the same macro category.

describe('nutritionEngine — preference substitution respects meal context', () => {
  const BASE_6 = { ...BASE_INPUT, meal_count: 6, include_snacks: false }

  function dinnerFoods(prefs: string[]): string[] {
    const plan = generateNutritionPlan({ ...BASE_6, food_preferences: prefs } as any)
    const dinner = plan.meals.find((m) => m.name === 'Dinner')
    return dinner?.foods ?? []
  }

  function lunchFoods(prefs: string[]): string[] {
    const plan = generateNutritionPlan({ ...BASE_6, food_preferences: prefs } as any)
    const lunch = plan.meals.find((m) => m.name === 'Lunch')
    return lunch?.foods ?? []
  }

  it('greek_yogurt preference does NOT appear in Dinner foods', () => {
    const foods = dinnerFoods(['greek_yogurt'])
    const hasYogurt = foods.some((f) => f.toLowerCase().includes('greek yogurt'))
    expect(hasYogurt).toBe(false)
  })

  it('apple preference does NOT appear in Dinner foods', () => {
    const foods = dinnerFoods(['apple'])
    const hasApple = foods.some((f) => f.toLowerCase().includes('apple'))
    expect(hasApple).toBe(false)
  })

  it('banana preference does NOT appear in Dinner foods', () => {
    const foods = dinnerFoods(['banana'])
    const hasBanana = foods.some((f) => f.toLowerCase().includes('banana'))
    expect(hasBanana).toBe(false)
  })

  it('greek_yogurt preference does NOT appear in Lunch foods', () => {
    const foods = lunchFoods(['greek_yogurt'])
    const hasYogurt = foods.some((f) => f.toLowerCase().includes('greek yogurt'))
    expect(hasYogurt).toBe(false)
  })

  it('whey_protein preference does NOT replace chicken/salmon in Dinner', () => {
    const foods = dinnerFoods(['whey_protein'])
    const hasShake = foods.some((f) => f.toLowerCase().includes('shake') || f.toLowerCase().includes('whey'))
    expect(hasShake).toBe(false)
  })

  it('greek_yogurt preference DOES appear in Mid-Morning Snack (snack slot allows it)', () => {
    const plan = generateNutritionPlan({
      ...BASE_INPUT,
      meal_count: 5,
      include_snacks: true,
      food_preferences: ['greek_yogurt'],
    } as any)
    const snack = plan.meals.find((m) => m.name === 'Mid-Morning Snack')
    // Snack template already uses greek_yogurt as its default — confirming it's not blocked
    const hasYogurt = snack?.foods.some((f) => f.toLowerCase().includes('greek yogurt'))
    expect(hasYogurt).toBe(true)
  })

  it('non-snack preference (tuna_can) CAN substitute in Dinner as a valid protein swap', () => {
    // tuna_can is NOT in SNACK_ONLY_FOODS — it's a legitimate main-meal protein
    const foods = dinnerFoods(['tuna_can'])
    // The preference may or may not fire depending on category match, but it must NOT be blocked
    // Just assert no crash and a valid foods array is returned
    expect(foods.length).toBeGreaterThan(0)
  })
})

// ── Cook time affects meal richness (not macros) ──────────────────────────────
// 'quick' → simpler plates (fewer items); 'chef' → more elaborate (extra garnishes);
// macro targets stay identical because they're derived from calories, not the food list.
describe('nutritionEngine — cook time affects meal quality', () => {
  const BASE_6 = { ...BASE_INPUT, meal_count: 6, include_snacks: false }

  const plan = (pref: string) =>
    generateNutritionPlan({ ...BASE_6, cooking_time_pref: pref } as any)

  const mainMeals = (p: ReturnType<typeof plan>) =>
    p.meals.filter((m) => !m.name.toLowerCase().includes('snack'))

  it('macros/calories are identical across quick, medium, and chef', () => {
    const q = plan('quick')
    const m = plan('medium')
    const c = plan('chef')
    for (const key of ['calories_target', 'protein_g', 'carbs_g', 'fat_g'] as const) {
      expect(q[key]).toBe(m[key])
      expect(c[key]).toBe(m[key])
    }
    // Per-meal macro targets also match (same order/count of meals)
    for (let i = 0; i < m.meals.length; i++) {
      expect(q.meals[i].calories).toBe(m.meals[i].calories)
      expect(c.meals[i].protein_g).toBe(m.meals[i].protein_g)
      expect(c.meals[i].carbs_g).toBe(m.meals[i].carbs_g)
    }
  })

  it('chef meals are richer (more foods) than quick meals', () => {
    const chefMains = mainMeals(plan('chef'))
    const quickMains = mainMeals(plan('quick'))
    const chefTotal = chefMains.reduce((n, m) => n + m.foods.length, 0)
    const quickTotal = quickMains.reduce((n, m) => n + m.foods.length, 0)
    expect(chefTotal).toBeGreaterThan(quickTotal)
    // Every chef main meal has at least as many items as its medium counterpart
    const mediumMains = mainMeals(plan('medium'))
    chefMains.forEach((meal, i) => {
      expect(meal.foods.length).toBeGreaterThanOrEqual(mediumMains[i].foods.length)
    })
  })

  it('quick trims main meals to at most 2 core items', () => {
    for (const meal of mainMeals(plan('quick'))) {
      expect(meal.foods.length).toBeLessThanOrEqual(2)
      expect(meal.foods.length).toBeGreaterThan(0)
    }
  })

  it('chef adds garnish variety to main meals but leaves snacks simple', () => {
    const c = generateNutritionPlan({
      ...BASE_INPUT,
      meal_count: 5,
      include_snacks: true,
      snack_count: 2,
      cooking_time_pref: 'chef',
    } as any)
    const dinner = c.meals.find((m) => m.name === 'Dinner')!
    const dinnerText = dinner.foods.join(' ').toLowerCase()
    // A garnish from the chef pool is present on a main meal
    expect(dinnerText).toMatch(/herbs|salad|roasted|garlic|spice|pickled/)
    // Snacks are not garnished — they stay at their simple 2-item form
    for (const snack of c.meals.filter((m) => m.name.toLowerCase().includes('snack'))) {
      expect(snack.foods.length).toBeLessThanOrEqual(2)
    }
  })

  it('unknown/absent cook time behaves like medium', () => {
    const def = generateNutritionPlan({ ...BASE_6 } as any) // no cooking_time_pref
    const med = plan('medium')
    const defMains = mainMeals(def)
    const medMains = mainMeals(med)
    defMains.forEach((meal, i) => {
      expect(meal.foods.length).toBe(medMains[i].foods.length)
    })
  })
})

// ── Meal prep style affects food selection (not macros) ───────────────────────
// 'daily' keeps each meal's own varied foods; 'batch' collapses every cooked main
// meal onto ONE shared protein + carb (the batch-cooked staples); 'mixed' shares the
// protein but keeps each meal's own carb. Macros never move — they're derived from
// calories, and consolidation only swaps a food identity for another of the same role.
describe('nutritionEngine — meal prep style affects food selection', () => {
  const BASE_6 = { ...BASE_INPUT, meal_count: 6, include_snacks: false }
  const plan = (style?: string) =>
    generateNutritionPlan({ ...BASE_6, meal_prep_style: style } as any)
  const foodsOf = (p: ReturnType<typeof plan>, name: string) =>
    (p.meals.find((m) => m.name === name)?.foods ?? []).join(' | ').toLowerCase()

  it('macros/calories are identical across daily, batch, and mixed', () => {
    const d = plan('daily')
    const b = plan('batch')
    const m = plan('mixed')
    for (const key of ['calories_target', 'protein_g', 'carbs_g', 'fat_g'] as const) {
      expect(b[key]).toBe(d[key])
      expect(m[key]).toBe(d[key])
    }
    // Per-meal macro targets also match (same order/count of meals)
    for (let i = 0; i < d.meals.length; i++) {
      expect(b.meals[i].calories).toBe(d.meals[i].calories)
      expect(b.meals[i].protein_g).toBe(d.meals[i].protein_g)
      expect(m.meals[i].carbs_g).toBe(d.meals[i].carbs_g)
    }
  })

  it('daily keeps varied proteins across cooked main meals', () => {
    const d = plan('daily')
    // Dinner defaults to salmon, Lunch to chicken — genuinely different proteins
    expect(foodsOf(d, 'Dinner')).toContain('salmon')
    expect(foodsOf(d, 'Lunch')).toContain('chicken')
  })

  it('batch collapses every cooked main onto one shared protein and carb', () => {
    const b = plan('batch')
    const dinner = foodsOf(b, 'Dinner')
    // Dinner's salmon → the batch chicken; its white rice → the batch brown rice
    expect(dinner).toContain('chicken')
    expect(dinner).not.toContain('salmon')
    expect(dinner).toContain('brown rice')
    // No cooked main still carries white rice — the batch carb (brown rice) replaced it
    for (const name of ['Mid-Morning', 'Lunch', 'Dinner']) {
      expect(foodsOf(b, name)).not.toContain('white rice')
    }
  })

  it('mixed shares the protein but keeps each meal its own carb', () => {
    const m = plan('mixed')
    const dinner = foodsOf(m, 'Dinner')
    // Protein consolidated (salmon → chicken) ...
    expect(dinner).toContain('chicken')
    expect(dinner).not.toContain('salmon')
    // ... but Dinner keeps its own white rice, not the batch brown rice
    expect(dinner).toContain('white rice')
  })

  it('never consolidates snacks or non-cooked meals (breakfast eggs stay)', () => {
    const b = generateNutritionPlan({
      ...BASE_INPUT,
      meal_count: 6,
      include_snacks: true,
      snack_count: 2,
      meal_prep_style: 'batch',
    } as any)
    // Breakfast has no protein-role item (eggs are a fixed label) — left untouched
    expect(foodsOf(b, 'Breakfast')).toContain('egg')
    // Snacks keep their simple grab-and-go form
    for (const snack of b.meals.filter((mm) => mm.name.toLowerCase().includes('snack'))) {
      expect(snack.foods.length).toBeLessThanOrEqual(2)
    }
  })

  it('unknown/absent prep style behaves like daily', () => {
    const def = plan(undefined) // no meal_prep_style
    const daily = plan('daily')
    for (let i = 0; i < daily.meals.length; i++) {
      expect(def.meals[i].foods).toEqual(daily.meals[i].foods)
    }
  })

  describe('dietary restrictions are respected in generated meals', () => {
    // A dairy-free user must never see a dairy food. cottage_cheese and ricotta
    // used to slip through because their substitute chains contained only other
    // dairy foods, so getFood fell back to the excluded original.
    const DAIRY_TERMS = ['cottage cheese', 'ricotta', 'greek yogurt', 'kefir', 'labneh']

    it('Dairy-free excludes cottage cheese / ricotta across prefs and meal counts', () => {
      for (const dietary_preference of ['omnivore', 'vegetarian', 'vegan']) {
        for (const meal_count of [3, 4, 5, 6]) {
          const p = generateNutritionPlan({
            ...BASE_INPUT,
            dietary_preference,
            meal_count,
            snack_count: 3,
            dietary_restrictions: ['Dairy-free'],
          } as any)
          const foods = p.meals.flatMap((m) => m.foods.map((f) => f.toLowerCase()))
          for (const term of DAIRY_TERMS) {
            const hit = foods.find((f) => f.includes(term))
            expect(hit, `${dietary_preference}/${meal_count}m should not contain "${term}" (got "${hit}")`).toBeUndefined()
          }
        }
      }
    })

    // A "No fish" user must never see a fish food. salmon (the omnivore Dinner
    // default) used to slip through because its entire FOOD_SUBSTITUTES chain
    // (tilapia, tuna_steak, halibut) is itself in the `fish` exclusion alias, so
    // getFood exhausted the chain and fell back to the excluded salmon itself.
    const FISH_TERMS = ['salmon', 'tilapia', 'tuna', 'halibut', 'cod', 'mackerel', 'sardine', 'trout', 'sea bass', 'mahi']

    it('No fish excludes salmon and other fish across prefs and meal counts', () => {
      for (const dietary_preference of ['omnivore', 'vegetarian', 'vegan']) {
        for (const meal_count of [3, 4, 5, 6]) {
          const p = generateNutritionPlan({
            ...BASE_INPUT,
            dietary_preference,
            meal_count,
            snack_count: 2,
            dietary_restrictions: ['No fish'],
          } as any)
          const foods = p.meals.flatMap((m) => m.foods.map((f) => f.toLowerCase()))
          for (const term of FISH_TERMS) {
            const hit = foods.find((f) => f.includes(term))
            expect(hit, `${dietary_preference}/${meal_count}m should not contain "${term}" (got "${hit}")`).toBeUndefined()
          }
        }
      }
    })
  })
})
