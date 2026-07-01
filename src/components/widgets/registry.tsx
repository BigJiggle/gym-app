import type { FC } from 'react'
import type { WidgetId } from './useWidgets'
import WaterWidget from './WaterWidget'
import CardioWidget from './CardioWidget'
import SessionsWeekWidget from './SessionsWeekWidget'
import WeeklyVolumeWidget from './WeeklyVolumeWidget'

export interface WidgetDef {
  id: WidgetId
  title: string
  description: string
  Component: FC
}

export const WIDGETS: WidgetDef[] = [
  { id: 'water', title: 'Water Intake', description: 'Track daily hydration against your target with quick-add buttons.', Component: WaterWidget },
  { id: 'cardio', title: 'Cardio', description: 'Log today\'s cardio and see weekly sessions and minutes.', Component: CardioWidget },
  { id: 'sessions-week', title: 'Sessions This Week', description: 'Completed vs scheduled training sessions for the current week.', Component: SessionsWeekWidget },
  { id: 'weekly-volume', title: 'Weekly Volume', description: 'How many muscle groups have hit minimum effective volume this week.', Component: WeeklyVolumeWidget },
]

export function getWidget(id: WidgetId): WidgetDef | undefined {
  return WIDGETS.find((w) => w.id === id)
}
