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
import { computeMissedSlots } from '../../utils/checkinSchedule'

// ── Helpers ────────────────────────────────────────────────────────────────

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

/** Derive a human-readable label for a check-in based on what schedule
 *  was active when it was submitted.
 *  - Day-based (or legacy rows without schedule_type) → "Week N"
 *  - Interval-based → "Daily / Weekly / X-Day Check-In N"
 */
function checkinLabel(checkin: CheckIn): string {
  if (checkin.schedule_type === 'interval' && checkin.interval_days) {
    const freq =
      checkin.interval_days === 1 ? 'Daily' :
      checkin.interval_days === 7 ? 'Weekly' :
      `${checkin.interval_days}-Day`
    return `${freq} Check-In ${checkin.week_number}`
  }
  return `Week ${checkin.week_number}`
}

// ── MissedSlotPanel ────────────────────────────────────────────────────────

interface MissedSlotPanelProps {
  slot: { expected_date: string; expected_label: string }
  userId: number
  isImperial: boolean
  onFilled: () => void
}

function MissedSlotPanel({ slot, userId, isImperial, onFilled }: MissedSlotPanelProps) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const weightUnit = isImperial ? 'lbs' : 'kg'
  const measureUnit = isImperial ? 'in' : 'cm'

  const [weight, setWeight] = useState('')
  const [waist, setWaist] = useState('')
  const [chest, setChest] = useState('')
  const [hip, setHip] = useState('')
  const [arm, setArm] = useState('')
  const [thigh, setThigh] = useState('')
  const [training, setTraining] = useState(90)
  const [diet, setDiet] = useState(90)
  const [energy, setEnergy] = useState(3)
  const [sleep, setSleep] = useState(3)
  const [stress, setStress] = useState(2)
  const [notes, setNotes] = useState('')
  const [date, setDate] = useState(slot.expected_date)

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

  async function handleFillIn() {
    setErr(null)
    const wKg = toKg(weight)
    if (!wKg) { setErr('Enter a valid weight'); return }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { setErr('Date must be YYYY-MM-DD'); return }
    setSaving(true)
    try {
      await window.api.submitMissedCheckin({
        user_id: userId,
        check_in_date: date,
        weight_kg: wKg,
        waist_cm: toCm(waist) ?? undefined,
        chest_cm: toCm(chest) ?? undefined,
        hip_cm: toCm(hip) ?? undefined,
        arm_cm: toCm(arm) ?? undefined,
        thigh_cm: toCm(thigh) ?? undefined,
        training_adherence: training,
        diet_adherence: diet,
        energy_level: energy,
        sleep_quality: sleep,
        stress_level: stress,
        notes: notes.trim() || undefined,
      } as any)
      setSaved(true)
      setTimeout(() => { onFilled(); setOpen(false) }, 800)
    } catch (e) {
      setErr(String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-gray-900 border border-amber-900/40 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-800/40 transition-colors"
      >
        <div>
          <p className="text-sm font-semibold text-amber-400">⚠ {slot.expected_label}</p>
          <p className="text-xs text-gray-500 mt-0.5">Tap to fill in retroactively</p>
        </div>
        <span className="text-xs text-gray-500">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="px-5 pb-5 space-y-4 border-t border-gray-800">
          {/* Date */}
          <div className="pt-4">
            <label className="text-sm font-medium text-gray-300 mb-1.5 block">
              Check-In Date
              <span className="text-xs text-gray-500 font-normal ml-2">— pre-filled with expected date</span>
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              max={new Date().toLocaleDateString('en-CA')}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200"
            />
          </div>

          {/* Weight */}
          <div>
            <label className="text-sm font-medium text-gray-300 mb-1.5 block">
              Weight ({weightUnit}) <span className="text-red-400">*</span>
            </label>
            <input
              type="number" step="0.1" value={weight}
              onChange={(e) => setWeight(e.target.value)}
              placeholder={isImperial ? '185.0' : '84.0'}
              className="w-36 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200"
            />
          </div>

          {/* Measurements */}
          <div>
            <p className="text-sm font-medium text-gray-300 mb-2">Measurements ({measureUnit}) — optional</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: 'Waist', val: waist, set: setWaist },
                { label: 'Chest', val: chest, set: setChest },
                { label: 'Hip',   val: hip,   set: setHip   },
                { label: 'Arm (flexed)', val: arm, set: setArm },
                { label: 'Thigh', val: thigh, set: setThigh },
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
            <AdherenceSlider label="Training Adherence" value={training} onChange={setTraining} />
            <AdherenceSlider label="Diet Adherence"     value={diet}     onChange={setDiet}     />
          </div>

          {/* Wellbeing */}
          <div className="space-y-3">
            <RatingBar label="Energy Level"  value={energy} onChange={setEnergy} lowLabel="Exhausted"  highLabel="Excellent"    />
            <RatingBar label="Sleep Quality" value={sleep}  onChange={setSleep}  lowLabel="Poor"        highLabel="Great"        />
            <RatingBar label="Stress Level"  value={stress} onChange={setStress} lowLabel="Relaxed"     highLabel="Overwhelmed"  />
          </div>

          <Textarea
            label="Notes (optional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="How did that week go?"
            rows={2}
          />

          {err && <p className="text-xs text-red-400">{err}</p>}

          <button
            onClick={handleFillIn}
            disabled={saving || saved}
            className="w-full py-2 rounded-xl bg-amber-700 hover:bg-amber-600 text-white text-sm font-semibold transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving...' : saved ? '✓ Saved' : 'Fill In Missed Check-In'}
          </button>
        </div>
      )}
    </div>
  )
}

