// Weeks until a show — computed from LOCAL MIDNIGHT, never Date.now().
//
// The UI countdown (`getShowCountdown` / `buildPrepTimeline` in src) measures
// weeks-out from local midnight of the current day, so it is independent of the
// time of day the user happens to be looking at the app. Plan generation used to
// compute the same value from `Date.now()`, which subtracts the elapsed part of
// today and can land one week-bucket lower in the afternoon/evening. Near a phase
// boundary that made the GENERATED plan's phase disagree with the weeks-out and
// phase the UI shows the athlete (a DB↔UI desync). This helper mirrors the UI's
// midnight-based math so the two always agree.
//
// `now` is injectable purely for deterministic tests; production passes the default.
export function weeksUntilShow(showDate: string, now: Date = new Date()): number {
  const showNoon = new Date(showDate + 'T12:00:00').getTime()
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  return Math.max(0, Math.floor((showNoon - todayMidnight) / (1000 * 60 * 60 * 24 * 7)))
}
