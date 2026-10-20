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

// Entry sanitizers for the object-array logs. localStorage is user-editable, so a
// valid array can still carry a corrupt entry (a `null`, or an object missing a
// required field) that slips past localStore's top-level array guard and then
// crashes a widget's `.date`/`.tags`/`.taken` access. Each store drops entries
// that aren't well-formed so widgets always see the declared shape. (The string[]
// list just keeps the string members.)
const isObj = (e: unknown): e is Record<string, unknown> => typeof e === 'object' && e !== null
const strArray = (v: unknown): v is string[] => Array.isArray(v) && v.every((t) => typeof t === 'string')

function validPosing(e: unknown): e is PosingEntry {
  return isObj(e) && typeof e.date === 'string' && typeof e.focus === 'string' && Number.isFinite(e.minutes)
}
function validSleep(e: unknown): e is SleepEntry {
  return isObj(e) && typeof e.date === 'string' && Number.isFinite(e.hours)
}
function validCondition(e: unknown): e is ConditionEntry {
  return isObj(e) && typeof e.date === 'string' && strArray(e.tags) && typeof e.note === 'string'
}
function validSupplementDay(e: unknown): e is SupplementDay {
  return isObj(e) && typeof e.date === 'string' && strArray(e.taken)
}

export const posingStore = createLocalStore<PosingEntry[]>('posing_log', () => [], (a) => a.filter(validPosing))
export const sleepStore = createLocalStore<SleepEntry[]>('sleep_log', () => [], (a) => a.filter(validSleep))
export const conditionStore = createLocalStore<ConditionEntry[]>('condition_log', () => [], (a) => a.filter(validCondition))
export const supplementListStore = createLocalStore<string[]>('supplement_list', () => [...DEFAULT_SUPPLEMENTS], (a) => a.filter((s): s is string => typeof s === 'string'))
export const supplementLogStore = createLocalStore<SupplementDay[]>('supplement_log', () => [], (a) => a.filter(validSupplementDay))

// A competition/show is "selected" when the user has at least one show (or the
// legacy single show_date on the profile). Competition-only widgets are hidden
// and left out of the Add Widgets catalog until this is true.
export function useHasShow(): boolean {
  const { shows, user } = useUserStore()
  return shows.length > 0 || !!user?.show_date
}
