// Food database — single source of truth for all food data used by the nutrition engine.
// Imported by nutritionEngine.ts; no project dependencies.

export type FoodSubstituteTuple = [string, string]
// [food_id_to_check_exclusion, display_string_to_show_in_meal]
// Allows getFood() to check each substitute's ID against active exclusions before picking it.

// ─────────────────────────────────────────────
// EXCLUSION_ALIASES
// Maps generic exclusion keys (used by AI / user / restriction labels) to arrays of specific
// food IDs used in meal templates. Enables "pork" to exclude pork_tenderloin, ham, etc.
// ─────────────────────────────────────────────
export const EXCLUSION_ALIASES: Record<string, string[]> = {
  pork:     ['pork_tenderloin','pork_chop','pork_belly','ham','bacon','sausage','pork','hot_dog'],
  shellfish:['shrimp','crab','lobster','scallops','oysters','mussels','clams','squid','crawfish'],
  shrimp:   ['shrimp'],
  crab:     ['crab'],
  lobster:  ['lobster'],
  scallops: ['scallops'],
  oysters:  ['oysters'],
  mussels:  ['mussels'],
  clams:    ['clams'],
  squid:    ['squid'],
  bacon:    ['bacon','pork_belly'],
  ham:      ['ham'],
  sausage:  ['sausage'],
  beef:     ['lean_beef','ground_beef_lean','beef_steak','sirloin','carne_asada','bulgogi'],
  lamb:     ['lamb_kebab','lamb_chop'],
  fish:     ['salmon','tuna_can','tuna_steak','tilapia','cod','halibut','sardines','mackerel',
             'sea_bass','trout','mahi_mahi','swordfish','herring','anchovies','smoked_salmon'],
  eggs:     ['eggs','egg_whites'],
  chicken:  ['chicken_breast','chicken_thigh','rotisserie_chicken','canned_chicken',
             'chicken_nuggets','chicken_tikka','chicken_tinga','yakitori_chicken'],
  turkey:   ['turkey_breast','lean_ground_turkey','deli_turkey'],
  soy:      ['tofu','tempeh','edamame','soy_protein','soy_milk','miso_paste'],

  // TREE NUTS — peanuts are intentionally excluded here; peanut is a legume with a separate
  // allergy profile. Users can set food_exclusions: ["peanut_butter"] independently.
  nuts: [
    'almonds','walnuts','cashews','macadamia_nuts','hazelnut','pecan',
    'pistachio','brazil_nut','pine_nuts',
    'almond_butter','cashew_butter','hazelnut_butter',
    'almond_milk','cashew_milk','hazelnut_milk',
    'mixed_nuts','trail_mix',
  ],

  // PEANUTS — separate allergy from tree nuts
  peanuts: ['peanut_butter','peanuts_raw','peanuts_roasted','peanut_oil'],

  // SESAME — major allergen previously not covered
  sesame: ['sesame_seeds','sesame_oil','tahini'],

  // COCONUT
  coconut: ['coconut_oil','coconut_cream','coconut_milk','coconut_flakes'],

  dairy: [
    'greek_yogurt','cottage_cheese','milk_skim','whole_milk',
    'mozzarella','cheddar','ricotta','kefir','whey_protein','casein_protein',
    'dahi','labneh','feta','parmesan','butter','ghee',
    'sour_cream','heavy_cream','cream_cheese','swiss_cheese','goat_cheese',
    'halloumi','paneer','cotija_cheese',
  ],
  gluten: [
    'oats','bread_ww','pasta','pita_ww','bulgur_wheat','barley','couscous',
    'ezekiel_bread','rye_bread','sourdough_bread','white_bread','bagel',
    'english_muffin','pita_bread','naan','flour_tortilla','crackers',
    'pretzels','seitan','soba_noodles','pizza_slice_cheese',
    'subway_6in_turkey','hot_dog','breakfast_burrito',
  ],
}

