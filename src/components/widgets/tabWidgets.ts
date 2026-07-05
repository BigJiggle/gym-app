import { createWidgetStore } from './createWidgetStore'
import type { TabWidgetMeta } from './TabWidgetControls'

// Add/removable sections for the Training "My Plan" tab. The page renders each
// card only when its id is enabled; order here is the canonical display order.
export const TRAINING_WIDGET_META: TabWidgetMeta[] = [
  { id: 'countdown', title: 'Show Day Countdown', description: 'Weeks out from your primary show and prep progress.' },
  { id: 'phase', title: 'Phase Summary', description: 'Current training phase, plan length and sessions per week.' },
  { id: 'sessions-week', title: 'Sessions This Week', description: 'Completed vs scheduled sessions and your weekly streak.' },
  { id: 'calorie-burn', title: 'Calorie Burn', description: "Estimated calories burned from this week's completed workouts." },
  { id: 'volume', title: 'Weekly Volume', description: 'Sets per muscle group vs minimum effective volume, and last week.' },
]
export const TRAINING_WIDGET_IDS = TRAINING_WIDGET_META.map((w) => w.id)
// Fresh installs see the core prep signals; phase summary and the calorie-burn
// estimate are opt-in so the default tab isn't a wall of cards.
export const TRAINING_DEFAULT_IDS = ['countdown', 'sessions-week', 'volume']
export const trainingWidgetStore = createWidgetStore(
  'training_plan_widgets',
  TRAINING_WIDGET_IDS,
  TRAINING_DEFAULT_IDS,
)

// Add/removable sections for the Nutrition "Meal Plan" tab.
export const NUTRITION_WIDGET_META: TabWidgetMeta[] = [
  { id: 'todays-intake', title: "Today's Intake", description: 'Calories and macros consumed vs target for today.' },
  { id: 'water', title: 'Water Intake', description: 'Track hydration in glasses against a daily target.' },
  { id: 'cardio', title: 'Cardio', description: "Log today's cardio minutes and see the weekly total." },
  { id: 'refeed', title: 'Refeed Day', description: 'Set a weekly refeed day and see the adjusted targets.' },
  { id: 'adherence-streak', title: 'Adherence Streak', description: 'Consecutive days with every meal logged.' },
  { id: 'week', title: 'This Week', description: 'Day-by-day meal completion and weekly calorie/protein totals.' },
  { id: 'meal-schedule', title: 'Meal Schedule', description: 'Timeline of today\'s meals with next/missed indicators.' },
]
export const NUTRITION_WIDGET_IDS = NUTRITION_WIDGET_META.map((w) => w.id)
// Fresh installs see intake, water and the meal timeline; cardio, refeed, the
// streak and weekly overview are opt-in to keep the default tab focused.
export const NUTRITION_DEFAULT_IDS = ['todays-intake', 'water', 'meal-schedule']
export const nutritionWidgetStore = createWidgetStore(
  'nutrition_plan_widgets',
  NUTRITION_WIDGET_IDS,
  NUTRITION_DEFAULT_IDS,
)
