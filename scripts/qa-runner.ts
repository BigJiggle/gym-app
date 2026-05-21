#!/usr/bin/env tsx
/**
 * QA Runner — automated human-perspective bug hunter
 *
 * Run with:  npx tsx scripts/qa-runner.ts
 *
 * This script does NOT start the Electron app. It exercises the
 * service-layer logic (engines + schedule helpers) and validates
 * state contracts that the UI depends on.
 *
 * It is intentionally adversarial — it tries the kind of sequences
 * a real user would stumble into, not just the happy path.
 *
 * Exit codes:
 *   0 = all checks passed
 *   1 = one or more checks failed
 */

import { getNextCheckinDate, computeMissedSlots } from '../electron/services/checkinSchedule'
import { calculateAdjustments }                   from '../electron/services/checkinEngine'
import { generateNutritionPlan }                  from '../electron/services/nutritionEngine'
import { generateTrainingPlan }                   from '../electron/services/trainingEngine'

// ── Tiny assertion helper ─────────────────────────────────────────────────────

let passed = 0
let failed = 0
const failures: string[] = []

function check(label: string, value: boolean, detail = '') {
  if (value) {
    console.log(`  ✓  ${label}`)
    passed++
  } else {
    console.error(`  ✗  ${label}${detail ? ` — ${detail}` : ''}`)
    failures.push(label)
    failed++
  }
}

function section(title: string) {
  console.log(`\n${'─'.repeat(60)}`)
  console.log(`  ${title}`)
  console.log('─'.repeat(60))
}

function daysFromToday(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toLocaleDateString('en-CA')
}

// ── SECTION 1: Schedule — form must open after deadline passes ────────────────

section('1. Schedule: form opens after missed deadline')

{
  // Day-based: last check-in was 2 weeks ago on the same day-of-week
  const checkinDow = (new Date().getDay() + 3) % 7   // pick a future day
  const lastDate   = daysFromToday(-14)
  const next = getNextCheckinDate(lastDate, 'day', checkinDow, false, 7)
  check(
    'Day-based: 2 weeks since last check-in → nextAllowed is in the past (form open)',
    next <= new Date(),
    `nextAllowed=${next.toLocaleDateString('en-CA')} today=${daysFromToday(0)}`
  )
}

{
  // Interval-based: last check-in was 10 days ago, interval=7 → overdue
  const next = getNextCheckinDate(daysFromToday(-10), 'interval', 1, false, 7)
  check(
    'Interval-based: 10 days since last (interval=7) → form open',
    next <= new Date()
  )
}

{
  // Just checked in today → form must be locked
  const today = daysFromToday(0)
  const next  = getNextCheckinDate(today, 'interval', 1, false, 7)
  check(
    'Just checked in today → form locked (nextAllowed is future)',
    next > new Date()
  )
}

// ── SECTION 2: Missed slots — no false positives from late check-ins ──────────

section('2. Missed slots: late ≠ missed')

{
  // Gap of 13 days with interval=7 → user was 6 days late but NOT missed
  const history = [
    { check_in_date: daysFromToday(-20), week_number: 1, schedule_type: 'interval' as const, interval_days: 7 },
    { check_in_date: daysFromToday(-7),  week_number: 2, schedule_type: 'interval' as const, interval_days: 7 },
  ]
  const missed = computeMissedSlots(history, 'interval', 1, 7)
  check(
    '13-day gap (interval=7): 0 missed (late check-in, not skipped)',
    missed.length === 0,
    `got ${missed.length} missed slots`
  )
}

{
  // Gap of 14 days with interval=7 → exactly 1 full interval skipped
  const history = [
    { check_in_date: daysFromToday(-21), week_number: 1, schedule_type: 'interval' as const, interval_days: 7 },
    { check_in_date: daysFromToday(-7),  week_number: 2, schedule_type: 'interval' as const, interval_days: 7 },
  ]
  const missed = computeMissedSlots(history, 'interval', 1, 7)
  check(
    '14-day gap (interval=7): exactly 1 missed slot',
    missed.length === 1,
    `got ${missed.length}`
  )
}