// ─────────────────────────────────────────────
// FOOD_SUBSTITUTES
// Tuple format: [food_id, display_string]
// getFood() iterates in order and returns the first substitute whose food_id is NOT excluded.
// Critical: nut-allergic fallbacks are seeds (never other nuts).
// ─────────────────────────────────────────────
export const FOOD_SUBSTITUTES: Record<string, FoodSubstituteTuple[]> = {
  // POULTRY
  chicken_breast:     [['turkey_breast','Turkey Breast (150g)'],['tilapia','Tilapia Fillet (150g)'],['cod','Cod Fillet (180g)']],
  chicken_thigh:      [['turkey_breast','Turkey Breast (150g)'],['lean_ground_turkey','Ground Turkey (150g)'],['tilapia','Tilapia (150g)']],
  rotisserie_chicken: [['chicken_breast','Chicken Breast (150g)'],['turkey_breast','Turkey Breast (150g)'],['tuna_can','Canned Tuna (140g)']],
  canned_chicken:     [['tuna_can','Canned Tuna (140g)'],['turkey_breast','Turkey Breast (80g)'],['chicken_breast','Chicken Breast (150g)']],
  turkey_breast:      [['chicken_breast','Chicken Breast (150g)'],['tilapia','Tilapia (150g)'],['cod','Cod Fillet (150g)']],
  lean_ground_turkey: [['chicken_breast','Chicken Breast (150g)'],['tilapia','Tilapia (150g)'],['lean_beef','Lean Beef (150g)']],
  deli_turkey:        [['canned_chicken','Canned Chicken (80g)'],['tuna_can','Canned Tuna (80g)'],['cottage_cheese','Cottage Cheese (120g)']],
  duck_breast:        [['chicken_breast','Chicken Breast (150g)'],['turkey_breast','Turkey Breast (150g)']],

  // BEEF / RED MEAT
  lean_beef:          [['lean_ground_turkey','Turkey Mince (150g)'],['bison','Bison (150g)'],['lamb_chop','Lamb Chop (150g)']],
  ground_beef_lean:   [['lean_ground_turkey','Turkey Mince (150g)'],['bison','Bison (150g)'],['chicken_breast','Chicken Breast (150g)']],
  beef_steak:         [['sirloin','Sirloin Steak (180g)'],['bison','Bison (150g)'],['chicken_breast','Chicken Breast (180g)']],
  sirloin:            [['beef_steak','Beef Steak (180g)'],['bison','Bison (150g)'],['turkey_breast','Turkey Breast (150g)']],
  bison:              [['lean_beef','Lean Ground Beef (150g)'],['lean_ground_turkey','Turkey Mince (150g)']],
  venison:            [['lean_beef','Lean Beef (150g)'],['turkey_breast','Turkey Breast (150g)']],
  lamb_chop:          [['lean_beef','Lean Beef (150g)'],['turkey_breast','Turkey Breast (150g)']],
  lamb_kebab:         [['chicken_breast','Chicken Breast (150g)'],['turkey_breast','Turkey Breast (150g)']],

  // PORK
  pork_tenderloin:    [['chicken_breast','Chicken Breast (150g)'],['turkey_breast','Turkey Breast (150g)'],['lean_beef','Lean Beef (150g)']],
  pork_chop:          [['chicken_breast','Chicken Breast (150g)'],['turkey_breast','Turkey Breast (150g)']],
  pork:               [['chicken_breast','Chicken Breast (150g)'],['turkey_breast','Turkey Breast (150g)'],['lean_beef','Lean Beef (150g)']],
  bacon:              [['lean_ground_turkey','Turkey Bacon (50g)'],['smoked_salmon','Smoked Salmon (50g)']],
  ham:                [['turkey_breast','Turkey Breast (80g)'],['canned_chicken','Canned Chicken (80g)']],
  sausage:            [['lean_ground_turkey','Turkey Sausage (100g)'],['chicken_breast','Chicken Breast (100g)']],
  hot_dog:            [['chicken_breast','Chicken Breast (100g)'],['lean_ground_turkey','Ground Turkey (100g)']],

  // FISH
  salmon:             [['tilapia','Tilapia (180g)'],['tuna_steak','Tuna Steak (180g)'],['halibut','Halibut (180g)']],
  tuna_can:           [['chicken_breast','Chicken Breast (150g)'],['turkey_breast','Turkey Breast (150g)'],['cod','Cod (140g)']],
  tuna_steak:         [['salmon','Salmon (180g)'],['halibut','Halibut (180g)'],['mahi_mahi','Mahi Mahi (180g)']],
  tilapia:            [['cod','Cod Fillet (150g)'],['sea_bass','Sea Bass (150g)'],['chicken_breast','Chicken Breast (150g)']],
  cod:                [['tilapia','Tilapia (180g)'],['sea_bass','Sea Bass (180g)'],['chicken_breast','Chicken Breast (150g)']],
  halibut:            [['cod','Cod (180g)'],['tilapia','Tilapia (180g)'],['salmon','Salmon (180g)']],
  mahi_mahi:          [['tilapia','Tilapia (180g)'],['cod','Cod (180g)'],['chicken_breast','Chicken Breast (180g)']],
  swordfish:          [['tuna_steak','Tuna Steak (180g)'],['halibut','Halibut (180g)'],['chicken_breast','Chicken Breast (180g)']],
  sardines:           [['tuna_can','Canned Tuna (90g)'],['mackerel','Mackerel (90g)'],['herring','Herring (90g)']],
  mackerel:           [['sardines','Sardines (150g)'],['salmon','Salmon (150g)'],['trout','Trout (150g)']],
  herring:            [['sardines','Sardines (90g)'],['mackerel','Mackerel (90g)']],
  anchovies:          [['sardines','Sardines (40g)'],['smoked_salmon','Smoked Salmon (40g)']],
  smoked_salmon:      [['salmon','Salmon Fillet (100g)'],['tuna_can','Canned Tuna (80g)']],
  sea_bass:           [['tilapia','Tilapia (150g)'],['cod','Cod (150g)']],
  trout:              [['salmon','Salmon (150g)'],['tilapia','Tilapia (150g)']],

  // SHELLFISH
  shrimp:             [['tilapia','Tilapia (150g)'],['cod','Cod Fillet (150g)'],['chicken_breast','Chicken Breast (120g)']],
  crab:               [['tilapia','Tilapia (150g)'],['tuna_can','Canned Tuna (140g)'],['chicken_breast','Chicken Breast (150g)']],
  lobster:            [['cod','Cod Fillet (150g)'],['tilapia','Tilapia (150g)'],['salmon','Salmon (150g)']],
  scallops:           [['tilapia','Tilapia (150g)'],['cod','Cod (150g)']],
  oysters:            [['tuna_can','Canned Tuna (100g)'],['cod','Cod (100g)']],
  mussels:            [['tilapia','Tilapia (150g)'],['cod','Cod (150g)']],
  clams:              [['tuna_can','Canned Tuna (150g)'],['tilapia','Tilapia (150g)']],
  squid:              [['tilapia','Tilapia (150g)'],['chicken_breast','Chicken Breast (150g)']],

  // EGGS
  eggs:               [['egg_whites','Egg Whites x6'],['tofu','Tofu Scramble (200g)'],['greek_yogurt','Greek Yogurt (200g)']],
  egg_whites:         [['pea_protein','Pea Protein Shake (35g)'],['tofu','Silken Tofu (150g)']],

  // PLANT PROTEIN
  tofu:               [['tempeh','Tempeh (150g)'],['edamame','Edamame (150g)'],['chickpeas','Chickpeas (150g)']],
  tempeh:             [['tofu','Tofu (200g)'],['black_beans','Black Beans (200g)'],['lentils','Lentils (200g)']],
  edamame:            [['tofu','Tofu (150g)'],['chickpeas','Chickpeas (150g)']],
  seitan:             [['tofu','Firm Tofu (200g)'],['tempeh','Tempeh (150g)'],['chickpeas','Chickpeas (200g)']],
  beyond_burger:      [['lean_ground_turkey','Ground Turkey Patty (113g)'],['tofu','Tofu Patty (150g)'],['black_beans','Black Bean Burger (150g)']],
  lentils:            [['chickpeas','Chickpeas (200g)'],['black_beans','Black Beans (200g)'],['tofu','Tofu (200g)']],
  black_beans:        [['chickpeas','Chickpeas (200g)'],['lentils','Lentils (200g)'],['pinto_beans','Pinto Beans (200g)']],
  chickpeas:          [['black_beans','Black Beans (200g)'],['lentils','Lentils (200g)']],
  navy_beans:         [['black_beans','Black Beans (200g)'],['lentils','Lentils (200g)']],
  kidney_beans:       [['black_beans','Black Beans (200g)'],['chickpeas','Chickpeas (200g)']],
  nutritional_yeast:  [['parmesan','Parmesan (20g)'],['cheddar','Cheddar (20g)']],

  // DAIRY PROTEIN
  greek_yogurt:       [['cottage_cheese','Cottage Cheese (200g)'],['soy_milk','Soy Yogurt (200g)'],['kefir','Kefir (200g)']],
  cottage_cheese:     [['greek_yogurt','Greek Yogurt (200g)'],['ricotta','Ricotta (125g)']],
  kefir:              [['greek_yogurt','Greek Yogurt (200g)'],['soy_milk','Soy Milk (250ml)']],

  // SUPPLEMENTS
  whey_protein:       [['pea_protein','Pea Protein Shake (35g)'],['egg_whites','Egg Whites x4'],['casein_protein','Casein Protein (35g)']],
  casein_protein:     [['whey_protein','Whey Protein (35g)'],['greek_yogurt','Greek Yogurt (200g)']],
  pea_protein:        [['soy_protein','Soy Protein (35g)'],['hemp_seeds','Hemp Seeds (30g)']],
  soy_protein:        [['pea_protein','Pea Protein Shake (35g)']],
  quest_bar:          [['protein_bar_generic','Protein Bar (65g)'],['greek_yogurt','Greek Yogurt (200g)']],
  protein_bar_generic:[['quest_bar','Quest Bar (60g)'],['greek_yogurt','Greek Yogurt (200g)'],['cottage_cheese','Cottage Cheese (150g)']],

  // FAST FOOD / PROCESSED
  chipotle_chicken_bowl:              [['chicken_breast','Chicken Breast (150g) + Brown Rice (200g)'],['lean_beef','Lean Beef (150g) + Rice (200g)']],
  subway_6in_turkey:                  [['deli_turkey','Deli Turkey (80g) + WW Bread (60g)'],['turkey_breast','Turkey Breast (150g)']],
  mcdonalds_grilled_chicken_sandwich: [['chicken_breast','Grilled Chicken Breast (150g) + Bread WW (60g)'],['tuna_can','Tuna Sandwich (140g)']],
  chicken_nuggets:                    [['chicken_breast','Chicken Breast (100g) baked'],['lean_ground_turkey','Turkey Meatballs (100g)']],
  breakfast_burrito:                  [['eggs','Scrambled Eggs x3 + Sweet Potato (100g)'],['egg_whites','Egg Whites x4 + Rice Cakes (30g)']],
  pizza_slice_cheese:                 [['rice_cakes','Rice Cakes x3 + Mozzarella (40g)'],['bread_ww','WW Bread (60g) + Mozzarella (40g)']],
  protein_chips:                      [['rice_cakes','Rice Cakes x3 (30g)'],['popcorn','Air-Popped Popcorn (28g)']],

  // GRAINS
  oats:               [['cream_of_rice','Cream of Rice (50g dry)'],['brown_rice','Brown Rice (200g cooked)'],['quinoa','Quinoa (185g cooked)']],
  white_rice:         [['sweet_potato','Sweet Potato (200g)'],['quinoa','Quinoa (185g cooked)'],['brown_rice','Brown Rice (200g cooked)']],
  brown_rice:         [['white_rice','White Rice (200g cooked)'],['quinoa','Quinoa (185g cooked)'],['wild_rice','Wild Rice (185g cooked)']],
  wild_rice:          [['brown_rice','Brown Rice (185g cooked)'],['quinoa','Quinoa (185g cooked)']],
  millet:             [['brown_rice','Brown Rice (200g cooked)'],['quinoa','Quinoa (185g cooked)']],
  buckwheat:          [['quinoa','Quinoa (185g cooked)'],['brown_rice','Brown Rice (200g cooked)']],
  quinoa:             [['brown_rice','Brown Rice (185g cooked)'],['millet','Millet (200g cooked)'],['wild_rice','Wild Rice (185g cooked)']],
  sweet_potato:       [['white_potato','White Potato (200g)'],['brown_rice','Brown Rice (200g cooked)']],
  white_potato:       [['sweet_potato','Sweet Potato (200g)'],['brown_rice','Brown Rice (200g cooked)']],
  cream_of_rice:      [['oats','Oats (80g dry)'],['rice_cakes','Rice Cakes (30g)']],
  rice_cakes:         [['oats','Oats (80g dry)'],['cream_of_rice','Cream of Rice (50g dry)']],
  pasta:              [['rice_cakes','Rice Pasta (200g)'],['zucchini','Zucchini Noodles (300g)'],['brown_rice','Brown Rice (200g)']],
  couscous:           [['quinoa','Quinoa (185g)'],['brown_rice','Brown Rice (200g)'],['millet','Millet (200g)']],
  barley:             [['brown_rice','Brown Rice (200g cooked)'],['quinoa','Quinoa (185g cooked)'],['millet','Millet (200g cooked)']],
  bulgur_wheat:       [['quinoa','Quinoa (185g cooked)'],['brown_rice','Brown Rice (200g cooked)']],

  // BREAD PRODUCTS
  bread_ww:           [['rice_cakes','Rice Cakes x3'],['ezekiel_bread','Ezekiel Bread (60g)'],['sourdough_bread','Sourdough (60g)']],
  ezekiel_bread:      [['bread_ww','WW Bread (60g)'],['rice_cakes','Rice Cakes x3']],
  rye_bread:          [['sourdough_bread','Sourdough Bread (60g)'],['bread_ww','WW Bread (60g)'],['rice_cakes','Rice Cakes x3']],
  sourdough_bread:    [['bread_ww','WW Bread (60g)'],['rye_bread','Rye Bread (60g)'],['rice_cakes','Rice Cakes x3']],
  white_bread:        [['bread_ww','WW Bread (60g)'],['sourdough_bread','Sourdough (60g)'],['rice_cakes','Rice Cakes x3']],
  bagel:              [['english_muffin','English Muffin (57g)'],['bread_ww','WW Bread (60g)'],['cream_of_rice','Cream of Rice (50g dry)']],
  english_muffin:     [['bagel','Plain Bagel (105g)'],['bread_ww','WW Bread (60g)']],
  pita_bread:         [['bread_ww','WW Bread (60g)'],['rice_cakes','Rice Cakes x3']],
  naan:               [['bread_ww','WW Bread (60g)'],['pita_bread','Pita Bread (60g)']],
  flour_tortilla:     [['corn_tortilla','Corn Tortilla x2 (50g)'],['rice_cakes','Rice Cakes x3']],
  crackers:           [['rice_cakes','Rice Cakes x3'],['popcorn','Popcorn (28g)']],
  pretzels:           [['rice_cakes','Rice Cakes x3 (30g)'],['popcorn','Popcorn (28g)'],['protein_chips','Protein Chips (32g)']],
  popcorn:            [['rice_cakes','Rice Cakes x3 (30g)'],['crackers','Crackers (30g)']],
  granola:            [['oats','Oats (60g dry)'],['cream_of_rice','Cream of Rice (50g dry)']],
  pinto_beans:        [['black_beans','Black Beans (200g)'],['lentils','Lentils (200g)']],

  // FRUIT
  banana:             [['apple','Apple'],['orange','Orange'],['pineapple','Pineapple (165g)']],
  apple:              [['pear','Pear'],['orange','Orange'],['berries','Berries (150g)']],
  pear:               [['apple','Apple'],['orange','Orange']],
  orange:             [['apple','Apple'],['mango','Mango (165g)'],['grapes','Grapes (150g)']],
  berries:            [['blueberries','Blueberries (150g)'],['strawberries','Strawberries (150g)'],['raspberries','Raspberries (125g)']],
  blueberries:        [['strawberries','Strawberries (150g)'],['raspberries','Raspberries (125g)'],['blackberries','Blackberries (125g)']],
  strawberries:       [['blueberries','Blueberries (150g)'],['raspberries','Raspberries (125g)']],
  raspberries:        [['strawberries','Strawberries (150g)'],['blackberries','Blackberries (125g)']],
  blackberries:       [['raspberries','Raspberries (125g)'],['blueberries','Blueberries (150g)']],
  mango:              [['pineapple','Pineapple (165g)'],['banana','Banana'],['berries','Berries (150g)']],
  pineapple:          [['mango','Mango (165g)'],['orange','Orange'],['berries','Berries (150g)']],
  grapes:             [['berries','Berries (150g)'],['apple','Apple']],
  watermelon:         [['berries','Berries (150g)'],['orange','Orange']],
  kiwi:               [['orange','Orange'],['berries','Berries (150g)']],
  peach:              [['apple','Apple'],['pear','Pear']],
  cherries:           [['berries','Berries (150g)'],['grapes','Grapes (150g)']],
  dates:              [['raisins','Raisins (40g)'],['banana','Banana (half)']],
  raisins:            [['dates','Dates x2 (48g)'],['banana','Banana (half)']],

  // TREE NUTS — substitutes are SEEDS (safe when 'nuts' is in exclusions)
  almonds:            [['pumpkin_seeds','Pumpkin Seeds (30g)'],['sunflower_seeds','Sunflower Seeds (30g)'],['chia_seeds','Chia Seeds (30g)']],
  walnuts:            [['pumpkin_seeds','Pumpkin Seeds (30g)'],['hemp_seeds','Hemp Seeds (30g)'],['flaxseed','Flaxseed (15g)']],
  cashews:            [['sunflower_seeds','Sunflower Seeds (30g)'],['pumpkin_seeds','Pumpkin Seeds (30g)']],
  macadamia_nuts:     [['pumpkin_seeds','Pumpkin Seeds (30g)'],['sunflower_seeds','Sunflower Seeds (30g)']],
  hazelnut:           [['pumpkin_seeds','Pumpkin Seeds (30g)'],['chia_seeds','Chia Seeds (30g)']],
  pecan:              [['pumpkin_seeds','Pumpkin Seeds (30g)'],['sunflower_seeds','Sunflower Seeds (30g)']],
  pistachio:          [['pumpkin_seeds','Pumpkin Seeds (30g)'],['sunflower_seeds','Sunflower Seeds (30g)']],
  brazil_nut:         [['pumpkin_seeds','Pumpkin Seeds (30g)'],['chia_seeds','Chia Seeds (30g)']],
  pine_nuts:          [['pumpkin_seeds','Pumpkin Seeds (30g)'],['hemp_seeds','Hemp Seeds (30g)']],

  // NUT BUTTERS — fall back to seed butters (safe for nut AND peanut allergy)
  peanut_butter:      [['sunflower_seed_butter','Sunflower Seed Butter (32g)'],['tahini','Tahini (30g)'],['olive_oil','Olive Oil (15g)']],
  almond_butter:      [['sunflower_seed_butter','Sunflower Seed Butter (32g)'],['tahini','Tahini (30g)'],['pumpkin_seeds','Pumpkin Seeds (30g)']],
  cashew_butter:      [['sunflower_seed_butter','Sunflower Seed Butter (32g)'],['tahini','Tahini (30g)']],
  hazelnut_butter:    [['sunflower_seed_butter','Sunflower Seed Butter (32g)'],['tahini','Tahini (30g)']],

  // SEEDS
  chia_seeds:         [['flaxseed','Flaxseed (15g)'],['hemp_seeds','Hemp Seeds (30g)']],
  flaxseed:           [['chia_seeds','Chia Seeds (30g)'],['hemp_seeds','Hemp Seeds (30g)']],
  hemp_seeds:         [['chia_seeds','Chia Seeds (30g)'],['flaxseed','Flaxseed (15g)']],
  pumpkin_seeds:      [['sunflower_seeds','Sunflower Seeds (30g)'],['hemp_seeds','Hemp Seeds (30g)']],
  sunflower_seeds:    [['pumpkin_seeds','Pumpkin Seeds (30g)'],['hemp_seeds','Hemp Seeds (30g)']],
  sesame_seeds:       [['pumpkin_seeds','Pumpkin Seeds (15g)'],['hemp_seeds','Hemp Seeds (15g)']],
  sunflower_seed_butter:[['tahini','Tahini (30g)'],['olive_oil','Olive Oil (14g)']],
  tahini:             [['sunflower_seed_butter','Sunflower Seed Butter (30g)'],['olive_oil','Olive Oil (15g)']],

  // OILS & DAIRY FATS
  olive_oil:          [['avocado_oil','Avocado Oil (14g)'],['coconut_oil','Coconut Oil (14g)']],
  coconut_oil:        [['olive_oil','Olive Oil (14g)'],['avocado_oil','Avocado Oil (14g)']],
  avocado_oil:        [['olive_oil','Olive Oil (14g)'],['coconut_oil','Coconut Oil (14g)']],
  butter:             [['ghee','Ghee (10g)'],['olive_oil','Olive Oil (10g)']],
  ghee:               [['butter','Butter (14g)'],['olive_oil','Olive Oil (10g)'],['coconut_oil','Coconut Oil (10g)']],
  sour_cream:         [['greek_yogurt','Greek Yogurt (60g)'],['cottage_cheese','Cottage Cheese (60g)']],
  heavy_cream:        [['coconut_cream','Coconut Cream (30ml)'],['oat_milk','Oat Milk (50ml)']],
  coconut_cream:      [['heavy_cream','Heavy Cream (30ml)'],['oat_milk','Oat Milk (50ml)']],
  cream_cheese:       [['greek_yogurt','Greek Yogurt (60g)'],['cottage_cheese','Cottage Cheese (60g)']],
  avocado:            [['olive_oil','Olive Oil (1 tbsp)'],['pumpkin_seeds','Pumpkin Seeds (30g)'],['tahini','Tahini (30g)']],
  dark_chocolate:     [['berries','Berries (100g)'],['chia_seeds','Chia Seeds (30g)']],

  // CHEESE
  mozzarella:         [['cottage_cheese','Cottage Cheese (60g)'],['ricotta','Ricotta (60g)'],['nutritional_yeast','Nutritional Yeast (20g)']],
  cheddar:            [['nutritional_yeast','Nutritional Yeast (20g)'],['parmesan','Parmesan (30g)'],['goat_cheese','Goat Cheese (40g)']],
  ricotta:            [['cottage_cheese','Cottage Cheese (125g)'],['greek_yogurt','Greek Yogurt (125g)']],
  parmesan:           [['nutritional_yeast','Nutritional Yeast (20g)'],['cheddar','Cheddar (30g)']],
  feta:               [['goat_cheese','Goat Cheese (40g)'],['cottage_cheese','Cottage Cheese (60g)']],
  swiss_cheese:       [['cheddar','Cheddar (40g)'],['mozzarella','Mozzarella (60g)']],
  goat_cheese:        [['feta','Feta (50g)'],['cottage_cheese','Cottage Cheese (60g)']],

  // MILKS
  whole_milk:         [['soy_milk','Soy Milk (250ml)'],['oat_milk','Oat Milk (250ml)'],['almond_milk','Almond Milk (250ml)']],
  milk_skim:          [['soy_milk','Soy Milk (250ml)'],['oat_milk','Oat Milk (250ml)'],['almond_milk','Almond Milk (250ml)']],
  soy_milk:           [['oat_milk','Oat Milk (250ml)'],['almond_milk','Almond Milk (250ml)']],
  almond_milk:        [['oat_milk','Oat Milk (250ml)'],['soy_milk','Soy Milk (250ml)']],
  oat_milk:           [['soy_milk','Soy Milk (250ml)'],['almond_milk','Almond Milk (250ml)']],

  // VEGETABLES
  broccoli:           [['asparagus','Asparagus (150g)'],['green_beans','Green Beans (150g)'],['zucchini','Zucchini (150g)']],
  spinach:            [['kale','Kale (100g)'],['romaine','Romaine Lettuce (100g)'],['bok_choy','Bok Choy (150g)']],
  kale:               [['spinach','Spinach (100g)'],['romaine','Romaine Lettuce (100g)'],['arugula','Arugula (80g)']],
  asparagus:          [['broccoli','Broccoli (200g)'],['green_beans','Green Beans (150g)']],
  green_beans:        [['broccoli','Broccoli (200g)'],['asparagus','Asparagus (150g)']],
  zucchini:           [['cucumber','Cucumber (150g)'],['bell_pepper','Bell Pepper (150g)']],
  bell_pepper:        [['zucchini','Zucchini (150g)'],['tomato','Tomato (150g)']],
  mushrooms:          [['zucchini','Zucchini (150g)'],['bell_pepper','Bell Pepper (150g)']],
  cauliflower:        [['broccoli','Broccoli (200g)'],['zucchini','Zucchini (150g)']],
  mixed_veg:          [['broccoli','Broccoli (200g)'],['green_beans','Green Beans (150g)']],
  cucumber:           [['zucchini','Zucchini (150g)'],['bell_pepper','Bell Pepper (150g)']],
  tomato:             [['bell_pepper','Bell Pepper (150g)'],['zucchini','Zucchini (150g)']],
  carrots:            [['bell_pepper','Bell Pepper (150g)'],['broccoli','Broccoli (150g)']],
  romaine:            [['spinach','Spinach (100g)'],['kale','Kale (100g)'],['arugula','Arugula (80g)']],
  arugula:            [['spinach','Spinach (80g)'],['romaine','Romaine (100g)']],
  beet:               [['carrots','Carrots (150g)'],['sweet_potato','Sweet Potato (100g)']],
  brussels_sprouts:   [['broccoli','Broccoli (150g)'],['cauliflower','Cauliflower (150g)']],
  bok_choy:           [['spinach','Spinach (150g)'],['kale','Kale (100g)']],
  olives:             [['avocado','Avocado (50g)'],['olive_oil','Olive Oil (14g)']],
  sauerkraut:         [['kimchi','Kimchi (100g)'],['mixed_veg','Mixed Veg (100g)']],
  kimchi:             [['sauerkraut','Sauerkraut (100g)'],['mixed_veg','Mixed Veg (100g)']],
  onion:              [['bell_pepper','Bell Pepper (100g)'],['tomato','Tomato (100g)']],
}

