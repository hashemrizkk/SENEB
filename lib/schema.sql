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
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id INTEGER NOT NULL REFERENCES patients(id),
  note_text TEXT,
  check_result_json TEXT,
  override_reason TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS followups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id INTEGER NOT NULL REFERENCES patients(id),
  message TEXT,
  status TEXT DEFAULT 'sent',
  reply_text TEXT,
  escalated INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
