PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS patients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  age INTEGER,
  phone TEXT,
  email TEXT,
  self_description TEXT,
  reference_code TEXT,
  request_id TEXT,
  consent_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  diabetes_type TEXT,
  last_hba1c_date TEXT,
  last_foot_exam_date TEXT,
  last_bp_date TEXT,
  next_visit_date TEXT
);

CREATE TABLE IF NOT EXISTS intakes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id INTEGER NOT NULL REFERENCES patients(id),
  input_method TEXT CHECK (input_method IN ('tap', 'typed', 'voice', 'assisted')),
  raw_text TEXT,
  structured_json TEXT,
  red_flags_json TEXT,
  meta_json TEXT,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'triaged', 'seen')),
  priority TEXT CHECK (priority IN ('urgent', 'important', 'normal')),
  version INTEGER NOT NULL DEFAULT 1,
  edited_by TEXT,
  edited_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id INTEGER NOT NULL REFERENCES patients(id),
  note_text TEXT,
  check_result_json TEXT,
  override_reason TEXT,
  edited_by TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS intake_revisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  intake_id INTEGER NOT NULL REFERENCES intakes(id),
  revision INTEGER NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('patient', 'clinician')),
  edited_by TEXT,
  edited_at TEXT NOT NULL,
  reason TEXT,
  snapshot_json TEXT NOT NULL,
  changed_fields_json TEXT NOT NULL,
  is_backfill INTEGER NOT NULL DEFAULT 0 CHECK (is_backfill IN (0, 1)),
  UNIQUE (intake_id, revision)
);
CREATE INDEX IF NOT EXISTS idx_intake_revisions_intake
  ON intake_revisions(intake_id, revision DESC);
CREATE TABLE IF NOT EXISTS followups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id INTEGER NOT NULL REFERENCES patients(id),
  message TEXT,
  status TEXT DEFAULT 'sent',
  reply_text TEXT,
  escalated INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS case_summaries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id INTEGER NOT NULL REFERENCES patients(id),
  intake_id INTEGER NOT NULL REFERENCES intakes(id),
  generation_mode TEXT NOT NULL CHECK (generation_mode IN ('llm', 'mock', 'fallback')),
  model TEXT,
  summary_text TEXT,
  facts_json TEXT NOT NULL,
  rule_flags_json TEXT NOT NULL,
  ai_flags_json TEXT,
  values_json TEXT,
  inconsistencies_json TEXT,
  suggested_priority TEXT CHECK (suggested_priority IN ('urgent', 'important', 'normal')),
  priority_reasons_json TEXT NOT NULL,
  rules_version TEXT NOT NULL,
  dropped_ai_items INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_case_summaries_patient
  ON case_summaries(patient_id, created_at DESC);
