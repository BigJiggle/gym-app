import https from 'https'

async function callClaude(apiKey: string, system: string, userMsg: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: 'claude-opus-4-7',
      max_tokens: 4096,
      system,
      messages: [{ role: 'user', content: userMsg }]
    })
    const req = https.request({
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(body)
      }
    }, (res) => {
      let data = ''
      res.on('data', (chunk: Buffer) => { data += chunk.toString() })
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data)
          if (parsed.error) { reject(new Error(parsed.error.message)); return }
          resolve(parsed.content?.[0]?.text ?? '')
        } catch (e) { reject(e) }
      })
    })
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

function extractJson(raw: string): unknown {
  // Strip markdown code fences if present
  const cleaned = raw.replace(/^```(?:json)?\s*/m, '').replace(/\s*```$/m, '').trim()
  return JSON.parse(cleaned)
}

export async function generateDietWithClaude(
  apiKey: string,
  userProfile: Record<string, unknown>
): Promise<Record<string, unknown> | null> {
  const system = `You are a sports nutrition expert who generates precise, structured meal plans.
Always respond with ONLY valid JSON. No markdown fences, no explanation, no extra text.`

  // Phase-aware deficit: scale from moderate (far out) to aggressive (close to show) to slight (peak week)
  const weeksOut = userProfile.weeks_out as number | undefined
  const goal = userProfile.goal as string
  let calorieRule: string
  if (goal === 'cut' && weeksOut !== undefined) {
    const deficit = weeksOut === 0 ? -200
      : weeksOut <= 4 ? -700
      : weeksOut <= 8 ? -600
      : weeksOut <= 16 ? -500
      : -300
    calorieRule = `cut = TDEE ${deficit < 0 ? deficit : '+' + deficit} (${weeksOut} weeks out — phase-aware deficit)`
  } else if (goal === 'maintain') {
    calorieRule = 'maintain = TDEE (no deficit)'
  } else if (goal === 'recomp') {
    calorieRule = 'recomp = TDEE - 200'
  } else {
    calorieRule = 'cut = TDEE - 400, maintain = TDEE, recomp = TDEE - 200'
  }

  const prompt = `Generate a personalized meal plan for this athlete:

${JSON.stringify(userProfile, null, 2)}

Requirements:
- Calories must match goal: ${calorieRule}
- Protein = ${Math.round((userProfile.weight_kg as number) * 2.3)}g (2.3g/kg)
- Fat = ${Math.round((userProfile.weight_kg as number) * 0.9)}g (0.9g/kg)
- Carbs fill remaining calories
- Include ${userProfile.meal_count ?? 4} main meals${((userProfile.snack_count as number) ?? 0) > 0 ? ` + ${userProfile.snack_count} snack${(userProfile.snack_count as number) !== 1 ? 's' : ''} (~200 kcal each, placed between main meals)` : ''}
- Cultural preference: ${userProfile.culture_pref ?? 'any'}
- Dietary type: ${userProfile.dietary_preference ?? 'omnivore'}
- Exclude these food IDs: ${JSON.stringify(userProfile.food_exclusions ?? [])}
- Preferred foods (prioritise in matching macro slots): ${JSON.stringify(userProfile.food_preferences ?? [])}

Return ONLY this exact JSON structure (no other text):
{
  "calories_target": <number>,
  "protein_g": <number>,
  "carbs_g": <number>,
  "fat_g": <number>,
  "phase": "deficit"|"maintenance"|"surplus",
  "meal_count": <number>,
  "meals": [
    {
      "name": "<string>",
      "time": "<HH:MM>",
      "calories": <number>,
      "protein_g": <number>,
      "carbs_g": <number>,
      "fat_g": <number>,
      "foods": ["<food with portion>", ...]
    }
  ]
}`
  try {
    const raw = await callClaude(apiKey, system, prompt)
    return extractJson(raw) as Record<string, unknown>
  } catch (e) {
    console.error('[ClaudeService] Diet generation failed:', e)
    return null
  }
}