// ─────────────────────────────────────────────
// FOOD_CATEGORY
// Maps food IDs → macro category for preference-swapping in getFood().
// ─────────────────────────────────────────────
export const FOOD_CATEGORY: Record<string, 'protein' | 'carb' | 'fat' | 'veg'> = {
  // PROTEINS: poultry
  chicken_breast:'protein', chicken_thigh:'protein', rotisserie_chicken:'protein',
  canned_chicken:'protein', turkey_breast:'protein', lean_ground_turkey:'protein',
  deli_turkey:'protein', duck_breast:'protein',
  // PROTEINS: beef/red meat
  lean_beef:'protein', ground_beef_lean:'protein', beef_steak:'protein', sirloin:'protein',
  bison:'protein', venison:'protein', lamb_chop:'protein', lamb_kebab:'protein',
  // PROTEINS: pork
  pork_tenderloin:'protein', pork_chop:'protein', pork:'protein',
  bacon:'protein', ham:'protein', sausage:'protein', hot_dog:'protein',
  // PROTEINS: fish
  salmon:'protein', tuna_can:'protein', tuna_steak:'protein', tilapia:'protein',
  cod:'protein', halibut:'protein', sea_bass:'protein', mackerel:'protein',
  trout:'protein', sardines:'protein', mahi_mahi:'protein', swordfish:'protein',
  herring:'protein', anchovies:'protein', smoked_salmon:'protein',
  // PROTEINS: shellfish
  shrimp:'protein', crab:'protein', lobster:'protein', scallops:'protein',
  oysters:'protein', mussels:'protein', clams:'protein', squid:'protein',
  // PROTEINS: eggs
  eggs:'protein', egg_whites:'protein',
  // PROTEINS: dairy-protein
  greek_yogurt:'protein', cottage_cheese:'protein', dahi:'protein', kefir:'protein',
  // PROTEINS: supplements
  whey_protein:'protein', casein_protein:'protein', pea_protein:'protein', soy_protein:'protein',
  // PROTEINS: plant
  tofu:'protein', tempeh:'protein', edamame:'protein', seitan:'protein',
  beyond_burger:'protein', lentils:'protein', black_beans:'protein', chickpeas:'protein',
  navy_beans:'protein', kidney_beans:'protein', nutritional_yeast:'protein',
  // PROTEINS: packaged / fast food
  quest_bar:'protein', protein_bar_generic:'protein',
  chipotle_chicken_bowl:'protein', subway_6in_turkey:'protein',
  mcdonalds_grilled_chicken_sandwich:'protein', chicken_nuggets:'protein',
  breakfast_burrito:'protein',

  // CARBS: grains
  white_rice:'carb', brown_rice:'carb', oats:'carb', wild_rice:'carb',
  millet:'carb', buckwheat:'carb', quinoa:'carb', sweet_potato:'carb',
  white_potato:'carb', pasta:'carb', bread_ww:'carb', cream_of_rice:'carb',
  rice_cakes:'carb', couscous:'carb', barley:'carb', bulgur_wheat:'carb',
  ezekiel_bread:'carb', rye_bread:'carb', sourdough_bread:'carb',
  white_bread:'carb', bagel:'carb', english_muffin:'carb', pita_bread:'carb',
  naan:'carb', flour_tortilla:'carb', corn_tortilla:'carb',
  crackers:'carb', pretzels:'carb', popcorn:'carb', granola:'carb',
  // CARBS: legumes-as-carb
  pinto_beans:'carb',
  // CARBS: fruit
  banana:'carb', apple:'carb', orange:'carb', berries:'carb', blueberries:'carb',
  strawberries:'carb', mango:'carb', pineapple:'carb', grapes:'carb',
  watermelon:'carb', kiwi:'carb', peach:'carb', cherries:'carb',
  raspberries:'carb', blackberries:'carb', pear:'carb', dates:'carb', raisins:'carb',
  // CARBS: processed
  pizza_slice_cheese:'carb', protein_chips:'carb',

  // FATS: whole tree nuts
  almonds:'fat', walnuts:'fat', cashews:'fat', macadamia_nuts:'fat',
  hazelnut:'fat', pecan:'fat', pistachio:'fat', brazil_nut:'fat', pine_nuts:'fat',
  // FATS: nut & seed butters
  peanut_butter:'fat', almond_butter:'fat', cashew_butter:'fat', hazelnut_butter:'fat',
  sunflower_seed_butter:'fat', tahini:'fat',
  // FATS: seeds
  pumpkin_seeds:'fat', sunflower_seeds:'fat', sesame_seeds:'fat',
  chia_seeds:'fat', flaxseed:'fat', hemp_seeds:'fat',
  // FATS: oils
  olive_oil:'fat', coconut_oil:'fat', avocado_oil:'fat',
  // FATS: dairy fats & cheese
  butter:'fat', ghee:'fat', sour_cream:'fat', heavy_cream:'fat', coconut_cream:'fat',
  mozzarella:'fat', cheddar:'fat', ricotta:'fat', parmesan:'fat',
  feta:'fat', cream_cheese:'fat', swiss_cheese:'fat', goat_cheese:'fat',
  whole_milk:'fat',
  // FATS: misc
  avocado:'fat', dark_chocolate:'fat',

  // VEGETABLES
  broccoli:'veg', spinach:'veg', kale:'veg', asparagus:'veg',
  green_beans:'veg', zucchini:'veg', bell_pepper:'veg', mushrooms:'veg',
  cauliflower:'veg', mixed_veg:'veg', cucumber:'veg',
  tomato:'veg', onion:'veg', carrots:'veg', romaine:'veg', arugula:'veg',
  beet:'veg', brussels_sprouts:'veg', bok_choy:'veg',
  olives:'veg', sauerkraut:'veg', kimchi:'veg',
}

