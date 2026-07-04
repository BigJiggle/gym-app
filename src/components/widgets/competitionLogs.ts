import { useUserStore } from '../../store/userStore'
import { createLocalStore } from './localStore'

// Shared, reactive localStorage logs for the competition-only widgets. Posing
// and sleep are also read by the Dashboard "Weekly Prep Scorecard", so they use
// the shared external store to stay in sync when a widget logs an entry.

export interface PosingEntry { date: string; focus: string; minutes: number }
export interface SleepEntry { date: string; hours: number }
export interface ConditionEntry { date: string; tags: string[]; note: string }
export interface SupplementDay { date: string; taken: string[] }

export const DEFAULT_SUPPLEMENTS = ['Creatine', 'Fish Oil', 'Vitamin D', 'Multi-Vitamin']

export const posingStore = createLocalStore<PosingEntry[]>('posing_log', () => [])
export const sleepStore = createLocalStore<SleepEntry[]>('sleep_log', () => [])
export const conditionStore = createLocalStore<ConditionEntry[]>('condition_log', () => [])
export const supplementListStore = createLocalStore<string[]>('supplement_list', () => [...DEFAULT_SUPPLEMENTS])
export const supplementLogStore = createLocalStore<SupplementDay[]>('supplement_log', () => [])

// A competition/show is "selected" when the user has at least one show (or the
// legacy single show_date on the profile). Competition-only widgets are hidden
// and left out of the Add Widgets catalog until this is true.
export function useHasShow(): boolean {
  const { shows, user } = useUserStore()
  return shows.length > 0 || !!user?.show_date
}