// ── Main CheckIn page ──────────────────────────────────────────────────────

export default function CheckIn() {
  const { user } = useUserStore()
  const { submitCheckin, checkinHistory, latestCheckin, loadCheckinHistory, loading, workoutHistory, trainingPlan, loadWorkoutHistory } = usePlanStore()
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

  // Missed-slots banner on open-form screen
  const [missedBannerOpen, setMissedBannerOpen] = useState(false)

  // Prefer last check-in weight over profile weight so users see their recent number
  const defaultWeightKg = latestCheckin?.weight_kg ?? user?.weight_kg ?? 80
  const defaultWeight = isImperial
    ? Math.round(defaultWeightKg / 0.453592 * 10) / 10
    : defaultWeightKg

  const [weightDisplay, setWeightDisplay] = useState(String(defaultWeight))
  const prefillCm = (cm: number | null | undefined) =>
    cm != null ? (isImperial ? String(Math.round(cm / 2.54 * 10) / 10) : String(cm)) : ''
  const [waistDisplay, setWaistDisplay] = useState(prefillCm(latestCheckin?.waist_cm))
  const [chestDisplay, setChestDisplay] = useState(prefillCm(latestCheckin?.chest_cm))
  const [hipDisplay, setHipDisplay] = useState(prefillCm(latestCheckin?.hip_cm))
  const [armDisplay, setArmDisplay] = useState(prefillCm(latestCheckin?.arm_cm))
  const [thighDisplay, setThighDisplay] = useState(prefillCm(latestCheckin?.thigh_cm))
  const [trainingAdherence, setTrainingAdherence] = useState(90)
  const [dietAdherence, setDietAdherence] = useState(90)
  const [autoFillSessions, setAutoFillSessions] = useState<{ actual: number; expected: number } | null>(null)
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

  // Re-query nextAllowed whenever user or schedule settings change.
  // This ensures the locked screen immediately reflects a Settings change.
  useEffect(() => {
    if (!user) return
    setCheckingInterval(true)
    loadCheckinHistory(user.id)
    loadWorkoutHistory(user.id)
    window.api.getNextCheckinDate(user.id)
      .then((iso) => {
        setNextAllowed(iso && new Date(iso) > new Date() ? new Date(iso) : null)
        setCheckingInterval(false)
      })
      .catch(() => setCheckingInterval(false))
  }, [
    user?.id,
    settings.checkin_schedule_type,
    settings.checkin_day,
    settings.checkin_interval_days,
    settings.checkin_biweekly,
  ])

  // Auto-fill training adherence from actual logged workout sessions since last check-in
  useEffect(() => {
    if (!workoutHistory.length || !trainingPlan?.sessions?.length || !latestCheckin) return
    const periodStart = latestCheckin.check_in_date
    const today = new Date().toLocaleDateString('en-CA')
    const completedSessions = workoutHistory.filter(
      (log) => log.status === 'completed' && log.date > periodStart && log.date <= today
    ).length
    const daysSince = Math.max(1, Math.ceil(
      (Date.now() - new Date(periodStart + 'T12:00:00').getTime()) / (1000 * 60 * 60 * 24)
    ))
    const weeksSince = daysSince / 7
    const expectedSessions = Math.max(1, Math.round(trainingPlan.sessions.length * weeksSince))
    const adherence = Math.min(100, Math.round((completedSessions / expectedSessions) * 100))
    setTrainingAdherence(adherence)
    setAutoFillSessions({ actual: completedSessions, expected: expectedSessions })
  }, [workoutHistory.length, trainingPlan?.id, latestCheckin?.id])

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

  // Compute missed slots from history (used on both locked and open screens)
  const scheduleType = (settings.checkin_schedule_type ?? 'day') as 'day' | 'interval'
  const intervalDays = parseInt(settings.checkin_interval_days ?? '7', 10)
  const checkinDayNum = parseInt(settings.checkin_day ?? '1', 10)
  const missedSlots = computeMissedSlots(checkinHistory, scheduleType, checkinDayNum, intervalDays)

  // Callback shared by MissedSlotPanel — refreshes history after a missed fill
  async function onMissedFilled() {
    if (!user) return
    await loadCheckinHistory(user.id)
    const iso = await window.api.getNextCheckinDate(user.id).catch(() => null)
    setNextAllowed(iso && new Date(iso) > new Date() ? new Date(iso) : null)
  }

  // ── LOCKED STATE ──────────────────────────────────────────────────────────
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
    const biweekly = settings.checkin_biweekly === 'true'
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
        // Refresh nextAllowed so the lock screen updates after a date change
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
        <h1 className="text-2xl font-bold text-gray-100">Check-In</h1>

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
            {lastCheckin && (
              <div className="flex justify-between border-b border-gray-700/50 pb-1 mb-1">
                <span>Last weigh-in</span>
                <span className="text-brand-300 font-semibold">
                  {isImperial
                    ? `${Math.round(lastCheckin.weight_kg / 0.453592 * 10) / 10} lbs`
                    : `${lastCheckin.weight_kg} kg`}
                  <span className="text-gray-500 font-normal ml-1">· {lastCheckin.check_in_date}</span>
                </span>
              </div>
            )}
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
                  {checkinLabel(lastCheckin)} — {lastCheckin.check_in_date}
                </p>
              </div>
              <span className="text-xs text-gray-500">{editOpen ? '▲' : '▼'}</span>
            </button>

            {editOpen && (
              <div className="px-5 pb-5 space-y-4 border-t border-gray-800">
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

                <div>
                  <label className="text-sm font-medium text-gray-300 mb-1.5 block">Weight ({weightUnit})</label>
                  <input
                    type="number" step="0.1" value={editWeight}
                    onChange={(e) => setEditWeight(e.target.value)}
                    className="w-36 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200"
                  />
                </div>

                <div>
                  <p className="text-sm font-medium text-gray-300 mb-2">Measurements ({measureUnit})</p>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { label: 'Waist', val: editWaist, set: setEditWaist },
                      { label: 'Chest', val: editChest, set: setEditChest },
                      { label: 'Hip',   val: editHip,   set: setEditHip   },
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

                <div className="space-y-3">
                  <AdherenceSlider label="Training Adherence" value={editTraining} onChange={setEditTraining} />
                  <AdherenceSlider label="Diet Adherence"     value={editDiet}     onChange={setEditDiet}     />
                </div>

                <div className="space-y-3">
                  <RatingBar label="Energy Level"  value={editEnergy} onChange={setEditEnergy} lowLabel="Exhausted"   highLabel="Excellent"   />
                  <RatingBar label="Sleep Quality" value={editSleep}  onChange={setEditSleep}  lowLabel="Poor"         highLabel="Great"        />
                  <RatingBar label="Stress Level"  value={editStress} onChange={setEditStress} lowLabel="Relaxed"      highLabel="Overwhelmed"  />
                </div>

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

        {/* Missed check-ins (locked screen) */}
        {missedSlots.map((slot) => (
          <MissedSlotPanel
            key={slot.expected_date}
            slot={slot}
            userId={user.id}
            isImperial={isImperial}
            onFilled={onMissedFilled}
          />
        ))}
      </div>
    )
  }

  // ── SUCCESS STATE ──────────────────────────────────────────────────────────
  if (submitted) {
    return (
      <div className="p-6 max-w-2xl mx-auto space-y-4">
        <h1 className="text-2xl font-bold text-gray-100">Check-In Complete ✓</h1>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="font-semibold text-gray-200 mb-1">{checkinLabel(submitted)} — Coach Feedback</h2>
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

  // ── OPEN FORM STATE ────────────────────────────────────────────────────────

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

  const lastEntry = checkinHistory[0] ?? null
  const weekLabel = lastEntry ? checkinLabel({ ...lastEntry, week_number: lastEntry.week_number + 1 }) : 'Week 1'

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-100">Check-In</h1>
        <p className="text-gray-500 mt-0.5">
          {weekLabel} — {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {/* Missed check-ins banner (open form) */}
      {missedSlots.length > 0 && (
        <div className="bg-amber-950/30 border border-amber-800/40 rounded-xl overflow-hidden">
          <button
            onClick={() => setMissedBannerOpen((o) => !o)}
            className="w-full flex items-center justify-between px-5 py-3 text-left hover:bg-amber-900/20 transition-colors"
          >
            <p className="text-sm font-semibold text-amber-400">
              ⚠ {missedSlots.length} missed check-in{missedSlots.length !== 1 ? 's' : ''} — tap to fill in
            </p>
            <span className="text-xs text-gray-500">{missedBannerOpen ? '▲' : '▼'}</span>
          </button>
          {missedBannerOpen && (
            <div className="px-4 pb-4 space-y-3 border-t border-amber-900/30">
              {missedSlots.map((slot) => (
                <MissedSlotPanel
                  key={slot.expected_date}
                  slot={slot}
                  userId={user.id}
                  isImperial={isImperial}
                  onFilled={onMissedFilled}
                />
              ))}
            </div>
          )}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Bodyweight */}
        <Card title={`Bodyweight (${weightUnit})`} subtitle="Required">
          <input
            type="number"
            step="0.1"
            value={weightDisplay}
            onChange={(e) => setWeightDisplay(e.target.value)}
            placeholder={isImperial ? '185.0' : '84.0'}
            required
            className="w-36 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200"
          />
          {latestCheckin && (
            <p className="text-xs text-gray-600 mt-1.5">
              Pre-filled from {checkinLabel(latestCheckin)} · {latestCheckin.check_in_date}
            </p>
          )}
        </Card>

        {/* Measurements */}
        <Card title={`Measurements (${measureUnit})`} subtitle="All optional">
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Waist', value: waistDisplay, set: setWaistDisplay },
              { label: 'Chest', value: chestDisplay, set: setChestDisplay },
              { label: 'Hip',   value: hipDisplay,   set: setHipDisplay   },
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

        {/* Adherence */}
        <Card title="Adherence" subtitle="Optional">
          <div className="space-y-4">
            <div>
              <AdherenceSlider label="Training Adherence" value={trainingAdherence} onChange={setTrainingAdherence} />
              {autoFillSessions !== null && (
                <p className="text-xs text-gray-600 mt-1">
                  Auto-filled: {autoFillSessions.actual} of ~{autoFillSessions.expected} planned sessions logged — adjust if needed
                </p>
              )}
            </div>
            <AdherenceSlider label="Diet Adherence"     value={dietAdherence}     onChange={setDietAdherence}     />
          </div>
        </Card>

        {/* Wellbeing */}
        <Card title="How are you feeling?" subtitle="Optional">
          <div className="space-y-4">
            <RatingBar label="Energy Level"  value={energyLevel}  onChange={setEnergyLevel}  lowLabel="Exhausted" highLabel="Excellent"   />
            <RatingBar label="Sleep Quality" value={sleepQuality} onChange={setSleepQuality} lowLabel="Very poor"  highLabel="Excellent"   />
            <RatingBar label="Stress Level"  value={stressLevel}  onChange={setStressLevel}  lowLabel="None"       highLabel="Very high"   />
          </div>
        </Card>

        {/* Notes */}
        <Card title="Notes" subtitle="Optional">
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
            'Submit Check-In →'
          )}
        </Button>
      </form>
    </div>
  )
}