// ─────────────────────────────────────────────
// FOOD_DISPLAY
// Canonical display strings with correct portion sizes.
// Used by getFood() when swapping to a preferred food, and for processed foods
// where auto-generated portions (e.g. "Quest Bar (150g)") would be wrong.
// ─────────────────────────────────────────────
export const FOOD_DISPLAY: Record<string, string> = {
  // Processed / fast food — portions differ from auto-generated labels
  quest_bar:                          'Quest Bar (60g)',
  protein_bar_generic:                'Protein Bar (65g)',
  protein_chips:                      'Protein Chips (32g bag)',
  dark_chocolate:                     'Dark Chocolate 85%+ (30g)',
  pizza_slice_cheese:                 'Cheese Pizza Slice (107g)',
  chipotle_chicken_bowl:              'Chipotle Chicken Bowl (490g)',
  subway_6in_turkey:                  'Subway 6-inch Turkey (220g)',
  mcdonalds_grilled_chicken_sandwich: "McDonald's Grilled Chicken Sandwich (180g)",
  chicken_nuggets:                    'Chicken Nuggets x6 (100g)',
  hot_dog:                            'Hot Dog with Bun (120g)',
  breakfast_burrito:                  'Breakfast Burrito (280g)',
  granola:                            'Granola (60g)',
  dates:                              'Medjool Dates x2 (48g)',
  raisins:                            'Raisins (40g)',
  bagel:                              'Plain Bagel (105g)',
  english_muffin:                     'English Muffin (57g)',
  naan:                               'Naan Bread (90g)',
  flour_tortilla:                     'Flour Tortilla (45g)',
  crackers:                           'Whole Grain Crackers (30g)',
  pretzels:                           'Pretzels (30g)',
  popcorn:                            'Popcorn (28g)',
  // Dairy fats
  butter:                             'Butter (14g)',
  ghee:                               'Ghee (10g)',
  sour_cream:                         'Sour Cream (30g)',
  heavy_cream:                        'Heavy Cream (30ml)',
  coconut_cream:                      'Coconut Cream (30ml)',
  // Cheese
  parmesan:                           'Parmesan (20g)',
  feta:                               'Feta Cheese (50g)',
  cream_cheese:                       'Cream Cheese (30g)',
  swiss_cheese:                       'Swiss Cheese (40g)',
  goat_cheese:                        'Goat Cheese (40g)',
  // Oils
  avocado_oil:                        'Avocado Oil (14g)',
  // Seeds / seed butters
  sesame_seeds:                       'Sesame Seeds (15g)',
  sunflower_seed_butter:              'Sunflower Seed Butter (32g)',
  cashew_butter:                      'Cashew Butter (32g)',
  hazelnut_butter:                    'Hazelnut Butter (32g)',
  // Fish
  smoked_salmon:                      'Smoked Salmon (80g)',
  anchovies:                          'Anchovies (40g)',
  // Plant proteins
  seitan:                             'Seitan (150g)',
  beyond_burger:                      'Beyond Burger Patty (113g)',
  nutritional_yeast:                  'Nutritional Yeast (15g)',
  // Poultry variants
  rotisserie_chicken:                 'Rotisserie Chicken (150g)',
  canned_chicken:                     'Canned Chicken (140g)',
  deli_turkey:                        'Deli Turkey Slices (80g)',
  chicken_thigh:                      'Chicken Thigh (180g)',
  // Beef
  sirloin:                            'Sirloin Steak (180g)',
  beef_steak:                         'Beef Steak (180g)',
  ground_beef_lean:                   'Lean Ground Beef (150g)',
  // Fish
  mahi_mahi:                          'Mahi Mahi Fillet (180g)',
  swordfish:                          'Swordfish Steak (180g)',
  herring:                            'Herring (90g)',
  // Grains
  wild_rice:                          'Wild Rice (185g cooked)',
  buckwheat:                          'Buckwheat (185g cooked)',
  millet:                             'Millet (200g cooked)',
  rye_bread:                          'Rye Bread (60g / 2 slices)',
  sourdough_bread:                    'Sourdough Bread (60g / 2 slices)',
  white_bread:                        'White Bread (60g / 2 slices)',
  pita_bread:                         'Pita Bread (60g)',
  // Fruit
  watermelon:                         'Watermelon (300g)',
  kiwi:                               'Kiwi x2 (150g)',
  peach:                              'Peach (150g)',
  cherries:                           'Cherries (150g)',
  raspberries:                        'Raspberries (125g)',
  blackberries:                       'Blackberries (125g)',
  pear:                               'Pear (178g)',
  grapes:                             'Red Grapes (150g)',
  // Vegetables
  tomato:                             'Tomato (150g)',
  onion:                              'Onion (100g)',
  carrots:                            'Carrots (150g)',
  romaine:                            'Romaine Lettuce (100g)',
  arugula:                            'Arugula (80g)',
  beet:                               'Roasted Beet (150g)',
  brussels_sprouts:                   'Brussels Sprouts (150g)',
  bok_choy:                           'Bok Choy (150g)',
  olives:                             'Olives (30g)',
  sauerkraut:                         'Sauerkraut (100g)',
  kimchi:                             'Kimchi (100g)',
  // New tree nuts
  hazelnut:                           'Hazelnuts (30g)',
  pecan:                              'Pecans (30g)',
  pistachio:                          'Pistachios (30g)',
  brazil_nut:                         'Brazil Nuts (30g)',
  pine_nuts:                          'Pine Nuts (30g)',
  // Legumes
  navy_beans:                         'Navy Beans (200g cooked)',
  kidney_beans:                       'Kidney Beans (200g cooked)',
}

// ─────────────────────────────────────────────
// SNACK_ONLY_FOODS
// Foods appropriate for snacks, breakfast, or pre/post-workout light meals,
// but NOT suitable as the primary protein or carb in main meals (Lunch, Dinner).
//
// Used by getFood() to prevent preference-substitution from placing snack foods
// into dinner/lunch templates. E.g. a user who prefers greek_yogurt should get
// it in snack slots but NOT as a replacement for salmon in dinner.
// ─────────────────────────────────────────────
export const SNACK_ONLY_FOODS: ReadonlySet<string> = new Set([
  // Snack proteins — great for snacks/breakfast, wrong as dinner protein anchors
  'greek_yogurt',
  'cottage_cheese',
  'kefir',
  'whey_protein',
  'casein_protein',
  'pea_protein',
  'soy_protein',
  'labneh',
  'dahi',
  // Snack carbs — great for snacks/pre-workout, wrong as dinner/lunch carb anchors
  'apple',
  'banana',
  'berries',
  'orange',
  'rice_cakes',
  'crackers',
  'pretzels',
])
