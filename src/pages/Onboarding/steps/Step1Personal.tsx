import { useState } from 'react'
import { Input, Select } from '../../../components/ui'
import type { OnboardingData } from '../useOnboarding'

interface Props {
  data: OnboardingData
  update: (d: Partial<OnboardingData>) => void
}

type HeightUnit = 'cm' | 'ft'
type WeightUnit = 'kg' | 'lbs'

function UnitToggle({
  value,
  options,
  onChange
}: {
  value: string
  options: { value: string; label: string }[]
  onChange: (v: string) => void
}) {
  return (
    <div className="flex bg-gray-800 rounded-lg p-0.5 border border-gray-700">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`px-2.5 py-0.5 rounded-md text-xs font-semibold transition-colors ${
            value === opt.value
              ? 'bg-brand-600 text-white'
              : 'text-gray-400 hover:text-gray-200'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

export default function Step1Personal({ data, update }: Props) {
  const [heightUnit, setHeightUnit] = useState<HeightUnit>('cm')
  const [weightUnit, setWeightUnit] = useState<WeightUnit>('kg')
  const [ftFeet, setFtFeet] = useState('')
  const [ftInches, setFtInches] = useState('')
  const [lbsValue, setLbsValue] = useState('')

  function handleHeightUnit(unit: string) {
    const u = unit as HeightUnit
    if (u === 'ft' && data.height_cm) {
      setFtFeet(String(Math.floor(data.height_cm / 30.48)))
      setFtInches(String(Math.round((data.height_cm % 30.48) / 2.54)))
    }
    setHeightUnit(u)
  }

  function handleWeightUnit(unit: string) {
    const u = unit as WeightUnit
    if (u === 'lbs' && data.weight_kg) {
      setLbsValue(String(Math.round(data.weight_kg * 2.20462 * 10) / 10))
    }
    setWeightUnit(u)
  }

  function handleFeetChange(val: string) {
    setFtFeet(val)
    const cm = (parseFloat(val) || 0) * 30.48 + (parseFloat(ftInches) || 0) * 2.54
    if (cm > 0) update({ height_cm: Math.round(cm * 10) / 10 })
  }

  function handleInchesChange(val: string) {
    setFtInches(val)
    const cm = (parseFloat(ftFeet) || 0) * 30.48 + (parseFloat(val) || 0) * 2.54
    if (cm > 0) update({ height_cm: Math.round(cm * 10) / 10 })
  }

  function handleLbsChange(val: string) {
    setLbsValue(val)
    const kg = Math.round((parseFloat(val) || 0) * 0.453592 * 10) / 10
    if (kg > 0) update({ weight_kg: kg })
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-gray-100">Personal Information</h2>
        <p className="text-sm text-gray-400 mt-1">
          This data is used to calculate your personalized calorie targets and plan structure.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <Input
            label="Full Name"
            value={data.name ?? ''}
            onChange={(e) => update({ name: e.target.value })}
            placeholder="Your name"
            required
            autoFocus
          />
        </div>

        <Input
          label="Age"
          type="number"
          min={16}
          max={80}
          value={data.age ?? ''}
          onChange={(e) => update({ age: parseInt(e.target.value) })}
          placeholder="e.g. 28"
          required
        />

        <Select
          label="Sex"
          value={data.sex ?? 'male'}
          onChange={(e) => update({ sex: e.target.value as 'male' | 'female' | 'other' })}
          options={[
            { value: 'male', label: 'Male' },
            { value: 'female', label: 'Female' },
            { value: 'other', label: 'Other' }
          ]}
        />

        {/* Height with unit toggle */}
        <div className="col-span-2">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-sm font-semibold text-gray-300">Height</span>
            <UnitToggle
              value={heightUnit}
              options={[
                { value: 'cm', label: 'cm' },
                { value: 'ft', label: 'ft / in' }
              ]}
              onChange={handleHeightUnit}
            />
          </div>
          {heightUnit === 'cm' ? (
            <>
              <input
                className="input-base"
                type="number"
                min={140}
                max={250}
                value={data.height_cm ?? ''}
                onChange={(e) => update({ height_cm: parseFloat(e.target.value) })}
                placeholder="e.g. 178"
                required
              />
              {data.height_cm && (data.height_cm > 220 || data.height_cm < 100) && (
                <p className="text-xs text-amber-500 mt-1">⚠ Please double-check this measurement.</p>
              )}
            </>
          ) : (
            <div className="flex gap-2">
              <div className="flex-1">
                <input
                  className="input-base"
                  type="number"
                  min={4}
                  max={8}
                  value={ftFeet}
                  onChange={(e) => handleFeetChange(e.target.value)}
                  placeholder="ft"
                />
              </div>
              <div className="flex-1">
                <input
                  className="input-base"
                  type="number"
                  min={0}
                  max={11}
                  value={ftInches}
                  onChange={(e) => {
                    const clamped = Math.min(11, Math.max(0, parseInt(e.target.value) || 0))
                    handleInchesChange(String(clamped))
                  }}
                  placeholder="in"
                />
              </div>
            </div>
          )}
        </div>

        {/* Weight with unit toggle */}
        <div className="col-span-2">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-sm font-semibold text-gray-300">Current Weight</span>
            <UnitToggle
              value={weightUnit}
              options={[
                { value: 'kg', label: 'kg' },
                { value: 'lbs', label: 'lbs' }
              ]}
              onChange={handleWeightUnit}
            />
          </div>
          {weightUnit === 'kg' ? (
            <>
              <input
                className="input-base"
                type="number"
                min={40}
                max={300}
                step={0.1}
                value={data.weight_kg ?? ''}
                onChange={(e) => update({ weight_kg: parseFloat(e.target.value) })}
                placeholder="e.g. 85.5"
                required
              />
              {data.weight_kg && (data.weight_kg > 200 || data.weight_kg < 30) && (
                <p className="text-xs text-amber-500 mt-1">⚠ Please double-check this measurement.</p>
              )}
            </>
          ) : (
            <input
              className="input-base"
              type="number"
              min={88}
              max={660}
              step={0.5}
              value={lbsValue}
              onChange={(e) => handleLbsChange(e.target.value)}
              placeholder="e.g. 188"
              required
            />
          )}
        </div>

        <Input
          label="Estimated Body Fat % (optional)"
          type="number"
          min={3}
          max={50}
          step={0.5}
          value={data.body_fat_pct ?? ''}
          onChange={(e) =>
            update({ body_fat_pct: e.target.value ? parseFloat(e.target.value) : undefined })
          }
          placeholder="e.g. 18"
        />

        <Input
          label="Years of Training Experience"
          type="number"
          min={0}
          max={30}
          step={0.5}
          value={data.training_experience_years ?? ''}
          onChange={(e) => update({ training_experience_years: parseFloat(e.target.value) })}
          placeholder="e.g. 3"
          required
        />
      </div>

      <div className="bg-gray-800/50 rounded-lg p-3 text-xs text-gray-400 border border-gray-700">
        <strong className="text-gray-300">Privacy:</strong> All data is stored locally on your device.
        Nothing is sent to external servers.
      </div>
    </div>
  )
}