{
  // Labels must NOT say "Week N" — must use date to avoid conflict with real check-ins
  const history = [
    { check_in_date: daysFromToday(-21), week_number: 1, schedule_type: 'interval' as const, interval_days: 7 },
    { check_in_date: daysFromToday(-7),  week_number: 2, schedule_type: 'interval' as const, interval_days: 7 },
  ]
  const missed = computeMissedSlots(history, 'interval', 1, 7)
  const hasWeekLabel = missed.some(m => /^Week \d/i.test(m.expected_label))
  check(
    'Missed slot labels use date, not "Week N" (no conflict with real check-ins)',
    !hasWeekLabel,
    missed[0]?.expected_label
  )
}

{
  // Interval switch: old period uses old interval, new period uses new interval
  const history = [
    { check_in_date: daysFromToday(-21), week_number: 1, schedule_type: 'interval' as const, interval_days: 7 },
    { check_in_date: daysFromToday(-7),  week_number: 2, schedule_type: 'interval' as const, interval_days: 2 },
  ]
  // Gap between entries = 14 days, first entry's interval = 7 → 1 missed
  const missed = computeMissedSlots(history, 'interval', 1, 2)  // current = 2
  const pairMissed = missed.filter(m => m.expected_date <= daysFromToday(-7))
  check(
    'After interval switch: old gap uses old interval (1 missed from 7-day period)',
    pairMissed.length === 1,
    `got ${pairMissed.length} from old-interval gap`
  )
}

// ── SECTION 3: Calorie adjustment logic ──────────────────────────────────────

section('3. Calorie adjustments')

{
  // Weight dropped > 1.5% — should increase calories
  const adj = calculateAdjustments(
    { weight_kg: 82, training_adherence: 90, diet_adherence: 85, energy_level: 4, sleep_quality: 4, stress_level: 2 },
    { weight_kg: 85, week_number: 1 },
    2000,
    'cut'
  )
  check('Weight dropped >1.5% → calories_delta > 0', adj.calories_delta > 0, `delta=${adj.calories_delta}`)
}

{
  // Weight stalled → reduce calories for cut goal
  const adj = calculateAdjustments(
    { weight_kg: 84, training_adherence: 90, diet_adherence: 85, energy_level: 4, sleep_quality: 4, stress_level: 2 },
    { weight_kg: 84, week_number: 1 },
    2000,
    'cut'
  )
  check('Weight stalled on cut → calories_delta < 0', adj.calories_delta < 0, `delta=${adj.calories_delta}`)
}

{
  // Calories should never go below 1200 conceptually — verify engine delta alone
  // (clamping to 1200 happens in the handler, not the engine)
  const adj = calculateAdjustments(
    { weight_kg: 60, training_adherence: 30, diet_adherence: 30, energy_level: 1, sleep_quality: 1, stress_level: 5 },
    { weight_kg: 60, week_number: 1 },
    1300,
    'cut'
  )
  check(
    'Engine returns a delta; clamping to 1200 is handler responsibility (not negative infinity)',
    typeof adj.calories_delta === 'number' && isFinite(adj.calories_delta)
  )
}

{
  // Maintain goal with stable weight → no calorie change
  const adj = calculateAdjustments(
    { weight_kg: 80, training_adherence: 95, diet_adherence: 90, energy_level: 4, sleep_quality: 4, stress_level: 2 },
    { weight_kg: 80, week_number: 1 },
    2500,
    'maintain'
  )
  check('Maintain + stable weight → calories_delta = 0', adj.calories_delta === 0, `delta=${adj.calories_delta}`)
}

// ── SECTION 4: Nutrition plan — macro totals add up ──────────────────────────

section('4. Nutrition plan: macro totals are internally consistent')

