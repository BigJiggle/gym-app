// Water logging shares the `water_ml_<date>` localStorage key across two screens
// with DIFFERENT representations: the Dashboard widget (`useWaterLog`) stores an
// arbitrary ml amount — its imperial quick-adds persist 237 / 355 / 473 / 946 ml
// (8/12/16/32 oz) — while the Diet page tracks whole 250 ml "glasses".
//
// The Diet tracker used to WRITE `glasses * 250`, which overwrote and quantized
// away any sub-250ml value the Dashboard had logged: an 8 oz (237 ml) entry read
// back as 1 glass and, the moment the user tapped +/- in Diet, was rewritten as a
// 250 multiple — permanently destroying the original amount and desyncing the two
// screens (the Dashboard then showed the coarsened value).
//
// Apply the glass delta as a ±(mlPerGlass) change to the TRUE stored ml instead,
// so the Dashboard's finer-grained value is preserved and a +1/-1 round-trip is
// lossless. Result is clamped to [0, maxGlasses * mlPerGlass]; a non-finite stored
// value (corrupted / hand-edited localStorage) is treated as 0.
export function nextWaterMl(
  storedMl: number,
  deltaGlasses: number,
  mlPerGlass = 250,
  maxGlasses = 20,
): number {
  const base = Number.isFinite(storedMl) ? storedMl : 0
  const next = base + deltaGlasses * mlPerGlass
  return Math.max(0, Math.min(maxGlasses * mlPerGlass, next))
}
