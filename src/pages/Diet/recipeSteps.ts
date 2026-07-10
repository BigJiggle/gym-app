// Deterministic, client-side recipe-step generator. Turns a meal's portioned
// food list (e.g. "Chicken Breast (150g)") plus the user's cook-time preference
// into simple, real-feeling prep steps — no AI, no engine/DB changes, and it
// works retroactively for any existing plan. Same input always yields the same
// steps.

const PROTEIN_KEYWORDS = ['chicken', 'beef', 'steak', 'turkey', 'salmon', 'fish', 'tuna', 'cod', 'pork', 'egg', 'tofu', 'tempeh', 'shrimp', 'lentil', 'bean', 'yogurt', 'cottage', 'whey', 'protein', 'shake']
const CARB_KEYWORDS = ['rice', 'potato', 'oats', 'oat', 'pasta', 'quinoa', 'bread', 'bagel', 'tortilla', 'wrap', 'noodle', 'couscous', 'cereal', 'banana', 'berries', 'fruit', 'apple', 'rice cakes', 'honey']
const VEG_KEYWORDS = ['broccoli', 'spinach', 'asparagus', 'greens', 'salad', 'pepper', 'zucchini', 'vegetable', 'veg', 'kale', 'carrot', 'tomato', 'cucumber', 'onion', 'mushroom', 'cauliflower', 'green beans']

/** Strip the "(150g …)" portion suffix to get the plain food name. */
export function foodName(food: string): string {
  return food.replace(/\s*\(.*?\)\s*$/, '').trim()
}

function classify(name: string): 'protein' | 'carb' | 'veg' | 'other' {
  const n = name.toLowerCase()
  if (PROTEIN_KEYWORDS.some((k) => n.includes(k))) return 'protein'
  if (VEG_KEYWORDS.some((k) => n.includes(k))) return 'veg'
  if (CARB_KEYWORDS.some((k) => n.includes(k))) return 'carb'
  return 'other'
}

function list(names: string[]): string {
  if (names.length === 0) return ''
  if (names.length === 1) return names[0]
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

/**
 * Build ordered prep steps for a meal. Richer for 'chef', terse for 'quick'.
 * Returns [] when there are no foods (caller can skip rendering).
 */
export function buildRecipeSteps(foods: string[], cookTime: string = 'medium'): string[] {
  const names = foods.map(foodName).filter(Boolean)
  if (names.length === 0) return []

  const proteins = names.filter((n) => classify(n) === 'protein')
  const carbs = names.filter((n) => classify(n) === 'carb')
  const vegs = names.filter((n) => classify(n) === 'veg')
  const others = names.filter((n) => classify(n) === 'other')

  // No-cook assemble (shakes, yogurt, fruit bowls) — nothing to actually cook.
  const noCook = proteins.every((p) => /shake|whey|protein|yogurt|cottage/i.test(p)) && carbs.every((c) => /banana|berries|fruit|apple|oats|oat|cereal|honey|rice cakes/i.test(c)) && vegs.length === 0
  if (noCook) {
    return [`Combine ${list(names)} and enjoy — no cooking needed.`]
  }

  if (cookTime === 'quick') {
    const steps: string[] = []
    if (proteins.length) steps.push(`Quickly cook the ${list(proteins)} in a hot pan until done.`)
    if (carbs.length) steps.push(`Heat or microwave the ${list(carbs)}.`)
    const rest = [...vegs, ...others]
    steps.push(`Plate with ${list(rest.length ? rest : ['everything'])} and serve.`)
    return steps
  }

  const steps: string[] = []
  if (cookTime === 'chef' && proteins.length) {
    steps.push(`Season and briefly marinate the ${list(proteins)} (5–10 min).`)
  }
  if (proteins.length) {
    steps.push(`${cookTime === 'chef' ? 'Sear then finish' : 'Cook'} the ${list(proteins)} until cooked through.`)
  }
  if (carbs.length) {
    steps.push(`Prepare the ${list(carbs)} until tender.`)
  }
  if (vegs.length) {
    steps.push(`${cookTime === 'chef' ? 'Roast' : 'Steam or sauté'} the ${list(vegs)}.`)
  }
  if (others.length) {
    steps.push(`Add the ${list(others)}.`)
  }
  steps.push(cookTime === 'chef' ? 'Plate together, garnish, and serve.' : 'Combine on a plate and serve.')
  return steps
}
