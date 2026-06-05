import { useState } from 'react'
import type { CreateUserInput } from '../../types'

export type OnboardingData = Partial<CreateUserInput>

export function useOnboarding() {
  const [step, setStep] = useState(1)
  const [data, setData] = useState<OnboardingData>({
    sex: 'male',
    goal: 'cut',
    dietary_preference: 'omnivore',
    equipment_access: 'full_gym',
    activity_level: 'moderate',
    training_frequency: 4,
    training_experience_years: 2,
    is_natural: true,
    meal_count: 4,
    snack_count: 0,
    include_snacks: true,
    competition_history: [],
    dietary_restrictions: [],
    split_preference: 'auto' as const,
    food_preferences: [],
    food_exclusions: [],
    cooking_time_pref: 'medium' as const,
    meal_prep_style: 'daily' as const,
    culture_pref: 'any' as const,
  })

  const totalSteps = 6

  function update(partial: Partial<CreateUserInput>) {
    setData((prev) => ({ ...prev, ...partial }))
  }

  function next() {
    setStep((s) => Math.min(s + 1, totalSteps))
  }

  function back() {
    setStep((s) => Math.max(s - 1, 1))
  }

  return { step, totalSteps, data, update, next, back }
}
