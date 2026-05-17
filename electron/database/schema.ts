export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  age INTEGER NOT NULL,
  sex TEXT NOT NULL CHECK(sex IN ('male','female','other')),
  height_cm REAL NOT NULL,
  weight_kg REAL NOT NULL,
  body_fat_pct REAL,
  training_experience_years REAL NOT NULL DEFAULT 0,
  competition_history TEXT NOT NULL DEFAULT '[]',
  division TEXT,
  show_date TEXT,
  goal TEXT NOT NULL CHECK(goal IN ('cut','maintain','recomp','bulk')),
  dietary_preference TEXT NOT NULL DEFAULT 'omnivore',
  dietary_restrictions TEXT NOT NULL DEFAULT '[]',
  training_frequency INTEGER NOT NULL DEFAULT 4,
  equipment_access TEXT NOT NULL DEFAULT 'full_gym' CHECK(equipment_access IN ('full_gym','home','minimal')),
  activity_level TEXT NOT NULL DEFAULT 'moderate' CHECK(activity_level IN ('sedentary','light','moderate','active')),
  recovery_notes TEXT,
  is_natural INTEGER NOT NULL DEFAULT 1 CHECK(is_natural IN (0,1)),
  meal_count INTEGER NOT NULL DEFAULT 4,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS training_plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  weeks_total INTEGER NOT NULL,
  current_week INTEGER NOT NULL DEFAULT 1,
  phase TEXT NOT NULL DEFAULT 'hypertrophy' CHECK(phase IN ('hypertrophy','strength','peak','deload')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS training_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id INTEGER NOT NULL REFERENCES training_plans(id) ON DELETE CASCADE,
  week_number INTEGER NOT NULL,
  day_of_week INTEGER NOT NULL,
  session_name TEXT NOT NULL,
  exercises TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS diet_plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  calories_target INTEGER NOT NULL,
  protein_g INTEGER NOT NULL,
  carbs_g INTEGER NOT NULL,
  fat_g INTEGER NOT NULL,
  meal_count INTEGER NOT NULL DEFAULT 4,
  meals TEXT NOT NULL DEFAULT '[]',
  phase TEXT NOT NULL DEFAULT 'deficit' CHECK(phase IN ('deficit','maintenance','surplus')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS weekly_checkins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  week_number INTEGER NOT NULL,
  check_in_date TEXT NOT NULL DEFAULT (date('now')),
  weight_kg REAL NOT NULL,
  waist_cm REAL,
  chest_cm REAL,
  hip_cm REAL,
  arm_cm REAL,
  thigh_cm REAL,
  training_adherence INTEGER NOT NULL DEFAULT 100 CHECK(training_adherence BETWEEN 0 AND 100),
  diet_adherence INTEGER NOT NULL DEFAULT 100 CHECK(diet_adherence BETWEEN 0 AND 100),
  energy_level INTEGER NOT NULL DEFAULT 3 CHECK(energy_level BETWEEN 1 AND 5),
  sleep_quality INTEGER NOT NULL DEFAULT 3 CHECK(sleep_quality BETWEEN 1 AND 5),
  stress_level INTEGER NOT NULL DEFAULT 3 CHECK(stress_level BETWEEN 1 AND 5),
  notes TEXT,
  adjustments TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS progress_photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  check_in_id INTEGER REFERENCES weekly_checkins(id),
  file_path TEXT NOT NULL,
  pose TEXT NOT NULL DEFAULT 'front' CHECK(pose IN ('front','back','side','custom')),
  taken_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT OR IGNORE INTO settings (key, value) VALUES
  ('theme', 'dark'),
  ('units', 'metric'),
  ('notifications_enabled', 'true'),
  ('checkin_day', '1'),
  ('checkin_interval_days', '7'),
  ('ui_zoom', '100'),
  ('theme_name', 'default'),
  ('claude_api_key', '');
`

export const MIGRATIONS: { version: number; sql: string }[] = [
  {
    version: 1,
    sql: `
      ALTER TABLE users ADD COLUMN split_preference TEXT NOT NULL DEFAULT 'auto';
      ALTER TABLE users ADD COLUMN food_preferences TEXT NOT NULL DEFAULT '[]';
      ALTER TABLE users ADD COLUMN food_exclusions TEXT NOT NULL DEFAULT '[]';
      ALTER TABLE users ADD COLUMN cooking_time_pref TEXT NOT NULL DEFAULT 'medium';
      ALTER TABLE users ADD COLUMN meal_prep_style TEXT NOT NULL DEFAULT 'daily'
    `
  },
  {
    version: 2,
    sql: `
      CREATE TABLE IF NOT EXISTS workout_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        session_id INTEGER REFERENCES training_sessions(id),
        date TEXT NOT NULL DEFAULT (date('now')),
        status TEXT NOT NULL DEFAULT 'in_progress' CHECK(status IN ('in_progress','completed','skipped')),
        started_at TEXT NOT NULL DEFAULT (datetime('now')),
        ended_at TEXT,
        notes TEXT
      )
    `
  },
  {
    version: 3,
    sql: `
      CREATE TABLE IF NOT EXISTS exercise_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        workout_log_id INTEGER NOT NULL REFERENCES workout_logs(id) ON DELETE CASCADE,
        exercise_name TEXT NOT NULL,
        set_number INTEGER NOT NULL,
        reps_prescribed TEXT,
        reps_actual INTEGER,
        weight_kg REAL,
        rir_actual INTEGER,
        skipped INTEGER NOT NULL DEFAULT 0,
        notes TEXT
      )
    `
  },
  {
    version: 4,
    sql: `
      ALTER TABLE users ADD COLUMN include_snacks INTEGER NOT NULL DEFAULT 1;
      CREATE TABLE IF NOT EXISTS meal_completions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        date TEXT NOT NULL,
        meal_index INTEGER NOT NULL,
        meal_name TEXT NOT NULL,
        completed INTEGER NOT NULL DEFAULT 1,
        logged_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(user_id, date, meal_index)
      )
    `
  },
  {
    version: 5,
    sql: `
      ALTER TABLE users ADD COLUMN culture_pref TEXT NOT NULL DEFAULT 'any';
      ALTER TABLE users ADD COLUMN exercises_per_session INTEGER NOT NULL DEFAULT 6;
      ALTER TABLE users ADD COLUMN sets_per_exercise INTEGER NOT NULL DEFAULT 4
    `
  },
  {
    version: 6,
    sql: `
      CREATE TABLE IF NOT EXISTS shows (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL DEFAULT 'Competition',
        show_date TEXT NOT NULL,
        division TEXT,
        federation TEXT,
        notes TEXT,
        is_primary INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `
  },
  {
    version: 7,
    sql: `
      ALTER TABLE training_plans ADD COLUMN generated_at_weeks_out INTEGER;
      ALTER TABLE diet_plans ADD COLUMN generated_at_weeks_out INTEGER
    `
  },
  {
    version: 8,
    sql: `ALTER TABLE training_plans ADD COLUMN user_modified INTEGER NOT NULL DEFAULT 0`
  },
  {
    version: 9,
    sql: `
      PRAGMA foreign_keys = OFF;
      CREATE TABLE users_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        age INTEGER NOT NULL,
        sex TEXT NOT NULL CHECK(sex IN ('male','female','other')),
        height_cm REAL NOT NULL,
        weight_kg REAL NOT NULL,
        body_fat_pct REAL,
        training_experience_years REAL NOT NULL DEFAULT 0,
        competition_history TEXT NOT NULL DEFAULT '[]',
        division TEXT,
        show_date TEXT,
        goal TEXT NOT NULL CHECK(goal IN ('cut','maintain','recomp','bulk')),
        dietary_preference TEXT NOT NULL DEFAULT 'omnivore',
        dietary_restrictions TEXT NOT NULL DEFAULT '[]',
        training_frequency INTEGER NOT NULL DEFAULT 4,
        equipment_access TEXT NOT NULL DEFAULT 'full_gym' CHECK(equipment_access IN ('full_gym','home','minimal')),
        activity_level TEXT NOT NULL DEFAULT 'moderate' CHECK(activity_level IN ('sedentary','light','moderate','active')),
        recovery_notes TEXT,
        is_natural INTEGER NOT NULL DEFAULT 1 CHECK(is_natural IN (0,1)),
        meal_count INTEGER NOT NULL DEFAULT 4,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        split_preference TEXT NOT NULL DEFAULT 'auto',
        food_preferences TEXT NOT NULL DEFAULT '[]',
        food_exclusions TEXT NOT NULL DEFAULT '[]',
        cooking_time_pref TEXT NOT NULL DEFAULT 'medium',
        meal_prep_style TEXT NOT NULL DEFAULT 'daily',
        include_snacks INTEGER NOT NULL DEFAULT 1,
        culture_pref TEXT NOT NULL DEFAULT 'any',
        exercises_per_session INTEGER NOT NULL DEFAULT 6,
        sets_per_exercise INTEGER NOT NULL DEFAULT 4
      );
      INSERT INTO users_new SELECT
        id,name,age,sex,height_cm,weight_kg,body_fat_pct,
        training_experience_years,competition_history,division,show_date,goal,
        dietary_preference,dietary_restrictions,training_frequency,equipment_access,
        activity_level,recovery_notes,is_natural,meal_count,created_at,updated_at,
        split_preference,food_preferences,food_exclusions,cooking_time_pref,meal_prep_style,
        include_snacks,culture_pref,exercises_per_session,sets_per_exercise
      FROM users;
      DROP TABLE users;
      ALTER TABLE users_new RENAME TO users;
      PRAGMA foreign_keys = ON
    `
  }
]
