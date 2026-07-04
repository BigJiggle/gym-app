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
