import { FOODS } from '../data/foods'

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
function slugify(label: string): string {
  return label
    .replace(/\s*\(.*?\)/g, '') // remove "(portions)" first
    .replace(/\s*x\d+/g, '')    // then the fixed-count token "xN" (e.g. " x3")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .trim()
}

// Canonical display-name slug → food ID, built from the food picker's own list
// (FOODS — the single source of truth for the exclusion IDs the engine matches).
// Many meal-plan foods render under a display name that does NOT slug to their
// id: "Salmon Fillet"→salmon, "Whole Eggs"→eggs, "Mixed Berries"→berries,
// "Lean Ground Beef (90%)"→lean_beef. Slugging the label alone produced
// "salmon_fillet" / "whole_eggs" / "mixed_berries" — none of which equal the id
// or any EXCLUSION_ALIASES key — so tapping ✕ on those foods silently failed and
// they kept reappearing after regeneration. Resolving the slug back through the
// picker's name→id map fixes every food the picker knows; a display name the
// picker doesn't carry (culture dishes / branded shakes) keeps its slug, exactly
// as before (no regression).
const DISPLAY_SLUG_TO_ID = new Map<string, string>(
  FOODS.map((f) => [slugify(f.name), f.id] as const),
)

export function foodLabelToExclusionId(label: string): string {
  const slug = slugify(label)
  return DISPLAY_SLUG_TO_ID.get(slug) ?? slug
}
