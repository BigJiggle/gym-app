export interface WeekGuidance {
  phase: string
  phaseColor: 'green' | 'brand' | 'blue' | 'yellow' | 'orange' | 'red'
  training: string[]
  nutrition: string[]
  cardio: string
  focus: string
  milestones: string[]
}

export function getWeekGuidance(weeksOut: number): WeekGuidance {
  if (weeksOut === 0) return {
    phase: 'Peak Week',
    phaseColor: 'red',
    training: ['Depletion workout on Day 7 (Mon)', 'Light pump sessions only mid-week', 'No new exercises or heavy maxes'],
    nutrition: ['Begin carb loading Day 5 (Wed)', 'Adjust water + sodium per peak week protocol', 'Weigh all food precisely — zero guessing'],
    cardio: 'Minimal — 20 min light walking only',
    focus: 'Execute the peak week protocol you have practiced. Rest. Trust the process.',
    milestones: ['Final spray tan session booked', 'Stage makeup trial done', 'Suit/trunks checked and packed', 'Athlete check-in time confirmed'],
  }
  if (weeksOut === 1) return {
    phase: 'Final Push',
    phaseColor: 'red',
    training: ['Low volume pump-focused sessions', 'No new heavy compound maxes', 'Posing practice every day'],
    nutrition: ['Precision dieting — weigh all food', 'Keep sodium stable — no cutting yet', 'Protein minimum 2.5g/kg bodyweight'],
    cardio: '45 min LISS daily',
    focus: 'This week sets up peak week. Arrive at peak week looking your best so far.',
    milestones: ['Practice mock carb load', 'Tan color check (test session)', 'Music or routine finalized', 'Logistics confirmed: hotel, travel, parking'],
  }
  if (weeksOut <= 3) return {
    phase: 'Peak Phase',
    phaseColor: 'orange',
    training: ['Lower volume, maintain intensity', 'Compound lifts reduced to 70–80% of normal sets', 'Posing incorporated into every session (15+ min)'],
    nutrition: ['Tight deficit — 400–600 kcal below TDEE', 'Carb cycling: higher on training days', 'Cut all processed foods and restaurant meals'],
    cardio: '45–60 min/day LISS + 1–2 HIIT sessions/week',
    focus: `Conditioning is everything now. ${weeksOut} week${weeksOut !== 1 ? 's' : ''} to tighten up.`,
    milestones: ['Tan test session booked', 'Posing video review with coach or self-recorded', 'Show day logistics finalized'],
  }
  if (weeksOut <= 6) return {
    phase: 'Peak / Conditioning',
    phaseColor: 'orange',
    training: ['Moderate volume, consistent intensity', 'Keep progressive overload on key lifts', 'Posing practice 15 min minimum per day'],
    nutrition: ['500–750 kcal deficit', 'Weekly refeed on heaviest training day', 'Hydration: 4–5L/day minimum'],
    cardio: '30–45 min/day, primarily LISS',
    focus: 'Conditioning and posing become daily non-negotiables. Take photos every 2 weeks to assess progress objectively.',
    milestones: ['Suit/trunks ordered and arrived', 'Division and category confirmed', 'Coach check-in photos submitted'],
  }
  if (weeksOut <= 8) return {
    phase: 'Strength → Peak Transition',
    phaseColor: 'yellow',
    training: ['Begin reducing volume ~20% from peak', 'Maintain strength on primary lifts', 'Posing practice 3x/week — video yourself'],
    nutrition: ['Consistent 500 kcal deficit', 'High protein: 2.2–2.5g/kg', 'Track every single meal without exception'],
    cardio: '25–35 min/day, LISS 5x/week',
    focus: 'Transition to conditioning mindset. Cardio increases, diet tightens, posing becomes serious.',
    milestones: ['8-week check-in photos — compare to starting point', 'Honestly assess conditioning progress'],
  }
  if (weeksOut <= 12) return {
    phase: 'Strength Phase',
    phaseColor: 'blue',
    training: ['Moderate-high volume, heavier loads', 'Focus on compound lifts with progressive overload', 'Keep all major muscle groups stimulated weekly'],
    nutrition: ['Structured 400–500 kcal deficit below TDEE', 'Carb timing: prioritize pre/post workout', 'Eliminate cheat meals entirely'],
    cardio: '20–25 min/day, 4–5x/week',
    focus: 'Dial in the diet and progressively increase cardio. The habits you build now carry you through the harder weeks.',
    milestones: ['Mid-prep photos at 12 weeks out — reassess rate of loss', 'Adjust calorie deficit if weight loss is too fast or slow'],
  }
  if (weeksOut <= 16) return {
    phase: 'Hypertrophy → Strength',
    phaseColor: 'brand',
    training: ['High volume, moderate loads', 'Progressive overload on all major muscle groups', 'Prioritize weak points that matter on stage'],
    nutrition: ['Begin structured deficit: 250–350 kcal below maintenance', 'High protein baseline: 2.0g/kg', 'Start tracking food consistently every day'],
    cardio: '15–20 min/day, 3–4x/week',
    focus: 'Establish contest prep habits now: consistent food tracking, structured cardio, weekly weigh-ins every morning.',
    milestones: ['Starting photos and measurements recorded', 'Food scale purchased and in use', 'Weekly weigh-in day and time set'],
  }
  return {
    phase: 'Hypertrophy / Off-Season',
    phaseColor: 'green',
    training: ['Maximum volume hypertrophy training', 'Build every weak body part systematically', 'No conditioning pressure — focus entirely on muscle quality'],
    nutrition: ['Maintenance calories or very slight surplus', 'Focus on building muscle, not cutting', 'Eat enough to train hard and recover fully'],
    cardio: '2–3x/week light cardio for cardiovascular health only',
    focus: 'Build as much quality, stage-ready muscle as possible before prep begins.',
    milestones: ['Confirm show date and register early', 'Research your division requirements and judging criteria', 'Find a posing coach if first competition'],
  }
}

