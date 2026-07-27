// Returns YYYY-MM-DD in the user's LOCAL timezone — never UTC.
// toISOString() gives UTC which is wrong after ~4-8PM in US timezones.
export function localDateStr(d: Date = new Date()): string {
  return d.toLocaleDateString('en-CA')  // en-CA locale = YYYY-MM-DD, in local time
}

// Parses a YYYY-MM-DD date string as LOCAL noon to avoid UTC-midnight timezone shifts.
// new Date("2024-04-26") parses as UTC midnight → shows April 25 in PST. This fixes that.
export function parseLocalDate(dateStr: string): Date {
  return new Date(dateStr + 'T12:00:00')
}

// Returns exact days, whole weeks, and remainder days until a show date.
// Uses local midnight → local noon to stay immune to DST and UTC shifts.
// `totalDays` is clamped at 0 (a past show reads as 0, same as today) — many
// callers rely on that non-negative contract — so `isPast` is exposed
// separately to distinguish a show that has already happened from one that is
// today. Without it, a widget left open past the show day can't tell "today"
// (totalDays 0) from "yesterday" (also clamped to 0) and shows "SHOW DAY!"
// forever until the next launch repoints show_date.
export function getShowCountdown(showDate: string): { totalDays: number; weeks: number; days: number; isPast: boolean } {
  const show = new Date(showDate + 'T12:00:00')
  const now = new Date()
  // Construct local midnight explicitly — avoids setHours DST edge cases
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const rawDays = Math.floor((show.getTime() - todayMidnight.getTime()) / 86400000)
  const totalDays = Math.max(0, rawDays)
  return { totalDays, weeks: Math.floor(totalDays / 7), days: totalDays % 7, isPast: rawDays < 0 }
}