export async function generateWorkoutWithClaude(
  apiKey: string,
  workoutProfile: Record<string, unknown>
): Promise<Record<string, unknown> | null> {
  const hasInjury = !!(workoutProfile.recovery_notes as string | undefined)?.trim()
  const defaultSets = (workoutProfile.sets_per_exercise as number) ?? 4
  const maxSets = (workoutProfile.max_sets_per_exercise as number) ?? defaultSets + 1

  // Determine prep phase from weeks_out for phase-specific programming
  const weeksOut = workoutProfile.weeks_out as number | undefined
  const prepPhase = weeksOut !== undefined
    ? (weeksOut > 16 ? 'hypertrophy' : weeksOut > 8 ? 'strength' : weeksOut > 3 ? 'peak' : 'deload')
    : (workoutProfile.goal === 'cut' ? 'strength' : 'hypertrophy')

  const phaseGuidance: Record<string, string> = {
    hypertrophy: 'Compounds: 8–12 reps @ RIR 2 | Isolation: 12–15 reps @ RIR 2 | High volume, moderate load',
    strength:    'Compounds: 4–6 reps @ RIR 1 | Isolation: 8–12 reps @ RIR 1 | Moderate volume, heavy load',
    peak:        'Compounds: 3–5 reps @ RIR 0 | Isolation: 8–10 reps @ RIR 0 | Low volume, peak intensity',
    deload:      'All movements: 10–15 reps @ RIR 3 | Reduce sets by 20% | Full recovery before show',
  }

  // PRIORITY SYSTEM — applied strictly in order inside the prompt:
  // 1. SAFETY (injury block) — never violate
  // 2. PREP PHASE — drives rep ranges, volume, and intensity
  // 3. COMPETITION PERFORMANCE — maximise readiness within constraints
  // 4. USER PREFERENCES — split, equipment, exercises/session

  const injuryBlock = hasInjury ? `
⚠️ PRIORITY 1 — SAFETY (NEVER VIOLATE):
Recovery/injury notes: "${workoutProfile.recovery_notes}"
- You MUST avoid ALL exercises that stress the injured/painful body areas
- For KNEE injuries: replace barbell squats, leg press, walking lunges, box jumps with → Romanian Deadlifts, Hip Thrusts, Glute Bridges, Prone Leg Curls, Seated Leg Curl, Cable Pull-Through
- For LOWER BACK injuries: avoid conventional deadlifts, good mornings → use Hip Thrusts, Glute Bridges, Lat Pulldowns, Seated Cable Rows
- For SHOULDER injuries: avoid overhead pressing, upright rows → use cable flys, machine chest press, supported rows, face pulls
- For ELBOW/WRIST injuries: avoid barbell curls, close-grip bench → use cables, machines, neutral-grip movements
- Every single exercise MUST be safe given the constraints above. No exceptions.
` : ''

  const phaseBlock = `
PRIORITY 2 — COMPETITION PREP PHASE (MANDATORY):
- Show: ${weeksOut !== undefined ? `${weeksOut} weeks out` : 'Off-season / no show scheduled'}
- Phase: ${prepPhase.toUpperCase()}
- Programming for this phase: ${phaseGuidance[prepPhase]}
- weeks_total for this plan: ${weeksOut !== undefined ? Math.min(weeksOut, 16) : 12}
- Plan name should reflect the phase and split (e.g. "PPL — Strength Phase")
`

  const system = `You are an elite strength and conditioning coach creating science-based training programs.
Always respond with ONLY valid JSON. No markdown, no explanation outside the JSON.`

  const prompt = `Create a competition prep training program for this athlete.

ATHLETE PROFILE:
- Training days/week: ${workoutProfile.training_frequency}
- Split preference: ${workoutProfile.split_preference ?? 'auto'}
- Exercises per session: ${workoutProfile.exercises_per_session ?? 6}
- Sets per exercise: ${defaultSets} (default) — maximum ${maxSets} sets on any exercise
- Equipment: ${workoutProfile.equipment_access ?? 'full_gym'}
- Goal: ${workoutProfile.goal ?? 'cut'}
- Experience: ${workoutProfile.training_experience_years} years
- Division: ${workoutProfile.division ?? 'general'}
${injuryBlock}${phaseBlock}
PRIORITY 3 — COMPETITION PERFORMANCE:
- Select exercises that maximise stage-readiness for the division above
- Prioritise symmetry, proportionality, and condition-driving movements
- Compound movements early in each session, isolation at end

EXERCISE RULES (always apply):
- Every session must have at least 4 exercises with sets and reps filled in
- Use RIR (Reps In Reserve) for intensity — must match phase guidance above
- day_of_week: 1=Monday through 7=Sunday
- "phase" in response must match the prep phase above (${prepPhase})

Return ONLY valid JSON (no markdown, no other text):
{"name":"<split + phase name>","phase":"${prepPhase}","weeks_total":${weeksOut !== undefined ? Math.min(weeksOut, 16) : 12},"sessions":[{"day_of_week":<1-7>,"session_name":"<string>","exercises":[{"name":"<string>","sets":<number>,"reps":"<e.g. 8-12>","rir":<0-4>,"notes":"<cue>"}]}]}`

  try {
    const raw = await callClaude(apiKey, system, prompt)
    return extractJson(raw) as Record<string, unknown>
  } catch (e) {
    console.error('[ClaudeService] Workout generation failed:', e)
    return null
  }
}

