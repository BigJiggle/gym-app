// Pure resolver for the daily-meals accordion: a meal is expanded when the user
// has explicitly toggled it (override), otherwise only the active/next meal is
// open by default. Extracted so the behavior is unit-testable without rendering
// the full Diet page.
export function isMealExpanded(
  overrides: Record<number, boolean>,
  index: number,
  activeIndex: number | null,
): boolean {
  return overrides[index] ?? index === activeIndex
}