export function buildPrepTimeline(showDate: string): { weeksOut: number; isCurrentWeek: boolean; isPast: boolean; guidance: WeekGuidance }[] {
  // Use the same local-midnight calculation as getShowCountdown in utils/dates.ts
  const show = new Date(showDate + 'T12:00:00')
  const now = new Date()
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const totalDays = Math.max(0, Math.floor((show.getTime() - todayMidnight.getTime()) / 86400000))
  const currentWeek = Math.floor(totalDays / 7)

  // Show from 2 weeks before current week (context) through show day
  const startWeek = Math.min(currentWeek + 2, 24)
  const items = []
  for (let w = startWeek; w >= 0; w--) {
    items.push({
      weeksOut: w,
      isCurrentWeek: w === currentWeek,
      isPast: w > currentWeek,
      guidance: getWeekGuidance(w),
    })
  }
  return items
}

export interface DayProtocol {
  daysOut: number
  label: string
  training: string
  nutrition: string
  water: string
  sodium: string
  notes: string[]
}

export interface ChecklistSection {
  title: string
  items: string[]
}

export const PEAK_WEEK_PROTOCOL: {
  overview: string
  days: DayProtocol[]
  carbLoadCalc: { formula: string; foods: string[]; notes: string[] }
  waterProtocol: string[]
  sodiumProtocol: string[]
} = {
  overview:
    'Peak week is the final 7 days before your competition. The goal is to arrive on stage looking your absolute best: full, round muscles with dry, thin skin, a deep competition tan, and confident posing. Peak week is NOT the time to experiment with new protocols — execute the exact plan you have practiced and tested in mock peak weeks.',

  days: [
    {
      daysOut: 7,
      label: 'Monday — Depletion Training',
      training:
        'Full body depletion workout: higher rep ranges (15–20 reps), shorter rest periods (60 seconds), moderate weight. Hit every major muscle group to initiate glycogen depletion and signal the body to store more upon reloading.',
      nutrition:
        'Normal contest prep macros. Keep protein very high (2.5g/kg minimum). Maintain moderate carbs — no reduction yet. This is your final "normal" day.',
      water: '4–5 liters',
      sodium: 'Normal intake — no restriction yet',
      notes: [
        'This is your last heavy training session of the entire prep cycle',
        'Take reference photos today: front, back, and both sides in good lighting for comparison',
        'Confirm show registration, athlete check-in time, venue address, and hotel booking',
        'Prepare and organize all peak week foods so they are ready throughout the week',
      ],
    },
    {
      daysOut: 6,
      label: 'Tuesday — Begin Carb Reduction',
      training:
        'Light to moderate training: 2–3 sets per exercise, still hitting all muscle groups. The goal is blood flow and muscle activation, not fatigue. Keep it short — 45 minutes maximum.',
      nutrition:
        'Begin carb reduction: drop carbs to 50–75g for the entire day. Keep protein very high. Dietary fat moderate. You will feel flat — this is normal and expected.',
      water: '4 liters',
      sodium: 'Normal to slightly reduced',
      notes: [
        'You will feel flat and depleted today — this is the correct physiological response',
        'Do not panic if you look worse today than you did yesterday — this is part of the process',
        'Continue posing practice — 30 minutes minimum',
        'Begin organizing your competition bag: suit, shoes, food, pump bands, tan touch-up',
      ],
    },
    {
      daysOut: 5,
      label: 'Wednesday — Full Depletion Day',
      training:
        'Minimal training only: 20–30 minutes of posing practice. At most, one very light pump session of 2 sets per muscle group with resistance bands. The goal is movement, not fatigue.',
      nutrition:
        'Lowest carb day: 25–50g carbs only for the entire day. Protein remains very high (3g/kg). Dietary fat moderate. This is the worst you will look all week.',
      water: '3.5–4 liters',
      sodium: 'Reduced: 1,000–1,500mg maximum',
      notes: [
        'Full glycogen depletion: you should look and feel very flat and depleted',
        'Mental note: this is the worst you will look all week — loading begins tomorrow and the transformation is dramatic',
        'Prepare all carb-load foods tonight so they are ready to eat first thing tomorrow morning',
        'Apply coat 1 of competition tan tonight if using a self-application system',
      ],
    },
    {
      daysOut: 4,
      label: 'Thursday — Carb Load Day 1',
      training:
        'No traditional resistance training. Optional: 15 minutes of light posing practice to maintain muscle memory and assess how you are filling out.',
      nutrition:
        'Begin carb loading: your target is 8–12g of carbs per kg bodyweight OVER the full 3-day load period. Day 1 target: approximately 3–4g carbs per kg bodyweight. Choose fast-digesting carbs: white rice, cream of rice, sweet potato, gummy bears. Keep dietary fat under 30g total.',
      water: '3 liters',
      sodium: 'Low: 500–1,000mg',
      notes: [
        'You will begin visibly filling out within hours of eating carbs — enjoy watching the transformation',
        'Eat carbs every 2–3 hours in small to moderate portions throughout the day',
        'Keep dietary fat VERY low during all loading days — fat blocks full glycogen storage',
        'Protein remains high but carbs are the priority and caloric focus today',
      ],
    },
    {
      daysOut: 3,
      label: 'Friday — Carb Load Day 2',
      training: 'Rest or 15 minutes of posing practice only. No resistance training whatsoever.',
      nutrition:
        'Continue the carb load: Day 2 target is another 3–4g of carbs per kg bodyweight. Use variety in food sources: white rice, oats, banana, sweet potato, rice cakes. Monitor how you look and feel — reduce the load if you are looking smooth or watery.',
      water: '2.5 liters',
      sodium: 'Very low: 300–500mg',
      notes: [
        'You should be noticeably and dramatically fuller today compared to Wednesday',
        'Apply coat 2 of competition tan tonight',
        'Lay out all competition equipment: suit, heels, music (if needed), and show-day bag',
        'Begin reducing water intake slightly to enhance visible muscle separation and definition',
      ],
    },
    {
      daysOut: 2,
      label: 'Saturday — Final Load & Tan Day',
      training:
        'Light pump session only: 1–2 sets of cables for chest, back, and arms. The goal is to top off glycogen stores and get maximum blood into the muscles. Keep it to 20–30 minutes.',
      nutrition:
        'Day 3 of the carb load: final 2–3g of carbs per kg bodyweight. Scale back immediately if you feel too full or look smooth. Some athletes switch exclusively to fastest-digesting carbs on this final day: cream of rice, white rice, white bread, gummy bears.',
      water: '2 liters or less',
      sodium: 'Minimal: 200–400mg',
      notes: [
        'Final competition tan application: coat 3 or application of competition bronzer over your base coats',
        'Do NOT scratch or rub skin after tan application — the tan must be perfect and undamaged for tomorrow',
        'Lay out everything for show day in one place: suit, heels, shoes, pump bands, food bag, ID, music',
        'Sleep as early as possible — show day is an early morning with a long day ahead',
      ],
    },
    {
      daysOut: 1,
      label: 'Sunday — Show Day',
      training:
        'Backstage pump only: 15–20 minutes of targeted pumping for your division\'s primary muscle groups. Focus on your biggest and most-judged areas. Stop pumping 5–10 minutes before going on stage.',
      nutrition:
        'Show day eating: rice cakes, banana, or gummy bears backstage before going on stage. After morning check-in, eat a normal whole-food meal. Snack on fast carbs throughout the day to maintain muscle fullness during both prejudging and finals.',
      water: 'Sip to thirst backstage — do NOT chug water or you will look flat and watery under stage lights.',
      sodium:
        'Some athletes use a very small amount of sodium pre-stage to help fill out muscle. Test this protocol in practice first — never try it for the first time on show day.',
      notes: [
        'Arrive at the venue 2–3 hours before your division is called — never rush backstage',
        'Apply final bronzer or tan touch-up products backstage per your exact tan protocol',
        'Warm up your posing before going on stage — run through all mandatory poses twice',
        'Enjoy this day — you have invested months of effort to get here. Trust your preparation and compete.',
      ],
    },
  ],

  carbLoadCalc: {
    formula:
      '8–12 grams of carbohydrates per kilogram of bodyweight, spread over 3 consecutive days (Days 4, 3, and 2 before the show)',
    foods: [
      'White rice — 28g carbs per 100g cooked (fast-absorbing, the gold standard for carb loading)',
      'Cream of rice — 81g carbs per 50g dry (extremely fast-absorbing, easy to eat in large quantities)',
      'Sweet potato — 20g carbs per 100g (moderate absorption speed, nutrient-dense option)',
      'Gummy bears — 87g carbs per 100g (fastest-absorbing option; popular for the final day of loading)',
      'White bread — 49g carbs per 100g (acceptable, very easy to consume in large amounts)',
      'Banana — 23g carbs per 120g (provides potassium which helps with muscle fullness and pumps)',
      'Rice cakes — 81g carbs per 100g (extremely easy to digest, portable, and show-day friendly)',
    ],
    notes: [
      'Keep dietary fat under 30g total per day during all loading days — fat significantly blocks complete glycogen storage',
      'Protein can be slightly reduced during loading days — carbohydrates are the caloric priority',
      'If you look smooth or watery after Day 1 of loading, cut the load short or reduce portion sizes',
      'Individual responses to carb loading vary dramatically — a practice peak week 4–6 weeks out is highly recommended',
    ],
  },

  waterProtocol: [
    '7 days out: 4–5 liters per day — flush the system and initiate the peak week process with high intake',
    '6–5 days out: 3.5–4 liters — maintain high intake through the depletion phase',
    '4–3 days out: 2.5–3 liters — begin tapering as the carb load begins and glycogen pulls water into muscles',
    '2 days out: 2 liters or less — muscle fullness and skin condition should guide this number',
    'Show day: sip water to thirst only — do NOT chug water or you will appear flat and smooth under stage lighting',
    'Note: these are guidelines, not absolutes. Individual response to water manipulation varies widely. Some athletes do not restrict water at all and still peak perfectly — know your body.',
  ],

  sodiumProtocol: [
    'Sodium causes subcutaneous water retention but also helps pull nutrients and water into muscle cells',
    '7–5 days out: reduce sodium to approximately 1,500mg per day (avoid all processed and packaged foods)',
    '4–2 days out: further reduce to 300–500mg per day during the peak carb loading phase',
    'Show day: some athletes use 300–500mg of sodium immediately pre-stage to help fill muscles — always test this in practice first',
    'Critical: do NOT eliminate sodium entirely — complete sodium elimination can cause dangerous cramping and paradoxically flat muscles',
  ],
}