export async function refineWorkoutForSafety(
  apiKey: string,
  sessions: Record<string, unknown>[],
  instruction: string,
  defaultSets: number,
  maxSets: number
): Promise<Record<string, unknown>[] | null> {
  const system = `You are a strength coach specializing in injury-safe exercise selection.
Respond with ONLY valid JSON. No markdown.`

  const prompt = `Current training sessions:
${JSON.stringify(sessions, null, 2)}

Safety/constraint requirements:
${instruction}

RULES:
1. Replace any exercises that could aggravate the injuries described above with safe alternatives
2. Every exercise must have sets between 1 and ${maxSets} — default is ${defaultSets} sets
3. Most exercises should have ${defaultSets} sets; only key compound movements may have up to ${maxSets} sets
4. Keep the same session names and day_of_week values
5. Keep the same number of exercises per session

Return ONLY this JSON (no markdown):
{"sessions":[{"day_of_week":<number>,"session_name":"<string>","exercises":[{"name":"<string>","sets":<number>,"reps":"<string>","rir":<number>,"notes":"<string>"}]}]}`

  try {
    const raw = await callClaude(apiKey, system, prompt)
    const result = extractJson(raw) as any
    const refined = result?.sessions
    if (!Array.isArray(refined) || !refined.every((s: any) => Array.isArray(s?.exercises) && s.exercises.length > 0)) return null
    return refined
  } catch (e) {
    console.error('[ClaudeService] Safety refinement failed:', e)
    return null
  }
}

export async function refineDietPlan(
  apiKey: string,
  context: { currentPlan: Record<string, unknown>; userProfile: Record<string, unknown>; userRequest: string }
): Promise<Record<string, unknown> | null> {
  const system = `You are a sports nutrition expert. You MUST make meaningful changes to the meal plan based on the user's request.
Always respond with ONLY valid JSON. No markdown fences, no explanation, no extra text.`

  const currentMeals = (context.currentPlan as any).meals ?? []
  const prompt = `Current meals:
${JSON.stringify(currentMeals, null, 2)}

User request: "${context.userRequest}"

INSTRUCTIONS:
1. You MUST change the foods arrays in at least 2-3 meals to satisfy the request
2. Keep each meal's calories, protein_g, carbs_g, fat_g numbers IDENTICAL to the input
3. Only change the "foods" string arrays — swap food items with similar calorie equivalents
4. Return the complete updated meals array

Return ONLY this JSON (no other text, no markdown):
{"meals": [<same meal objects with updated foods arrays>]}`

  try {
    const raw = await callClaude(apiKey, system, prompt)
    const result = extractJson(raw) as Record<string, unknown>
    if (!Array.isArray((result as any).meals) || (result as any).meals.length === 0) return null
    return { ...(context.currentPlan as any), meals: (result as any).meals }
  } catch (e) {
    console.error('[ClaudeService] Diet refinement failed:', e)
    return null
  }
}

