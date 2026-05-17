import Badge from '../../../components/ui/Badge'
import type { OnboardingData } from '../useOnboarding'

interface Props {
  data: OnboardingData
}

function Row({ label, value }: { label: string; value: string | number | undefined }) {
  return (
    <div className="flex justify-between items-center py-2 border-b border-gray-800 last:border-0">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-sm font-medium text-gray-200">{value ?? '—'}</span>
    </div>
  )
}

export default function Step6Review({ data }: Props) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-gray-100">Review Your Profile</h2>
        <p className="text-sm text-gray-400 mt-1">
          Confirm your details before generating your personalized plan.
        </p>
      </div>

      <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4 space-y-0">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Personal</p>
        <Row label="Name" value={data.name} />
        <Row label="Age" value={data.age ? `${data.age} years` : undefined} />
        <Row label="Sex" value={data.sex} />
        <Row label="Height" value={data.height_cm ? `${data.height_cm} cm` : undefined} />
        <Row label="Weight" value={data.weight_kg ? `${data.weight_kg} kg` : undefined} />
        <Row label="Body Fat" value={data.body_fat_pct ? `~${data.body_fat_pct}%` : 'Not provided'} />
        <Row label="Experience" value={data.training_experience_years ? `${data.training_experience_years} years` : undefined} />
      </div>

      <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4 space-y-0">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Goals & Training</p>
        <Row label="Goal" value={data.goal} />
        <Row label="Division" value={data.division ?? 'Not set'} />
        <Row label="Show Date" value={data.show_date ?? 'Not set'} />
        <Row label="Training Days" value={data.training_frequency ? `${data.training_frequency} days/week` : undefined} />
        <Row label="Equipment" value={data.equipment_access?.replace('_', ' ')} />
        <Row label="Activity Level" value={data.activity_level} />
        <Row label="Split Preference" value={data.split_preference ?? 'auto'} />
      </div>

      <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4 space-y-0">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Nutrition</p>
        <Row label="Diet Type" value={data.dietary_preference} />
        <Row label="Meals/Day" value={data.meal_count} />
        <Row
          label="Restrictions"
          value={
            (data.dietary_restrictions?.length ?? 0) > 0
              ? data.dietary_restrictions?.join(', ')
              : 'None'
          }
        />
        <p><span className="text-gray-500">Snacks:</span> <span className="text-gray-300">{data.include_snacks !== false ? 'Included' : 'Main meals only'}</span></p>
        <Row label="Cook Time" value={data.cooking_time_pref ?? 'medium'} />
        <Row label="Cultural Preference" value={data.culture_pref ?? 'any'} />
        <Row label="Meal Prep Style" value={data.meal_prep_style ?? 'daily'} />
        <Row label="Excluded Foods" value={`${data.food_exclusions?.length ?? 0} items`} />
        <Row
          label="Preferred Foods"
          value={
            (data.food_preferences?.length ?? 0) > 0
              ? `${data.food_preferences?.length} selected`
              : 'None'
          }
        />
      </div>

      <div className="flex gap-2 flex-wrap">
        {data.is_natural && <Badge variant="success">Natural Athlete</Badge>}
        {(data.competition_history?.length ?? 0) > 0 && (
          <Badge variant="info">{data.competition_history?.join(', ')}</Badge>
        )}
      </div>

      <div className="bg-green-900/20 border border-green-800/40 rounded-lg p-3 text-xs text-green-400">
        Click <strong>Create My Plan</strong> to generate your personalized training and nutrition
        plan based on the above profile.
      </div>
    </div>
  )
}
