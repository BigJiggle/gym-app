// Normalizes a meal-plan food DISPLAY label (e.g. "Rice Cakes x3",
// "White Rice (150g cooked)") into the canonical food ID the exclusion engine
// uses (isExcluded in nutritionEngine, which compares against lowercase
// underscore IDs like "rice_cakes" / "white_rice").
//
// Both the portion suffix "(…)" AND the fixed-count token "xN" must be stripped
// BEFORE slug-casing. Dropping only the parentheses — as the Diet page's
// exclude-by-✕ path previously did — turns a fixed-label food such as
// "Rice Cakes x3" into "rice_cakes_x3", which matches no food ID, so the
// advertised "exclude this food from future plans" action silently did nothing
// and the food kept reappearing after every plan regeneration. Mirrors the
// baseName derivation in GroceryList.buildGroceryItems so the two agree.
export function foodLabelToExclusionId(label: string): string {
  return label
    .replace(/\s*\(.*?\)/g, '') // remove "(portions)" first
    .replace(/\s*x\d+/g, '')    // then the fixed-count token "xN" (e.g. " x3")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .trim()
}