export async function refineWorkoutWithClaude(
  apiKey: string,
  context: { currentSessions: Record<string, unknown>[]; userProfile: Record<string, unknown>; userRequest: string }
): Promise<Record<string, unknown>[] | null> {
  const system = `You are an elite strength coach. Modify training sessions based on user requests.
Always respond with ONLY valid JSON. No markdown code blocks, no explanation text.`

  const prompt = `Training sessions:
${JSON.stringify(context.currentSessions, null, 2)}

User request: "${context.userRequest}"

INSTRUCTIONS:
1. Modify the exercises in one or more sessions to satisfy the request
2. Keep the same day_of_week and session_name values
3. Keep a similar exercise count per session

Return ONLY this JSON structure (no markdown, no extra text):
{"sessions": [{"day_of_week": <number>, "session_name": "<string>", "exercises": [{"name": "<string>", "sets": <number>, "reps": "<string>", "rir": <number>, "notes": "<string>"}]}]}`

  try {
    const raw = await callClaude(apiKey, system, prompt)
    const result = extractJson(raw) as Record<string, unknown>
    const sessions = (result as any).sessions
    if (!Array.isArray(sessions) || sessions.length === 0) return null
    if (!sessions.every((s: any) => Array.isArray(s?.exercises) && s.exercises.length > 0)) return null
    return sessions
  } catch (e) {
    console.error('[ClaudeService] Workout refinement failed:', e)
    return null
  }
}

export interface AIRequestResult {
  action: 'update' | 'reject' | 'refine_workout' | 'refine_diet' | 'explain'
  message: string
  settingChanges?: Record<string, unknown>
  regenerateTraining?: boolean
  regenerateDiet?: boolean
  postRefinementInstruction?: string  // injury/safety refinement to run after plan generation
  maxSetsOverride?: number  // hard cap on sets (independent of sets_per_exercise default)
}