export const FIRST_TIMER_CHECKLIST: Record<string, ChecklistSection> = {
  weeks16Plus: {
    title: '16+ Weeks Out — Foundation Phase',
    items: [
      'Choose your federation (NPC, IFBB Pro, OCB, WBFF, etc.) and confirm your specific division',
      'Register for your target show — many popular shows fill up months in advance',
      'Get a complete blood panel done before starting prep to establish health baselines',
      'Take "before" photos: front, back, and both sides in consistent lighting for comparison',
      'Begin training your mandatory poses — even 10 minutes per day builds the habit over time',
      'Research posing coaches in your area or available online for your specific division',
      'Start attending local competitions as an audience member to understand the show environment',
      'Calculate your peak week nutrition targets — know your carb load gram targets before you start',
    ],
  },
  weeks12: {
    title: '12 Weeks Out — Commitment Phase',
    items: [
      'Hire a posing coach if you have not already — online posing coaching is widely available and very effective',
      'Film your posing weekly from multiple angles and compare to top athletes in your division',
      'Order your competition suit — custom suits take 6–10 weeks to arrive',
      "Order competition heels (women's divisions) and break them in for months before the show",
      'Test competition tan brands: apply a small patch test to check your personal skin reaction',
      'Begin practicing the peak week nutrition protocol — perform a mock carb depletion and carb load',
      'Build your show-day checklist: suit, shoes, pump bands, food, music, ID, tan touch-up',
      'Confirm your travel and accommodation arrangements if the show is in another city',
    ],
  },
  weeks8: {
    title: '8 Weeks Out — Intensification Phase',
    items: [
      'Posing practice: minimum 20 minutes per day, at least 6 days per week without exception',
      'Film your complete mandatory pose routine from front, back, and both side angles',
      'Book your competition tan appointment (professional spray tan or self-application service)',
      'Order any remaining competition accessories: posing trunks, jewelry, glaze products',
      'Confirm your stage registration details and obtain your competitor number and badge information',
      'Prepare a detailed show-day timeline: wake-up time, all meals, travel, venue check-in, pump-up start',
      'Reduce weekly cardio experiment: observe how your body responds to slightly reduced cardio volume',
      'Test your specific show-day meal choices: identify foods that keep you full without causing bloating',
    ],
  },
  weeks4: {
    title: '4 Weeks Out — Final Peak Prep Phase',
    items: [
      'Posing: 30–45 minutes daily — every mandatory pose should feel completely automatic by now',
      'Practice your T-walk or presentation walk in competition heels on a smooth hard floor',
      'Confirm your competition suit fits perfectly — alterations require 1–2 weeks if adjustments are needed',
      'Perform a complete mock peak week (full depletion and carb load) to test your individual response',
      'Apply a practice coat of competition tan to check the final color and your application technique',
      'Take weekly progress photos and compare directly to photos from 4 weeks prior',
      'Finalize and memorize your exact backstage pump routine: exercises, resistance bands, sets',
      'Practice your music timing and stage choreography if your division requires music',
    ],
  },
  weeks2: {
    title: '2 Weeks Out — Final Preparation',
    items: [
      'Confirm all show-day logistics: exact venue address, athlete check-in time, and athlete meeting details',
      'Pack your show-day bag: suit, heels, pump bands, food, water, tan touch-up products, music device',
      'Final suit fitting — everything should fit perfectly and be completely ready to go',
      'Posing: 30 minutes per day minimum, focusing specifically on weak poses identified by your coach',
      'Eliminate all processed foods and excess sodium from your diet starting today',
      'Arrange your competition tan application schedule with a professional service if using one',
      'Confirm a dedicated support person (coach, training partner, or friend) for the full show day',
      'Mental preparation: visualize your complete walk and all mandatory poses in detail each night',
    ],
  },
  peakWeek: {
    title: 'Peak Week — Day by Day',
    items: [
      'Day 7: Full body depletion training. Take reference photos for comparison throughout the week.',
      'Day 6: Begin carb reduction to 50–75g. Stay calm — looking flat is the correct response.',
      'Day 5: Full glycogen depletion. Prepare all carb-load foods tonight and have them ready.',
      'Day 4: Begin carb loading. Monitor fullness and skin condition every few hours.',
      'Day 3: Continue carb loading. Apply coat 1–2 of competition tan tonight.',
      'Day 2: Final light pump session. Apply coat 3 of competition tan or competition bronzer.',
      'Day 1 (Show Day): Wake up early. Eat show-day meals. Arrive at venue. Pump up backstage. Compete!',
      'Every single day: 30 minutes of posing practice regardless of energy levels',
    ],
  },
  showDay: {
    title: 'Show Day — Hour by Hour',
    items: [
      'Wake up 3–4 hours before prejudging begins: eat Meal 1 (white rice, lean protein, small fat)',
      'Apply final bronzer or any tan touch-up products as per your protocol',
      'Arrive at the venue 2–2.5 hours before your specific division is called to the stage',
      'Check in at registration: confirm your division, class, and competitor number badge',
      'Attend the mandatory athlete meeting if required — listen very carefully to all stage instructions',
      'Begin backstage pump 20–30 minutes before going on stage — no sooner',
      'Have a quick backstage snack: rice cakes, banana, or gummy bears 10–15 minutes before your call',
      'When called on stage: stand tall, smile, and execute your practiced poses with total confidence',
      'After prejudging: eat a full meal and rest at your hotel — finals are typically in the evening',
      'For finals: perform a light pump again 15–20 minutes before your division is called on stage',
    ],
  },
}