{
  const plan = generateNutritionPlan({
    weight_kg: 80, height_cm: 178, age: 28, sex: 'male',
    goal: 'cut', activity_level: 'moderate',
    dietary_preference: 'omnivore', dietary_restrictions: [],
    meal_count: 4,
    food_preferences: [], food_exclusions: [], cooking_time_pref: 'medium', meal_prep_style: 'daily',
    culture_pref: 'any', include_snacks: 0,
  } as any)

  const mealTotal = plan.meals.reduce((s: number, m: any) => s + m.calories, 0)
  const tolerance = plan.calories_target * 0.05   // 5% tolerance

  check(
    'Meal calories sum within 5% of target calories',
    Math.abs(mealTotal - plan.calories_target) <= tolerance,
    `target=${plan.calories_target} meal_sum=${mealTotal}`
  )

  const proteinKcal = plan.protein_g * 4
  const carbKcal    = plan.carbs_g   * 4
  const fatKcal     = plan.fat_g     * 9
  const macroTotal  = proteinKcal + carbKcal + fatKcal

  check(
    'Macro kcal total within 5% of calorie target',
    Math.abs(macroTotal - plan.calories_target) <= tolerance,
    `p=${proteinKcal} c=${carbKcal} f=${fatKcal} total=${macroTotal} target=${plan.calories_target}`
  )

  check(
    'Cut goal: protein ≥ 2g/kg bodyweight',
    plan.protein_g >= 80 * 2,
    `protein_g=${plan.protein_g}`
  )
}

// ── SECTION 5: Training plan structural integrity ────────────────────────────

section('5. Training plan: structure matches user settings')

{
  const plan = generateTrainingPlan({
    training_frequency: 4, equipment_access: 'full_gym',
    goal: 'cut', weeks_out: 10, split_preference: 'auto',
    sets_per_exercise: 4, exercises_per_session: 6,
  } as any)

  check(
    'Training plan has exactly 4 sessions for frequency=4',
    plan.sessions.length === 4,
    `got ${plan.sessions.length}`
  )

  const allExercises = plan.sessions.flatMap((s: any) => s.exercises)
  check(
    'Every exercise in plan has a name and sets array',
    allExercises.every((e: any) => e.name && Array.isArray(e.sets)),
    `exercises=${allExercises.length}`
  )

  check(
    'Training plan has a phase field',
    typeof plan.phase === 'string' && plan.phase.length > 0,
    `phase=${plan.phase}`
  )
}

// ── SECTION 6: Regression — previously found bugs ────────────────────────────

section('6. Regression checks (BUG-004 through BUG-006)')

{
  // BUG-004: day-based missed deadline must open form, not lock extra week
  const lastDate = daysFromToday(-14)
  const dow      = (new Date().getDay() + 2) % 7
  const next     = getNextCheckinDate(lastDate, 'day', dow, false, 7)
  check('BUG-004 regression: day-based, 14 days later → form is open', next <= new Date())
}

{
  // BUG-005: late submission (13-day gap, interval=7) must NOT create missed slot
  const h = [
    { check_in_date: daysFromToday(-22), week_number: 1, schedule_type: 'interval' as const, interval_days: 7 },
    { check_in_date: daysFromToday(-9),  week_number: 2, schedule_type: 'interval' as const, interval_days: 7 },
  ]
  const missed = computeMissedSlots(h, 'interval', 1, 7)
  check('BUG-005 regression: 13-day gap produces 0 missed (not 1)', missed.length === 0, `got ${missed.length}`)
}

{
  // BUG-006: missed slot label must NOT be "Week 2 (Missed)" when Week 2 exists
  const h = [
    { check_in_date: daysFromToday(-21), week_number: 1, schedule_type: 'interval' as const, interval_days: 7 },
    { check_in_date: daysFromToday(-7),  week_number: 2, schedule_type: 'interval' as const, interval_days: 7 },
  ]
  const missed = computeMissedSlots(h, 'interval', 1, 7)
  const hasConflict = missed.some(m => m.expected_label.startsWith('Week 2'))
  check('BUG-006 regression: no "Week 2 (Missed)" label when Week 2 check-in exists', !hasConflict)
}

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${'═'.repeat(60)}`)
console.log(`  QA Runner Results`)
console.log('═'.repeat(60))
console.log(`  Passed: ${passed}`)
console.log(`  Failed: ${failed}`)

if (failures.length > 0) {
  console.error('\n  FAILURES:')
  failures.forEach(f => console.error(`    • ${f}`))
  console.log('')
  process.exit(1)
} else {
  console.log('  All checks passed ✓\n')
  process.exit(0)
}
