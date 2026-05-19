import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useUserStore } from '../../store/userStore'
import { usePlanStore } from '../../store/planStore'
import { useSettingsStore } from '../../store/settingsStore'
import { Textarea } from '../../components/ui/Input'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import type { CheckIn } from '../../types'
import { localDateStr } from '../../utils/dates'

function RatingBar({
  label,
  value,
  onChange,
  lowLabel,
  highLabel
}: {
  label: string
  value: number
  onChange: (v: number) => void
  lowLabel?: string
  highLabel?: string
}) {
  return (
    <div>
      <div className="flex justify-between mb-1.5">
        <span className="text-sm font-medium text-gray-300">{label}</span>
        <span className="text-sm text-brand-400 font-bold">{value}/5</span>
      </div>
      <div className="flex gap-1.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className={`flex-1 h-8 rounded transition-colors text-sm font-medium ${
              n <= value ? 'bg-brand-600 text-white' : 'bg-gray-800 text-gray-600 hover:bg-gray-700'
            }`}
          >
            {n}
          </button>
        ))}
      </div>
      {(lowLabel || highLabel) && (
        <div className="flex justify-between text-xs text-gray-600 mt-1">
          <span>{lowLabel}</span>
          <span>{highLabel}</span>
        </div>
      )}
    </div>
  )
}

function AdherenceSlider({
  label,
  value,
  onChange
}: {
  label: string
  value: number
  onChange: (v: number) => void
}) {
  return (
    <div>
      <div className="flex justify-between mb-1">
        <span className="text-sm font-medium text-gray-300">{label}</span>
        <span className="text-sm text-brand-400 font-bold">{value}%</span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value))}
        className="w-full accent-brand-500 h-2"
      />
      <div className="flex justify-between text-xs text-gray-600 mt-1">
        <span>0%</span>
        <span>50%</span>
        <span>100%</span>
      </div>
    </div>
  )
}

export default function CheckIn() {
  const { user } = useUserStore()
  const { submitCheckin, checkinHistory, loadCheckinHistory, loading } = usePlanStore()
  const { settings } = useSettingsStore()

  const isImperial = settings.units === 'imperial'
  const weightUnit = isImperial ? 'lbs' : 'kg'
  const measureUnit = isImperial ? 'in' : 'cm'

  const [submitted, setSubmitted] = useState<CheckIn | null>(null)
  const [nextAllowed, setNextAllowed] = useState<Date | null>(null)
  const [checkingInterval, setCheckingInterval] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Edit last check-in (shown on locked screen)
  const [editOpen, setEditOpen] = useState(false)
  const [editSaving, setEditSaving] = useState(false)
  const [editSaved, setEditSaved] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  const [editWeight, setEditWeight] = useState('')
  const [editWaist, setEditWaist] = useState('')
  const [editChest, setEditChest] = useState('')
  const [editHip, setEditHip] = useState('')
  const [editArm, setEditArm] = useState('')
  const [editThigh, setEditThigh] = useState('')
  const [editTraining, setEditTraining] = useState(90)
  const [editDiet, setEditDiet] = useState(90)
  const [editEnergy, setEditEnergy] = useState(3)
  const [editSleep, setEditSleep] = useState(3)
  const [editStress, setEditStress] = useState(2)
  const [editNotes, setEditNotes] = useState('')
  const [editDate, setEditDate] = useState('')

  const defaultWeight = user
    ? isImperial
      ? Math.round(user.weight_kg / 0.453592 * 10) / 10
      : user.weight_kg
    : 80

  const [weightDisplay, setWeightDisplay] = useState(String(defaultWeight))
  const [waistDisplay, setWaistDisplay] = useState('')
  const [chestDisplay, setChestDisplay] = useState('')
  const [hipDisplay, setHipDisplay] = useState('')
  const [armDisplay, setArmDisplay] = useState('')
  const [thighDisplay, setThighDisplay] = useState('')
  const [trainingAdherence, setTrainingAdherence] = useState(90)
  const [dietAdherence, setDietAdherence] = useState(90)
  const [energyLevel, setEnergyLevel] = useState(3)
  const [sleepQuality, setSleepQuality] = useState(3)
  const [stressLevel, setStressLevel] = useState(2)
  const [notes, setNotes] = useState('')

  function toKg(val: string): number | null {
    const n = parseFloat(val)
    if (isNaN(n) || n <= 0) return null
    return isImperial ? Math.round(n * 0.453592 * 100) / 100 : n
  }

  function toCm(val: string): number | null {
    const n = parseFloat(val)
    if (isNaN(n) || n <= 0) return null
    return isImperial ? Math.round(n * 2.54 * 10) / 10 : n
  }

  useEffect(() => {
    if (!user) return
    loadCheckinHistory(user.id)
    window.api.getNextCheckinDate(user.id)
      .then((iso) => {
        if (iso && new Date(iso) > new Date()) {
          setNextAllowed(new Date(iso))
        }
        setCheckingInterval(false)
      })
      .catch(() => setCheckingInterval(false))
  }, [user?.id])

  if (!user) return null
  if (checkingInterval) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <div className="flex items-center gap-2 text-gray-400 text-sm">
          <span className="w-4 h-4 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
          Loading check-in status...
        </div>
      </div>
    )
  }

  // Locked state
  if (nextAllowed && nextAllowed > new Date()) {
    const msLeft = nextAllowed.getTime() - Date.now()
    const totalMinutes = Math.ceil(msLeft / (1000 * 60))
    const daysLeft = Math.floor(totalMinutes / (60 * 24))
    const hoursLeft = Math.floor((totalMinutes % (60 * 24)) / 60)
    const minsLeft = totalMinutes % 60
    const timeLabel = daysLeft > 0
      ? `${daysLeft} day${daysLeft !== 1 ? 's' : ''}${hoursLeft > 0 ? ` ${hoursLeft}h` : ''}`
      : hoursLeft > 0
        ? `${hoursLeft} hour${hoursLeft !== 1 ? 's' : ''}${minsLeft > 0 ? ` ${minsLeft}m` : ''}`
        : `${minsLeft} minute${minsLeft !== 1 ? 's' : ''}`
    const scheduleType = settings.checkin_schedule_type ?? 'day'
    const biweekly = settings.checkin_biweekly === 'true'
    const intervalDays = parseInt(settings.checkin_interval_days ?? '7', 10)
    const DAY_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
    const DAY_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
    const preferredDay = DAY_NAMES[parseInt(settings.checkin_day ?? '1')]
    const scheduleLabel = scheduleType === 'interval'
      ? intervalDays === 1 ? 'Daily' : `Every ${intervalDays} days`
      : biweekly ? `Every other ${preferredDay}` : `Every ${preferredDay}`

    const lastCheckin = checkinHistory[0] ?? null

    function openEdit() {
      if (!lastCheckin) return
      const toDisplay = (kg: number | null | undefined) =>
        kg != null ? (isImperial ? String(Math.round(kg / 0.453592 * 10) / 10) : String(kg)) : ''
      const toDisplayCm = (cm: number | null | undefined) =>
        cm != null ? (isImperial ? String(Math.round(cm / 2.54 * 10) / 10) : String(cm)) : ''
      setEditWeight(toDisplay(lastCheckin.weight_kg))
      setEditWaist(toDisplayCm(lastCheckin.waist_cm))
      setEditChest(toDisplayCm(lastCheckin.chest_cm))
      setEditHip(toDisplayCm(lastCheckin.hip_cm))
      setEditArm(toDisplayCm(lastCheckin.arm_cm))
      setEditThigh(toDisplayCm(lastCheckin.thigh_cm))
      setEditTraining(lastCheckin.training_adherence ?? 90)
      setEditDiet(lastCheckin.diet_adherence ?? 90)
      setEditEnergy(lastCheckin.energy_level ?? 3)
      setEditSleep(lastCheckin.sleep_quality ?? 3)
      setEditStress(lastCheckin.stress_level ?? 2)
      setEditNotes(lastCheckin.notes ?? '')
      setEditDate(lastCheckin.check_in_date ?? '')
      setEditSaved(false)
      setEditError(null)
      setEditOpen(true)
    }

    async function saveEdit() {
      if (!lastCheckin) return
      setEditSaving(true)
      setEditError(null)
      try {
        const wKg = parseFloat(editWeight)
        if (isNaN(wKg) || wKg <= 0) { setEditError('Enter a valid weight'); return }
        if (editDate && !/^\d{4}-\d{2}-\d{2}$/.test(editDate)) {
          setEditError('Date must be YYYY-MM-DD format'); return
        }
        // Always use null (not undefined) — SQLite rejects undefined bindings
        const toCmVal = (v: string): number | null => {
          const n = parseFloat(v)
          return isNaN(n) || n <= 0 ? null : isImperial ? Math.round(n * 2.54 * 10) / 10 : n
        }
        await window.api.updateCheckin(lastCheckin.id, {
          weight_kg: isImperial ? Math.round(wKg * 0.453592 * 100) / 100 : wKg,
          waist_cm: toCmVal(editWaist),
          chest_cm: toCmVal(editChest),
          hip_cm: toCmVal(editHip),
          arm_cm: toCmVal(editArm),
          thigh_cm: toCmVal(editThigh),
          training_adherence: editTraining,
          diet_adherence: editDiet,
          energy_level: editEnergy,
          sleep_quality: editSleep,
          stress_level: editStress,
          notes: editNotes.trim() || null,
          check_in_date: editDate || null,
        } as any)
        setEditSaved(true)
        // Refresh nextAllowed after date change so the lock screen updates
        const newIso = await window.api.getNextCheckinDate(user!.id)
        if (newIso) {
          const newNext = new Date(newIso)
          setNextAllowed(newNext > new Date() ? newNext : null)
        } else {
          setNextAllowed(null)
        }
        setTimeout(() => setEditOpen(false), 1000)
      } catch (e) {
        setEditError(String(e))
      } finally {
        setEditSaving(false)
      }
    }

    return (
      <div className="p-6 max-w-2xl mx-auto space-y-4">
        <h1 className="text-2xl font-bold text-gray-100">Weekly Check-In</h1>

        {/* Locked card */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 text-center space-y-3">
          <div className="text-4xl">🔒</div>
          <div>
            <h2 className="text-base font-bold text-gray-100">Next Check-In</h2>
            <p className="text-brand-400 font-semibold text-lg mt-1">
              {nextAllowed.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </p>
            <p className="text-gray-500 text-sm mt-0.5">{timeLabel} from now</p>
          </div>
          <div className="bg-gray-800/60 rounded-lg px-4 py-2 text-xs text-gray-500 text-left space-y-1">
            <div className="flex justify-between">
              <span>Schedule</span><span className="text-gray-300">{scheduleLabel}</span>
            </div>
            {scheduleType === 'day' && (
              <div className="flex justify-between">
                <span>Unlocks</span>
                <span className="text-gray-300">{DAY_SHORT[nextAllowed.getDay()]}, {nextAllowed.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span>Today</span>
              <span className="text-gray-300">{new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
            </div>
          </div>
          <div className="pt-2">
            <Link to="/settings">
              <Button variant="secondary" size="sm">Adjust in Settings</Button>
            </Link>
          </div>
        </div>

        {/* Edit last check-in */}
        {lastCheckin && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <button
              onClick={() => editOpen ? setEditOpen(false) : openEdit()}
              className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-800/40 transition-colors"
            >
              <div>
                <p className="text-sm font-semibold text-gray-200">Edit Last Check-In</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Week {lastCheckin.week_number} — {lastCheckin.check_in_date}
                </p>
              </div>
              <span className="text-xs text-gray-500">{editOpen ? '▲' : '▼'}</span>
            </button>

            {editOpen && (
              <div className="px-5 pb-5 space-y-4 border-t border-gray-800">
                {/* Check-in date — shown first so wrong dates are easy to spot and fix */}
                <div className="pt-4">
                  <label className="text-sm font-medium text-gray-300 mb-1.5 block">
                    Check-In Date
                    <span className="text-xs text-gray-500 font-normal ml-2">— correct this if the date is wrong (YYYY-MM-DD)</span>
                  </label>
                  <input
                    type="date"
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                    max={new Date().toLocaleDateString('en-CA')}
                    className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200"
                  />
                  <p className="text-xs text-gray-600 mt-1">Changing this date recalculates your next check-in immediately.</p>
                </div>

                {/* Weight */}
                <div>
                  <label className="text-sm font-medium text-gray-300 mb-1.5 block">
                    Weight ({weightUnit})
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={editWeight}
                    onChange={(e) => setEditWeight(e.target.value)}
                    className="w-36 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200"
                  />
                </div>

                {/* Measurements */}
                <div>
                  <p className="text-sm font-medium text-gray-300 mb-2">Measurements ({measureUnit})</p>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { label: 'Waist', val: editWaist, set: setEditWaist },
                      { label: 'Chest', val: editChest, set: setEditChest },
                      { label: 'Hip', val: editHip, set: setEditHip },
                      { label: 'Arm (flexed)', val: editArm, set: setEditArm },
                      { label: 'Thigh', val: editThigh, set: setEditThigh },
                    ].map(({ label, val, set }) => (
                      <div key={label}>
                        <label className="text-xs text-gray-500 mb-1 block">{label}</label>
                        <input
                          type="number" step="0.5" value={val}
                          onChange={(e) => set(e.target.value)}
                          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-sm text-gray-200"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Adherence */}
                <div className="space-y-3">
                  <AdherenceSlider label="Training Adherence" value={editTraining} onChange={setEditTraining} />
                  <AdherenceSlider label="Diet Adherence" value={editDiet} onChange={setEditDiet} />
                </div>

                {/* Wellbeing */}
                <div className="space-y-3">
                  <RatingBar label="Energy Level" value={editEnergy} onChange={setEditEnergy} lowLabel="Exhausted" highLabel="Excellent" />
                  <RatingBar label="Sleep Quality" value={editSleep} onChange={setEditSleep} lowLabel="Poor" highLabel="Great" />
                  <RatingBar label="Stress Level" value={editStress} onChange={setEditStress} lowLabel="Relaxed" highLabel="Overwhelmed" />
                </div>

                {/* Notes */}
                <Textarea
                  label="Notes (optional)"
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="How did the week go?"
                  rows={3}
                />

                {editError && <p className="text-xs text-red-400">{editError}</p>}

                <button
                  onClick={saveEdit}
                  disabled={editSaving || editSaved}
                  className="w-full py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-sm font-semibold transition-colors disabled:opacity-50"
                >
                  {editSaving ? 'Saving...' : editSaved ? '✓ Saved' : 'Save Changes'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  // Success state
  if (submitted) {
    return (
      <div className="p-6 max-w-2xl mx-auto space-y-4">
        <h1 className="text-2xl font-bold text-gray-100">Check-In Complete ✓</h1>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="font-semibold text-gray-200 mb-1">Week {submitted.week_number} — Coach Feedback</h2>
          <p className="text-xs text-gray-500 mb-3">
            Logged weight: {isImperial
              ? `${Math.round(submitted.weight_kg / 0.453592 * 10) / 10} lbs`
              : `${submitted.weight_kg} kg`}
          </p>
          <div className="space-y-2">
            {submitted.adjustments.notes.map((note, i) => (
              <div key={i} className="flex gap-2 text-sm">
                <span className="text-brand-500 mt-0.5 flex-shrink-0">›</span>
                <span className="text-gray-300">{note}</span>
              </div>
            ))}
          </div>

          {submitted.adjustments.calories_delta !== 0 && (
            <div className="mt-3 bg-brand-900/20 border border-brand-800/30 rounded-lg p-3 text-sm">
              <span className="text-brand-400 font-medium">Calorie Adjustment: </span>
              <span className="text-gray-300">
                {submitted.adjustments.calories_delta > 0 ? '+' : ''}
                {submitted.adjustments.calories_delta} kcal applied to your nutrition plan.
              </span>
            </div>
          )}

          {submitted.adjustments.cardio_change !== 'no change' && (
            <div className="mt-2 bg-blue-900/20 border border-blue-800/30 rounded-lg p-3 text-sm">
              <span className="text-blue-400 font-medium">Cardio: </span>
              <span className="text-gray-300">{submitted.adjustments.cardio_change}</span>
            </div>
          )}
        </div>
        <Button onClick={async () => {
          setSubmitted(null)
          // Load the real next check-in date from the backend instead of a fake 60s placeholder
          try {
            const iso = await window.api.getNextCheckinDate(user!.id)
            setNextAllowed(iso && new Date(iso) > new Date() ? new Date(iso) : null)
          } catch {
            setNextAllowed(null)
          }
        }} variant="secondary">
          Done
        </Button>
      </div>
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const weight = toKg(weightDisplay)
    if (!weight) { setError('Please enter a valid weight.'); return }

    const data = {
      user_id: user!.id,
      weight_kg: weight,
      waist_cm: toCm(waistDisplay) ?? undefined,
      chest_cm: toCm(chestDisplay) ?? undefined,
      hip_cm: toCm(hipDisplay) ?? undefined,
      arm_cm: toCm(armDisplay) ?? undefined,
      thigh_cm: toCm(thighDisplay) ?? undefined,
      training_adherence: trainingAdherence,
      diet_adherence: dietAdherence,
      energy_level: energyLevel,
      sleep_quality: sleepQuality,
      stress_level: stressLevel,
      notes: notes.trim() || undefined,
      check_in_date: localDateStr()
    }

    try {
      const result = await submitCheckin(data)
      setSubmitted(result)
    } catch (e) {
      const msg = String(e)
      if (msg.includes('EARLY_CHECKIN:')) {
        const iso = msg.split('EARLY_CHECKIN:')[1]
        setNextAllowed(new Date(iso))
      } else {
        setError(`Submission failed: ${msg}`)
      }
    }
  }

  const weekLabel = checkinHistory.length > 0
    ? `Week ${checkinHistory[0].week_number + 1}`
    : 'Week 1'

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-100">Weekly Check-In</h1>
        <p className="text-gray-500 mt-0.5">
          {weekLabel} — {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Bodyweight */}
        <Card title={`Bodyweight (${weightUnit})`}>
          <div>
            <label className="text-sm text-gray-400 mb-1 block">
              Current weight ({weightUnit}) <span className="text-red-400">*</span>
            </label>
            <input
              type="number"
              step="0.1"
              value={weightDisplay}
              onChange={(e) => setWeightDisplay(e.target.value)}
              placeholder={isImperial ? '185.0' : '84.0'}
              required
              className="w-36 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200"
            />
          </div>
        </Card>

        {/* Measurements */}
        <Card title={`Measurements (${measureUnit})`} subtitle="All optional">
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Waist', value: waistDisplay, set: setWaistDisplay },
              { label: 'Chest', value: chestDisplay, set: setChestDisplay },
              { label: 'Hip', value: hipDisplay, set: setHipDisplay },
              { label: 'Arm (flexed)', value: armDisplay, set: setArmDisplay },
              { label: 'Thigh', value: thighDisplay, set: setThighDisplay },
            ].map(({ label, value, set }) => (
              <div key={label}>
                <label className="text-xs text-gray-500 mb-1 block">{label}</label>
                <input
                  type="number"
                  step="0.5"
                  value={value}
                  onChange={(e) => set(e.target.value)}
                  placeholder={isImperial ? '32.0' : '81.0'}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-sm text-gray-200"
                />
              </div>
            ))}
          </div>
        </Card>

        {/* Optional section divider */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-gray-800" />
          <span className="text-xs text-gray-600 uppercase tracking-wider">Optional — skip if you're in a hurry</span>
          <div className="flex-1 h-px bg-gray-800" />
        </div>

        {/* Adherence */}
        <Card title="Adherence">
          <div className="space-y-4">
            <AdherenceSlider
              label="Training Adherence"
              value={trainingAdherence}
              onChange={setTrainingAdherence}
            />
            <AdherenceSlider
              label="Diet Adherence"
              value={dietAdherence}
              onChange={setDietAdherence}
            />
          </div>
        </Card>

        {/* Wellbeing */}
        <Card title="How are you feeling?">
          <div className="space-y-4">
            <RatingBar
              label="Energy Level"
              value={energyLevel}
              onChange={setEnergyLevel}
              lowLabel="Exhausted"
              highLabel="Excellent"
            />
            <RatingBar
              label="Sleep Quality"
              value={sleepQuality}
              onChange={setSleepQuality}
              lowLabel="Very poor"
              highLabel="Excellent"
            />
            <RatingBar
              label="Stress Level"
              value={stressLevel}
              onChange={setStressLevel}
              lowLabel="None"
              highLabel="Very high"
            />
          </div>
        </Card>

        {/* Notes */}
        <Card title="Notes">
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="How did the week go? Any issues, wins, or observations to flag?"
            rows={3}
          />
        </Card>

        {error && (
          <div className="bg-red-900/20 border border-red-800/40 rounded-lg p-3 text-sm text-red-400">
            {error}
          </div>
        )}

        <Button type="submit" className="w-full" size="lg" disabled={loading}>
          {loading ? (
            <>
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Processing...
            </>
          ) : (
            'Submit Check-In & Get Feedback'
          )}
        </Button>
      </form>
    </div>
  )
}
