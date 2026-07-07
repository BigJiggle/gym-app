import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useOnboarding } from './useOnboarding'
import { useUserStore } from '../../store/userStore'
import { usePlanStore } from '../../store/planStore'
import { useSettingsStore } from '../../store/settingsStore'
import StepAiSetup from './steps/StepAiSetup'
import Step1Personal from './steps/Step1Personal'
import Step2Goals from './steps/Step2Goals'
import Step3Training from './steps/Step3Training'
import Step4Nutrition from './steps/Step4Nutrition'
import Step5FoodSetup from './steps/Step5FoodSetup'
import Step6Review from './steps/Step6Review'
import Button from '../../components/ui/Button'
import type { CreateUserInput } from '../../types'

const STEP_LABELS = ['AI Setup', 'Personal', 'Goals', 'Training', 'Nutrition', 'Food Setup', 'Review']

function validateStep(step: number, data: ReturnType<typeof useOnboarding>['data']): string | null {
  if (step === 2) {
    if (!data.name?.trim()) return 'Please enter your name.'
    if (!data.age || data.age < 16 || data.age > 80) return 'Please enter a valid age (16–80).'
    if (!data.height_cm || data.height_cm < 100 || data.height_cm > 250) return 'Please enter a valid height (100–250 cm).'
    if (!data.weight_kg || data.weight_kg < 30 || data.weight_kg > 300) return 'Please enter a valid weight (30–300 kg).'
    if (data.training_experience_years === undefined) return 'Please enter your training experience.'
  }
  return null
}

export default function Onboarding() {
  const { step, totalSteps, data, update, next, back, apiKey, setApiKey } = useOnboarding()
  const { createUser, loadShows } = useUserStore()
  const { generateTrainingPlan, generateDietPlan } = usePlanStore()
  const setSetting = useSettingsStore((s) => s.setSetting)
  const navigate = useNavigate()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Restore Electron window focus — after resetAllData() the DOM re-mounts
  // and Electron can lose focus on the webContents, making inputs non-interactive.
  useEffect(() => {
    window.focus()
  }, [])

  async function handleNext() {
    const err = validateStep(step, data)
    if (err) { setError(err); return }
    setError(null)
    next()
  }

  async function handleSubmit() {
    const err = validateStep(2, data)
    if (err) { setError(err); return }
    setSubmitting(true)
    setError(null)
    try {
      // Persist the Claude API key (if provided) BEFORE plan generation so the
      // engine picks it up and produces an AI-tailored plan. Blank key → the
      // deterministic rule-based engine is used (graceful fallback).
      const trimmedKey = apiKey.trim()
      if (trimmedKey) {
        await setSetting('claude_api_key', trimmedKey)
      }
      const user = await createUser(data as CreateUserInput)
      // If the user entered a show date, add it to the shows table as their primary show
      if (data.show_date) {
        await window.api.addShow(user.id, {
          name: data.division ? `${data.division} Competition` : 'My Competition',
          show_date: data.show_date,
          division: data.division ?? null,
          federation: null,
          notes: null,
          is_primary: 1,
        })
        await loadShows(user.id)
      }
      // Navigate before plan generation so routing isn't blocked by plan errors
      navigate('/dashboard')
      generateTrainingPlan(user.id)
      generateDietPlan(user.id)
    } catch (e) {
      const msg = String(e).replace(/Error invoking remote method '[^']+': /, '').trim()
      setError(`Failed to create profile: ${msg}`)
      setSubmitting(false)
    }
  }

  const stepComponents = [
    <StepAiSetup apiKey={apiKey} setApiKey={setApiKey} />,
    <Step1Personal data={data} update={update} />,
    <Step2Goals data={data} update={update} />,
    <Step3Training data={data} update={update} />,
    <Step4Nutrition data={data} update={update} />,
    <Step5FoodSetup data={data} update={update} />,
    <Step6Review data={data} />
  ]

  const progress = (step / totalSteps) * 100

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-black text-brand-500 tracking-tight">PrepCoach</h1>
          <p className="text-gray-400 mt-1">Your personal competition prep system</p>
        </div>

        {/* Progress */}
        <div className="mb-6">
          <div className="flex justify-between mb-2">
            {STEP_LABELS.map((label, i) => (
              <div key={i} className="flex flex-col items-center">
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                    i + 1 < step
                      ? 'bg-brand-600 text-white'
                      : i + 1 === step
                        ? 'bg-brand-600/30 border-2 border-brand-500 text-brand-400'
                        : 'bg-gray-800 text-gray-600'
                  }`}
                >
                  {i + 1 < step ? '✓' : i + 1}
                </div>
                <span className={`text-xs mt-1 ${i + 1 === step ? 'text-brand-400' : 'text-gray-600'}`}>
                  {label}
                </span>
              </div>
            ))}
          </div>
          <div className="h-1 bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-brand-500 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Card */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 shadow-xl">
          {stepComponents[step - 1]}

          {error && (
            <div className="mt-4 bg-red-900/20 border border-red-800/40 rounded-lg p-3 text-sm text-red-400">
              {error}
            </div>
          )}

          <div className="flex justify-between mt-6 pt-4 border-t border-gray-800">
            <Button
              variant="secondary"
              onClick={back}
              disabled={step === 1}
            >
              Back
            </Button>

            {step < totalSteps ? (
              <Button onClick={handleNext}>
                Continue →
              </Button>
            ) : (
              <Button onClick={handleSubmit} disabled={submitting}>
                {submitting ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Creating Plan...
                  </>
                ) : (
                  'Create My Plan →'
                )}
              </Button>
            )}
          </div>
        </div>

        <p className="text-center text-xs text-gray-700 mt-4">
          PrepCoach provides educational guidance only. Not a substitute for professional medical advice.
        </p>
      </div>
    </div>
  )
}
