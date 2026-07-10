import type { FC } from 'react'
import type { WidgetId } from './useWidgets'
import WaterWidget from './WaterWidget'
import CardioWidget from './CardioWidget'
import SessionsWeekWidget from './SessionsWeekWidget'
import WeeklyVolumeWidget from './WeeklyVolumeWidget'
import PosingWidget from './PosingWidget'
import SupplementWidget from './SupplementWidget'
import SleepWidget from './SleepWidget'
import ConditionWidget from './ConditionWidget'
import QuickStatsWidget from './QuickStatsWidget'
import TodaysMacrosWidget from './TodaysMacrosWidget'
import NextMealWidget from './NextMealWidget'
import DailyWeighInWidget from './DailyWeighInWidget'
import PeakWeekWidget from './PeakWeekWidget'
import PrepPaceWidget from './PrepPaceWidget'
import WeeklyScorecardWidget from './WeeklyScorecardWidget'
import TodaysSessionWidget from './TodaysSessionWidget'
import CheckinFeedbackWidget from './CheckinFeedbackWidget'
import PrepGuidanceWidget from './PrepGuidanceWidget'
import TodaysMealsWidget from './TodaysMealsWidget'
import RecentCheckinsWidget from './RecentCheckinsWidget'
import TrainingVolumeWidget from './TrainingVolumeWidget'
import MuscleCoverageWidget from './MuscleCoverageWidget'

export interface WidgetDef {
  id: WidgetId
  title: string
  description: string
  // Competition-only widgets are hidden and left out of the Add Widgets catalog
  // until the user has a show selected.
  competitionOnly?: boolean
  Component: FC
}

export const WIDGETS: WidgetDef[] = [
  { id: 'quick-stats', title: 'Quick Stats', description: 'Weight, daily calories, show countdown / phase, and training days at a glance.', Component: QuickStatsWidget },
  { id: 'todays-macros', title: "Today's Macros", description: 'Calories and macros consumed vs target for today.', Component: TodaysMacrosWidget },
  { id: 'next-meal', title: 'Next Meal', description: 'Your next un-eaten meal with a countdown and quick mark-eaten.', Component: NextMealWidget },
  { id: 'daily-weigh-in', title: 'Daily Weigh-In', description: 'Log fasted morning weight with a smoothed 7-day average and trend.', Component: DailyWeighInWidget },
  { id: 'prep-pace', title: 'Prep Pace', description: 'Weekly weight-change rate vs your goal, with a projected show-day weight.', Component: PrepPaceWidget },
  { id: 'weekly-scorecard', title: 'Weekly Scorecard', description: 'This week\'s adherence across training, meals, cardio, posing and sleep.', Component: WeeklyScorecardWidget },
  { id: 'todays-session', title: "Today's Session", description: 'Today\'s workout with last-time weights and progression targets, or rest-day preview.', Component: TodaysSessionWidget },
  { id: 'checkin-feedback', title: 'Check-In Feedback', description: 'Your latest check-in weight and the coach adjustments applied.', Component: CheckinFeedbackWidget },
  { id: 'prep-guidance', title: 'This Week in Prep', description: 'Phase-specific training/nutrition/cardio focus and weekly milestones before a show.', competitionOnly: true, Component: PrepGuidanceWidget },
  { id: 'todays-meals', title: "Today's Meals", description: 'Check off meals as you eat them with running calorie/protein progress.', Component: TodaysMealsWidget },
  { id: 'recent-checkins', title: 'Recent Check-Ins', description: 'Last 4 weigh-ins with adherence and calorie adjustments.', Component: RecentCheckinsWidget },
  { id: 'training-volume', title: "This Week's Volume", description: 'Sessions, sets, total weight moved, and estimated training calories burned.', Component: TrainingVolumeWidget },
  { id: 'muscle-coverage', title: 'Muscle Coverage', description: 'Sets per muscle group trained so far this week.', Component: MuscleCoverageWidget },
  { id: 'peak-week', title: 'Peak Week Protocol', description: 'Daily water/sodium/training/nutrition guidance in the final week before a show.', competitionOnly: true, Component: PeakWeekWidget },
  { id: 'water', title: 'Water Intake', description: 'Track daily hydration against your target with quick-add buttons.', Component: WaterWidget },
  { id: 'cardio', title: 'Cardio', description: 'Log today\'s cardio and see weekly sessions and minutes.', Component: CardioWidget },
  { id: 'sessions-week', title: 'Sessions This Week', description: 'Completed vs scheduled training sessions for the current week.', Component: SessionsWeekWidget },
  { id: 'weekly-volume', title: 'Weekly Volume', description: 'How many muscle groups have hit minimum effective volume this week.', Component: WeeklyVolumeWidget },
  { id: 'posing', title: 'Posing Practice', description: 'Log posing sessions and see how much you\'ve practiced this week.', competitionOnly: true, Component: PosingWidget },
  { id: 'supplements', title: 'Supplements', description: 'Track your daily supplement stack and 7-day adherence.', competitionOnly: true, Component: SupplementWidget },
  { id: 'sleep', title: 'Sleep', description: 'Log nightly sleep hours with a 7-day average and history.', competitionOnly: true, Component: SleepWidget },
  { id: 'condition', title: 'Daily Condition', description: 'Tag how you look each day (full, dry, flat…) heading into a show.', competitionOnly: true, Component: ConditionWidget },
]

export function getWidget(id: WidgetId): WidgetDef | undefined {
  return WIDGETS.find((w) => w.id === id)
}