export const STAGE_READINESS_CHECKLIST: string[] = [
  'Competition suit or trunks — fitted, secured, and show-ready',
  'Competition tan: all coats fully applied and completely dry',
  'Bronzer or glaze applied as the final layer (if using)',
  "Jewelry: earrings and bracelet (women's divisions)",
  "Competition heels or shoes (women's divisions)",
  'Hair fully styled and set for stage lighting',
  'Makeup: full stage-level application including contouring (women)',
  'Nails: completed, no chips or cracks visible',
  'Body hair: shaved, waxed, or removed as required by your division',
  'Water bottle with water for backstage hydration',
  'Snack bag: rice cakes, gummy bears, banana for backstage fueling',
  'Pump-up resistance bands or cables setup backstage',
  'Athlete number or badge obtained from registration',
  'Government-issued photo ID in your bag',
  'Show program — know your division class number and the competitor order',
  'Phone charger for the long show day ahead',
  'Extra tan or bronzer products for any touch-up needed backstage',
  'Small microfiber towel for the backstage pump session',
  'Performance music loaded and tested on your phone (if required)',
  'Coach or support person contact number saved in your phone',
  'All mandatory poses fully memorized and automatic',
  'Complete show-day meal schedule planned and all food packed',
  'Venue address confirmed and travel route mapped',
  'Positive mindset: trust your preparation and enjoy every moment of this experience',
]