export async function processAIRequest(
  apiKey: string,
  context: {
    userRequest: string
    currentUser: Record<string, unknown>
    domain: 'training' | 'diet' | 'general'
  }
): Promise<AIRequestResult | null> {
  const u = context.currentUser
  const system = `You are a bodybuilding prep coach AI assistant. Your job is to parse user requests about their training and nutrition, and respond with ONLY valid JSON. Never include markdown fences or text outside the JSON object.`

  const today = new Date().toLocaleDateString('en-CA')
  // Compute weeks_out for phase context
  const weeksOutForAI = u.show_date
    ? Math.max(0, Math.floor((new Date((u.show_date as string) + 'T12:00:00').getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 7)))
    : null
  const prepPhaseForAI = weeksOutForAI !== null
    ? (weeksOutForAI > 16 ? 'hypertrophy' : weeksOutForAI > 8 ? 'strength' : weeksOutForAI > 3 ? 'peak' : 'deload/peak week')
    : 'off-season'

  const prompt = `Today's date: ${today}

Current user profile:
goal=${u.goal} | weight=${u.weight_kg}kg | training=${u.training_frequency}days/wk
split=${u.split_preference} | exercises/session=${u.exercises_per_session} | sets/exercise=${u.sets_per_exercise}
diet=${u.dietary_preference} | meals/day=${u.meal_count} | snacks/day=${u.snack_count ?? 0}
cook=${u.cooking_time_pref} | culture=${u.culture_pref} | activity=${u.activity_level}
equipment=${u.equipment_access} | division=${u.division ?? 'none'} | show_date=${u.show_date ?? 'not set'}
prep_phase=${prepPhaseForAI} | weeks_out=${weeksOutForAI !== null ? weeksOutForAI : 'N/A (no show)'}
dietary_restrictions=${JSON.stringify(u.dietary_restrictions ?? [])}
food_exclusions=${JSON.stringify(u.food_exclusions ?? [])}
food_preferences=${JSON.stringify(u.food_preferences ?? [])}
existing_recovery_notes=${u.recovery_notes ? `"${u.recovery_notes}"` : 'none'}

⚠️ EXISTING SAFETY CONSTRAINTS: ${u.recovery_notes
  ? `User has ACTIVE injury/recovery notes: "${u.recovery_notes}". Any response MUST respect and preserve these constraints. Do NOT suggest exercises that conflict with this.`
  : 'None — no active injury notes.'}

User request: "${context.userRequest}"

=== RESPONSE ACTIONS ===

Use "update" when: user wants to change a profile setting, dietary preference, training setup, show date, etc.
Use "refine_workout" when: user asks to tweak specific exercises, add/remove exercises, change exercise order — WITHOUT restructuring the whole plan (e.g. "add more tricep work", "swap bench for dumbbell press", "more volume on pull day")
Use "refine_diet" when: user asks to swap specific foods in their meal plan WITHOUT changing settings (e.g. "replace chicken with fish", "add more rice to lunch", "less red meat")
Use "explain" when: the request involves something the app can't change directly — weight updates (must be logged via weekly check-in), calorie targets (auto-calculated), body fat (measured externally), injury medical advice
Use "reject" when: request is genuinely harmful or outrageous for bodybuilding — single-food diets, 0-1 training days, single-muscle-group programs, dangerous extreme cuts

=== ALLOWED settingChanges FIELDS (exact column names only — NEVER invent others) ===
- training_frequency: integer 2–6
- split_preference: "ppl" | "upper_lower" | "arnold" | "bro" | "full_body" | "auto"
- exercises_per_session: integer 3–12
- sets_per_exercise: integer 1–12
- equipment_access: "full_gym" | "home" | "minimal"
- goal: "cut" | "maintain" | "recomp"
- activity_level: "sedentary" | "light" | "moderate" | "active"
- training_experience_years: number (e.g. 3 or 1.5)
- division: string (e.g. "Classic Physique", "Men's Physique", "Bikini", "Open Bodybuilding", "Wellness", "Figure", "Women's Physique", "212 Bodybuilding")
- show_date: string in YYYY-MM-DD format (compute from today ${today} + user's timeframe)
- meal_count: integer 3–6
- snack_count: integer 0–3 (snacks per day, ~200 kcal each, placed between main meals)
- dietary_preference: "omnivore" | "vegetarian" | "vegan"
- cooking_time_pref: "quick" | "medium" | "chef"
- meal_prep_style: "daily" | "batch" | "mixed"
- culture_pref: "any" | "mexican" | "indian" | "mediterranean" | "asian" | "west_african" | "japanese" | "korean" | "middle_eastern"
- dietary_restrictions: string[] — FULL new array. Valid values: "Dairy-free" | "Gluten-free" | "No pork" | "No shellfish" | "Nut allergy" | "Peanut allergy" | "Sesame allergy" | "Coconut allergy" | "Low FODMAP" | "No beef" | "No fish" | "No eggs" | "No soy" | "No chicken"
- food_exclusions: string[] — FULL array of food IDs to exclude. MUST use underscore_lowercase IDs (no spaces, no capitals).
  Proteins: eggs, egg_whites, chicken_breast, chicken_thigh, rotisserie_chicken, canned_chicken, turkey_breast, lean_ground_turkey, deli_turkey, lean_beef, ground_beef_lean, beef_steak, sirloin, salmon, tuna_can, tuna_steak, tilapia, cod, halibut, mahi_mahi, swordfish, smoked_salmon, herring, anchovies, sardines, mackerel, sea_bass, trout, shrimp, crab, lobster, scallops, oysters, pork_tenderloin, pork_chop, bacon, ham, sausage, hot_dog, seitan, beyond_burger, greek_yogurt, cottage_cheese, whey_protein, casein_protein, pea_protein, tofu, tempeh, edamame, black_beans, chickpeas, lentils, navy_beans, kidney_beans, quest_bar, protein_bar_generic.
  Carbs: white_rice, brown_rice, oats, sweet_potato, pasta, bread_ww, quinoa, cream_of_rice, rice_cakes, wild_rice, millet, buckwheat, rye_bread, sourdough_bread, white_bread, bagel, english_muffin, pita_bread, naan, flour_tortilla, crackers, pretzels, popcorn, granola, banana, apple, orange, mango, berries, grapes, watermelon, kiwi, peach, cherries, raspberries, blackberries, pear, dates, raisins.
  Fats: almonds, walnuts, cashews, macadamia_nuts, hazelnut, pecan, pistachio, brazil_nut, pine_nuts, peanut_butter, almond_butter, cashew_butter, hazelnut_butter, sunflower_seed_butter, tahini, sesame_seeds, olive_oil, avocado_oil, coconut_oil, avocado, pumpkin_seeds, sunflower_seeds, chia_seeds, flaxseed, hemp_seeds, butter, ghee, sour_cream, heavy_cream, coconut_cream, parmesan, feta, cheddar, mozzarella, ricotta, cream_cheese, swiss_cheese, goat_cheese, dark_chocolate.
  Allergy presets (use EXACT lists — verified for completeness):
    egg allergy → ["eggs","egg_whites"]
    tree nut allergy → ["almonds","walnuts","cashews","macadamia_nuts","hazelnut","pecan","pistachio","brazil_nut","pine_nuts","almond_butter","cashew_butter","hazelnut_butter","almond_milk","cashew_milk","mixed_nuts","trail_mix"]
    peanut allergy (separate from tree nuts — peanut is a legume) → ["peanut_butter","peanuts_raw","peanuts_roasted","peanut_oil"]
    sesame allergy → ["sesame_seeds","sesame_oil","tahini"]
    coconut allergy → ["coconut_oil","coconut_cream","coconut_milk","coconut_flakes"]
    dairy allergy → ["greek_yogurt","cottage_cheese","whole_milk","milk_skim","whey_protein","casein_protein","kefir","mozzarella","cheddar","ricotta","parmesan","feta","butter","ghee","sour_cream","heavy_cream","cream_cheese","swiss_cheese","goat_cheese","dahi","labneh","halloumi","paneer"]
    gluten-free → ["oats","bread_ww","pasta","bulgur_wheat","barley","couscous","ezekiel_bread","rye_bread","sourdough_bread","white_bread","bagel","english_muffin","pita_bread","naan","flour_tortilla","crackers","pretzels","seitan","pizza_slice_cheese","subway_6in_turkey","hot_dog","breakfast_burrito"]
    shellfish allergy → ["shrimp","crab","lobster","scallops","oysters","mussels","clams","squid"]
    no pork → ["pork_tenderloin","pork_chop","pork","bacon","ham","sausage","pork_belly","hot_dog"]
    no fish → ["salmon","tuna_can","tuna_steak","tilapia","cod","halibut","sardines","mackerel","sea_bass","trout","mahi_mahi","swordfish","herring","anchovies","smoked_salmon"]
    soy allergy → ["tofu","tempeh","edamame","soy_protein","soy_milk","miso_paste"]
- food_preferences: string[] — FULL array of preferred food IDs (same underscore_lowercase format). These foods appear in meals where macro-appropriate. e.g. ["salmon","oats","sweet_potato","greek_yogurt"]
- recovery_notes: string — injury/recovery notes. Be specific: body part + what to avoid (e.g. "knee pain - avoid barbell squats, leg press, deep lunges")

=== REGENERATION RULES ===
Set regenerateTraining=true when settingChanges contains: training_frequency, split_preference, exercises_per_session, sets_per_exercise, equipment_access, goal (if affects periodization), show_date, training_experience_years, division, recovery_notes
Set regenerateDiet=true when settingChanges contains: meal_count, snack_count, dietary_preference, cooking_time_pref, meal_prep_style, culture_pref, dietary_restrictions, food_exclusions, food_preferences, goal, activity_level

=== INJURY AND CONSTRAINT RULES ===
When the request mentions an injury or physical limitation:
1. Set recovery_notes in settingChanges to describe it specifically
2. Set regenerateTraining=true so the plan is rebuilt with safe exercises
3. Set postRefinementInstruction to a clear safety instruction for a second review pass
   Example: "User has knee pain. In all lower body sessions: replace barbell squats, leg press, walking lunges with Romanian Deadlifts, Hip Thrusts, Glute Bridges, Prone/Seated Leg Curls. Verify no exercise loads the knee joint directly."

When the request specifies set count constraints (e.g. "max 3 sets", "most exercises 2 sets"):
1. Set sets_per_exercise to the DEFAULT count ("most exercises" value)
2. Set maxSetsOverride to the MAXIMUM count
3. Set postRefinementInstruction to enforce the constraint across all exercises

=== EXAMPLES ===
"change to upper lower" → {action:"update",settingChanges:{split_preference:"upper_lower"},regenerateTraining:true,regenerateDiet:false,message:"Switching to Upper/Lower split."}
"train 5 days PPL" → {action:"update",settingChanges:{training_frequency:5,split_preference:"ppl"},regenerateTraining:true,regenerateDiet:false,message:"Updated to 5-day PPL split."}
"home gym, dumbbells only" → {action:"update",settingChanges:{equipment_access:"home"},regenerateTraining:true,regenerateDiet:false,message:"Switching to home gym programming."}
"my knees hurt, upper lower, max 3 sets most 2" → {action:"update",settingChanges:{split_preference:"upper_lower",sets_per_exercise:2,recovery_notes:"knee pain - avoid barbell squats, leg press, deep lunges, box jumps"},regenerateTraining:true,regenerateDiet:false,maxSetsOverride:3,postRefinementInstruction:"User has knee pain. Replace all knee-loading exercises in lower body sessions with: Romanian Deadlifts, Hip Thrusts, Glute Bridges, Prone Leg Curls, Seated Leg Curls. Every exercise must have 2 sets; compound movements may have up to 3 sets maximum.",message:"Switching to Upper/Lower with knee-safe exercises. Max 3 sets, most exercises 2 sets."}
"I had knee surgery, keep volume low" → {action:"update",settingChanges:{sets_per_exercise:2,recovery_notes:"post-knee surgery - no squats, no leg press, no lunges, no jumping"},regenerateTraining:true,regenerateDiet:false,maxSetsOverride:2,postRefinementInstruction:"Post-knee surgery patient. Remove ALL knee-loading exercises from every session. Replace with upper body or hip-hinge alternatives. Max 2 sets per exercise.",message:"Plan updated for knee surgery recovery. Removed all knee-loading exercises and kept volume low."}
"my shoulder hurts" → {action:"update",settingChanges:{recovery_notes:"shoulder pain - avoid overhead pressing, upright rows, behind-neck movements"},regenerateTraining:true,regenerateDiet:false,postRefinementInstruction:"User has shoulder pain. Remove all overhead pressing (OHP, dumbbell shoulder press, Arnold press) and upright rows. Replace with cable lateral raises, machine shoulder press (neutral grip), face pulls, and supported rows.",message:"Updated plan to avoid shoulder-stressing exercises."}
"my lower back is injured" → {action:"update",settingChanges:{recovery_notes:"lower back injury - avoid conventional deadlifts, good mornings, heavy barbell rows"},regenerateTraining:true,regenerateDiet:false,postRefinementInstruction:"User has lower back injury. Replace conventional deadlifts, good mornings, and heavy barbell rows with: Romanian Deadlifts (controlled), Hip Thrusts, Glute Bridges, Cable Pull-Throughs, Lat Pulldowns, Seated Cable Rows.",message:"Plan updated to protect your lower back."}
"max 3 sets per exercise" → {action:"update",settingChanges:{sets_per_exercise:3},regenerateTraining:true,regenerateDiet:false,maxSetsOverride:3,postRefinementInstruction:"All exercises must have exactly 3 sets. Do not exceed 3 sets on any exercise.",message:"Capping all exercises at 3 sets."}
"most exercises 2 sets, max 3" → {action:"update",settingChanges:{sets_per_exercise:2},regenerateTraining:true,regenerateDiet:false,maxSetsOverride:3,postRefinementInstruction:"Most exercises: 2 sets. Only key compound movements (first exercise in a session) may have 3 sets. Do not exceed 3 sets on any exercise.",message:"Set volume to 2 sets (most exercises), up to 3 for compounds."}
"I compete in Classic Physique" → {action:"update",settingChanges:{division:"Classic Physique"},regenerateTraining:true,regenerateDiet:false,message:"Updated division to Classic Physique."}
"my show is in 8 weeks" → {action:"update",settingChanges:{show_date:"<today + 56 days YYYY-MM-DD>"},regenerateTraining:true,regenerateDiet:false,message:"Show date set 8 weeks out. Plan will enter peak phase."}
"I've been training 5 years" → {action:"update",settingChanges:{training_experience_years:5},regenerateTraining:true,regenerateDiet:false,message:"Updated training experience to 5 years."}
"switch to maintenance" → {action:"update",settingChanges:{goal:"maintain"},regenerateTraining:false,regenerateDiet:true,message:"Switching to maintenance calories."}
"make me dairy free" → {action:"update",settingChanges:{dietary_restrictions:["Dairy-free"],food_exclusions:["greek_yogurt","cottage_cheese","whole_milk","milk_skim","whey_protein","casein_protein","kefir","mozzarella","cheddar","ricotta","parmesan","feta","butter","ghee","sour_cream","heavy_cream","cream_cheese","swiss_cheese","goat_cheese","dahi","labneh"]},regenerateTraining:false,regenerateDiet:true,message:"Added dairy-free restriction and excluded all dairy foods."}
"I'm allergic to eggs" → {action:"update",settingChanges:{food_exclusions:["eggs","egg_whites"]},regenerateTraining:false,regenerateDiet:true,message:"Excluded eggs and egg whites from your meal plan."}
"I'm allergic to nuts" → {action:"update",settingChanges:{dietary_restrictions:["Nut allergy"],food_exclusions:["almonds","walnuts","cashews","macadamia_nuts","hazelnut","pecan","pistachio","brazil_nut","pine_nuts","almond_butter","cashew_butter","hazelnut_butter","almond_milk","cashew_milk","mixed_nuts","trail_mix"]},regenerateTraining:false,regenerateDiet:true,message:"Added nut allergy restriction and excluded all tree nut products."}
"I'm allergic to peanuts" → {action:"update",settingChanges:{dietary_restrictions:["Peanut allergy"],food_exclusions:["peanut_butter","peanuts_raw","peanuts_roasted","peanut_oil"]},regenerateTraining:false,regenerateDiet:true,message:"Excluded all peanut products. Note: peanut allergy is separate from tree nut allergy."}
"I'm allergic to sesame" → {action:"update",settingChanges:{dietary_restrictions:["Sesame allergy"],food_exclusions:["sesame_seeds","sesame_oil","tahini"]},regenerateTraining:false,regenerateDiet:true,message:"Excluded sesame seeds, sesame oil, and tahini from your meal plan."}
"I prefer salmon" → {action:"update",settingChanges:{food_preferences:["salmon"]},regenerateTraining:false,regenerateDiet:true,message:"Set salmon as a preferred protein in your meal plan."}
"I eat at Chipotle" → {action:"update",settingChanges:{food_preferences:["chipotle_chicken_bowl"]},regenerateTraining:false,regenerateDiet:true,message:"Added Chipotle Chicken Bowl as a preferred meal option."}
"I like Quest bars as snacks" → {action:"update",settingChanges:{food_preferences:["quest_bar"]},regenerateTraining:false,regenerateDiet:true,message:"Set Quest Bars as a preferred snack option in your plan."}
"6 meals a day" → {action:"update",settingChanges:{meal_count:6},regenerateTraining:false,regenerateDiet:true,message:"Updated to 6 meals/day."}
"Indian food" → {action:"update",settingChanges:{culture_pref:"indian"},regenerateTraining:false,regenerateDiet:true,message:"Switching to Indian food style."}
"add more shoulder exercises" → {action:"refine_workout",regenerateTraining:false,regenerateDiet:false,message:"Adding more shoulder work to existing sessions."}
"replace chicken with fish" → {action:"refine_diet",regenerateTraining:false,regenerateDiet:false,message:"Swapping chicken for fish in meals."}
"I weigh 190 lbs now" → {action:"explain",regenerateTraining:false,regenerateDiet:false,message:"Weight must be logged in your weekly Check-In tab so macros recalculate correctly."}
"I want 2200 calories" → {action:"explain",regenerateTraining:false,regenerateDiet:false,message:"Calories are auto-calculated from goal + activity. Change goal to 'maintain' or increase activity level if you want more calories."}
"glutes only" → {action:"reject",regenerateTraining:false,regenerateDiet:false,message:"A glutes-only program causes severe muscular imbalances. A balanced split is required for competition prep."}
"chocolate only diet" → {action:"reject",regenerateTraining:false,regenerateDiet:false,message:"A single-food diet is dangerously deficient in protein, fats, and micronutrients."}

Return ONLY this JSON (no markdown, no other text):
{"action":"update"|"refine_workout"|"refine_diet"|"explain"|"reject","message":"<friendly explanation>","settingChanges":{<only changed fields>},"regenerateTraining":true|false,"regenerateDiet":true|false,"postRefinementInstruction":"<optional: specific safety/constraint instruction for post-generation review>","maxSetsOverride":<optional number: hard cap on sets>}`

  try {
    const raw = await callClaude(apiKey, system, prompt)
    const result = extractJson(raw) as AIRequestResult
    if (!result.action || !result.message) return null
    result.regenerateTraining = result.regenerateTraining ?? false
    result.regenerateDiet = result.regenerateDiet ?? false
    return result

  } catch (e) {
    console.error('[ClaudeService] processAIRequest failed:', e)
    return null
  }
}
