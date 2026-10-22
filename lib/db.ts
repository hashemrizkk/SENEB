import { readFileSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import Database from "better-sqlite3";
import type { InputMethod } from "./intake.ts";
import { migrateInputMethodCheck } from "./db-migrations.ts";
import { seedPatients } from "./seed.ts";
import {
  getDoctorPatientRecord,
  listDoctorQueue,
  migrateDoctorReview,
  savePatientIntake,
  type ReviewFilter,
  type ReviewIntake,
} from "./doctor-review.ts";
import type { FollowupPlan } from "./followup-plan.ts";
import { buildFacts } from "./case-facts.ts";
import type { AfterWorkRating, AfterWorkRatingInput } from "./summary-types.ts";
import { redFlags } from "./rules.ts";
import type { IntakeFields } from "./intake.ts";

// ----- Connection (singleton for dev hot-reload) -----

const databasePath = process.env.HACKATHON_DB_PATH
  ? path.resolve(process.env.HACKATHON_DB_PATH)
  : path.join(process.cwd(), "hackathon.db");
const schemaPath = path.join(process.cwd(), "lib", "schema.sql");
const globalForDatabase = globalThis as typeof globalThis & {
  hackathonDatabase?: Database.Database;
};

const db =
  globalForDatabase.hackathonDatabase ?? new Database(databasePath);

globalForDatabase.hackathonDatabase = db;

db.pragma("foreign_keys = ON");
db.pragma("journal_mode = WAL");
db.exec(readFileSync(schemaPath, "utf8"));

// ----- Auto-seed -----

const patientCount = db
  .prepare<[], { count: number }>("SELECT COUNT(*) AS count FROM patients")
  .get();

if (!patientCount) {
  throw new Error("Could not read the patient count from the database.");
}

if (patientCount.count === 0) {
  seedPatients(db);
}

// ----- Repeatable migrations -----

const intakeColumns = db
  .prepare<[], { name: string }>("SELECT name FROM pragma_table_info('intakes')")
  .all();
const intakeColumnNamesBeforeMigrations = new Set(
  intakeColumns.map((row) => row.name),
);
const patientColumns = db
  .prepare<[], { name: string }>("SELECT name FROM pragma_table_info('patients')")
  .all();
const patientColumnNames = new Set(patientColumns.map((row) => row.name));

export function migratePatientFollowupDates(database: Database.Database): void {
  const existingColumns = new Set(
    database
      .prepare<[], { name: string }>("SELECT name FROM pragma_table_info('patients')")
      .all()
      .map((column) => column.name),
  );
  for (const [column, declaration] of [
    ["last_kidney_labs_date", "TEXT"],
    ["last_eye_exam_date", "TEXT"],
  ] as const) {
    if (!existingColumns.has(column)) {
      database.exec(`ALTER TABLE patients ADD COLUMN ${column} ${declaration}`);
      existingColumns.add(column);
    }
  }
}

const patientMigrations: [string, string][] = [
  ["email", "ALTER TABLE patients ADD COLUMN email TEXT"],
  ["self_description", "ALTER TABLE patients ADD COLUMN self_description TEXT"],
  ["reference_code", "ALTER TABLE patients ADD COLUMN reference_code TEXT"],
  ["request_id", "ALTER TABLE patients ADD COLUMN request_id TEXT"],
  ["consent_at", "ALTER TABLE patients ADD COLUMN consent_at TEXT"],
  ["created_at", "ALTER TABLE patients ADD COLUMN created_at TEXT"],
];

db.transaction(() => {
  if (!intakeColumnNamesBeforeMigrations.has("meta_json")) {
    db.exec("ALTER TABLE intakes ADD COLUMN meta_json TEXT");
  }
  if (!intakeColumnNamesBeforeMigrations.has("followup_request_id")) {
    db.exec("ALTER TABLE intakes ADD COLUMN followup_request_id TEXT");
  }

  for (const [columnName, sql] of patientMigrations) {
    if (!patientColumnNames.has(columnName)) db.exec(sql);
  }
  migratePatientFollowupDates(db);

  db.exec("UPDATE patients SET created_at = CURRENT_TIMESTAMP WHERE created_at IS NULL");
  db.exec(
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_patients_reference_code ON patients(reference_code)",
  );
  db.exec(
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_patients_request_id ON patients(request_id)",
  );
  db.exec(
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_intakes_followup_request_id ON intakes(followup_request_id) WHERE followup_request_id IS NOT NULL",
  );
})();

// Additive clinician-review schema migration; existing queue tables are preserved.
migrateDoctorReview(db);

migrateInputMethodCheck(db);

const followupColumns = new Set(
  db.prepare<[], { name: string }>("SELECT name FROM pragma_table_info('followups')")
    .all().map((column) => column.name),
);
db.transaction(() => {
  const followupMigrations: [string, string][] = [
    ["intake_id", "ALTER TABLE followups ADD COLUMN intake_id INTEGER REFERENCES intakes(id)"],
    ["plan_json", "ALTER TABLE followups ADD COLUMN plan_json TEXT"],
    ["next_visit_date", "ALTER TABLE followups ADD COLUMN next_visit_date TEXT"],
    ["confirmed_by", "ALTER TABLE followups ADD COLUMN confirmed_by TEXT"],
    ["confirmed_at", "ALTER TABLE followups ADD COLUMN confirmed_at TEXT"],
  ];
  for (const [column, sql] of followupMigrations) {
    if (!followupColumns.has(column)) db.exec(sql);
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_id INTEGER NOT NULL REFERENCES patients(id),
      kind TEXT NOT NULL CHECK (kind IN ('recap', 'reminder')),
      body TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued'
        CHECK (status IN ('queued', 'sent', 'failed', 'canceled')),
      scheduled_at TEXT NOT NULL,
      sent_at TEXT,
      attempts INTEGER NOT NULL DEFAULT 0,
      provider_ref TEXT,
      error TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_messages_due ON messages(status, scheduled_at);
    CREATE INDEX IF NOT EXISTS idx_followups_intake ON followups(intake_id, confirmed_at);
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS survey_submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id TEXT NOT NULL UNIQUE,
      full_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      answers_json TEXT NOT NULL,
      metadata_json TEXT NOT NULL,
      whatsapp_consent_at TEXT NOT NULL DEFAULT '',
      email TEXT,
      email_consent_at TEXT,
      email_status TEXT NOT NULL DEFAULT 'not_sent'
        CHECK (email_status IN ('not_sent', 'sending', 'accepted', 'failed')),
      email_provider_ref TEXT,
      email_error TEXT,
      created_at TEXT NOT NULL,
      nurse_decision TEXT CHECK (
        nurse_decision IN ('urgent_er', 'prompt_assessment', 'no_er_referral')
      ),
      nurse_name TEXT,
      nurse_decided_at TEXT,
      whatsapp_status TEXT NOT NULL DEFAULT 'not_sent'
        CHECK (whatsapp_status IN ('not_sent', 'sending', 'accepted', 'failed')),
      whatsapp_provider_ref TEXT,
      whatsapp_error TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_survey_submissions_queue
      ON survey_submissions(created_at DESC, nurse_decided_at);
    CREATE TABLE IF NOT EXISTS survey_decision_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      submission_id INTEGER NOT NULL REFERENCES survey_submissions(id),
      decision TEXT NOT NULL CHECK (
        decision IN ('urgent_er', 'prompt_assessment', 'no_er_referral')
      ),
      nurse_name TEXT NOT NULL,
      decided_at TEXT NOT NULL,
      assessment_confirmed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_survey_decision_history_submission
      ON survey_decision_history(submission_id, decided_at DESC, id DESC);
  `);
})();

const surveySubmissionColumns = new Set(
  db.prepare<[], { name: string }>(
    "SELECT name FROM pragma_table_info('survey_submissions')",
  ).all().map((column) => column.name),
);
for (const [column, declaration] of [
  ["email", "TEXT"],
  ["email_consent_at", "TEXT"],
  ["email_status", "TEXT NOT NULL DEFAULT 'not_sent'"],
  ["email_provider_ref", "TEXT"],
  ["email_error", "TEXT"],
] as const) {
  if (!surveySubmissionColumns.has(column)) {
    db.exec(`ALTER TABLE survey_submissions ADD COLUMN ${column} ${declaration}`);
  }
}

const surveyDecisionHistoryColumns = new Set(
  db.prepare<[], { name: string }>(
    "SELECT name FROM pragma_table_info('survey_decision_history')",
  ).all().map((column) => column.name),
);
if (!surveyDecisionHistoryColumns.has("assessment_confirmed_at")) {
  db.exec(
    "ALTER TABLE survey_decision_history ADD COLUMN assessment_confirmed_at TEXT",
  );
}

export function migrateFollowupPlanDrafts(database: Database.Database): void {
export function migrateAfterWorkRatings(database: Database.Database): void {
  const tableExists = database.prepare<[string], { name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
  ).get("after_work_ratings");
  if (!tableExists) {
    database.exec(`
      CREATE TABLE after_work_ratings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
        intake_id INTEGER NOT NULL REFERENCES intakes(id) ON DELETE CASCADE,
        note_hash TEXT NOT NULL,
        note_rating TEXT NOT NULL CHECK (note_rating IN ('green', 'yellow', 'red')),
        profile_rating TEXT NOT NULL CHECK (profile_rating IN ('green', 'yellow', 'red')),
        payload_json TEXT NOT NULL,
        mode TEXT NOT NULL CHECK (mode IN ('llm', 'mock', 'fallback')),
        model TEXT,
        created_at TEXT NOT NULL
      )
    `);
  }
  database.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_after_work_rating_note
      ON after_work_ratings(intake_id, note_hash);
    CREATE INDEX IF NOT EXISTS idx_after_work_rating_patient
      ON after_work_ratings(patient_id, created_at DESC);
  `);
}

migrateAfterWorkRatings(db);

// ----- Types -----

export type Patient = {
  id: number;
  name: string;
  age: number | null;
  phone: string | null;
  diabetes_type: string | null;
  last_hba1c_date: string | null;
  last_kidney_labs_date: string | null;
  last_foot_exam_date: string | null;
  last_eye_exam_date: string | null;
  last_bp_date: string | null;
  next_visit_date: string | null;
  edited_by: string | null;
  edited_at: string | null;
};

export type IntakeRow = {
  id: number;
  patient_id: number;
  patient_name: string;
  input_method: InputMethod | "assisted" | null;
  raw_text: string | null;
  structured_json: string | null;
  red_flags_json: string | null;
  meta_json: string | null;
  created_at: string | null;
};

export type CaseSummaryRow = {
  id: number;
  patient_id: number;
  intake_id: number;
  generation_mode: "llm" | "mock" | "fallback";
  model: string | null;
  summary_text: string | null;
  facts_json: string;
  rule_flags_json: string;
  ai_flags_json: string | null;
  values_json: string | null;
  inconsistencies_json: string | null;
  suggested_priority: "urgent" | "important" | "normal" | null;
  priority_reasons_json: string;
  rules_version: string;
  dropped_ai_items: number;
  created_at: string;
};

export type PatientContact = Patient & {
  email: string | null;
  self_description: string | null;
  reference_code: string | null;
  consent_at: string | null;
  created_at: string | null;
};

export type PatientIntakeRecord = ReviewIntake;

export type PatientRecord = {
  patient: PatientContact & {
    edited_by: string | null;
    edited_at: string | null;
  };
  intakes: PatientIntakeRecord[];
  latestIntake: PatientIntakeRecord | null;
};

export type StoredAfterWorkRating = {
  id: number;
  patient_id: number;
  intake_id: number;
  note_hash: string;
  note_rating: "green" | "yellow" | "red";
  profile_rating: "green" | "yellow" | "red";
  payload_json: string;
  mode: "llm" | "mock" | "fallback";
  model: string | null;
  created_at: string;
};

export function buildAfterWorkRatingInput(
  database: Database.Database,
  intakeId: number,
  note: string,
  today = new Date(),
): { patientId: number; input: AfterWorkRatingInput } | null {
  const row = database.prepare<[number], { patient_id: number }>(
    "SELECT patient_id FROM intakes WHERE id = ?",
  ).get(intakeId);
  if (!row) return null;
  const record = getDoctorPatientRecord(database, row.patient_id);
  const intake = record?.intakes.find((item) => item.id === intakeId);
  if (!record || !intake) return null;
  const patient = record.patient;
  const facts = buildFacts(patient, intake.fields, today);
  const careItems: AfterWorkRatingInput["patient_profile"]["care_items"] = [
    { item: "HbA1c", ...facts.care_gaps.hba1c },
    { item: "Foot exam", ...facts.care_gaps.foot_exam },
    { item: "Blood pressure", ...facts.care_gaps.blood_pressure },
    {
      item: "Eye exam",
      date: patient.last_eye_exam_date,
      days_since: null,
      overdue: false,
      threshold_days: 0,
    },
    {
      item: "Kidney labs",
      date: patient.last_kidney_labs_date,
      days_since: null,
      overdue: false,
      threshold_days: 0,
    },
  ];
  return {
    patientId: patient.id,
    input: {
      doctor_note: note,
      patient_profile: {
        age: patient.age,
        diabetes_type: patient.diabetes_type,
        phone: patient.phone === null ? null : "recorded",
        messaging_consent: patient.consent_at !== null,
        next_visit_date: patient.next_visit_date,
        care_items: careItems,
      },
    },
  };
}

export function hasAfterWorkRating(
  database: Database.Database,
  intakeId: number,
  note: string,
): boolean {
  const hash = noteHash(note);
  return Boolean(database.prepare<[number, string], { id: number }>(
    "SELECT id FROM after_work_ratings WHERE intake_id = ? AND note_hash = ? LIMIT 1",
  ).get(intakeId, hash));
}

export function getAfterWorkRatingForNote(
  database: Database.Database,
  patientId: number,
  intakeId: number,
  note: string,
): StoredAfterWorkRating | null {
  if (!note.trim()) return null;
  return database.prepare<[number, number, string], StoredAfterWorkRating>(
    `SELECT id, patient_id, intake_id, note_hash, note_rating, profile_rating,
            payload_json, mode, model, created_at
     FROM after_work_ratings
     WHERE patient_id = ? AND intake_id = ? AND note_hash = ?
     ORDER BY created_at DESC, id DESC LIMIT 1`,
  ).get(patientId, intakeId, noteHash(note)) ?? null;
}

export function saveAfterWorkRating(
  database: Database.Database,
  input: {
    patientId: number;
    intakeId: number;
    note: string;
    output: AfterWorkRating;
    mode: "llm" | "mock" | "fallback";
    model: string | null;
    now?: Date;
  },
): boolean {
  if (!input.note.trim() || getLatestClinicianNote(database, input.intakeId) !== input.note) {
    return false;
  }
  const result = database.prepare(
    `INSERT OR IGNORE INTO after_work_ratings (
       patient_id, intake_id, note_hash, note_rating, profile_rating,
       payload_json, mode, model, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    input.patientId,
    input.intakeId,
    noteHash(input.note),
    input.output.note_rating,
    input.output.profile_rating,
    JSON.stringify(input.output),
    input.mode,
    input.model,
    (input.now ?? new Date()).toISOString(),
  );
  return result.changes === 1;
}

export function latestAfterWorkRating(
  database: Database.Database,
  patientId: number,
): StoredAfterWorkRating | null {
  return database.prepare<[number], StoredAfterWorkRating>(
    `SELECT id, patient_id, intake_id, note_hash, note_rating, profile_rating,
            payload_json, mode, model, created_at
     FROM after_work_ratings
     WHERE patient_id = ?
     ORDER BY created_at DESC, id DESC LIMIT 1`,
  ).get(patientId) ?? null;
}

export function getLatestClinicianNote(database: Database.Database, intakeId: number): string | null {
  const note = database.prepare<[number], { note_text: string | null }>(
    `SELECT n.note_text
     FROM notes n JOIN intakes i ON i.patient_id = n.patient_id
     WHERE i.id = ? AND n.edited_by IS NOT NULL
       AND n.check_result_json = 'intake:' || i.id
     ORDER BY n.created_at DESC, n.id DESC LIMIT 1`,
  ).get(intakeId);
  return note?.note_text ?? null;
}

function noteHash(note: string): string {
  return createHash("sha256").update(note).digest("hex");
}

export type QueueFilter = ReviewFilter;

export function getPatientRecord(patientId: number): PatientRecord | null {
  return getDoctorPatientRecord(db, patientId);
}

export function listQueue(filter: QueueFilter = "all"): PatientIntakeRecord[] {
  return listDoctorQueue(db, filter);
}

// ----- Query functions -----

export function getPatient(id: number): Patient | undefined {
  return db
    .prepare<[number], Patient>(
      `SELECT id, name, age, phone, diabetes_type, last_hba1c_date,
              last_kidney_labs_date, last_foot_exam_date, last_eye_exam_date,
              last_bp_date, next_visit_date,
              edited_by, edited_at
       FROM patients WHERE id = ?`,
    )
    .get(id);
}

export function listPatients(): Patient[] {
  return db
    .prepare<[], Patient>(
      `SELECT id, name, age, phone, diabetes_type, last_hba1c_date,
              last_kidney_labs_date, last_foot_exam_date, last_eye_exam_date,
              last_bp_date, next_visit_date,
              edited_by, edited_at
       FROM patients ORDER BY id`,
    )
    .all();
}

export function insertIntakeWithRevision(data: {
  patient_id: number;
  input_method: InputMethod;
  raw_text: string | null;
  structured_json: string;
  red_flags_json: string;
  meta_json: string | null;
  priority?: "urgent" | "important" | "normal" | null;
  revision_reason?: string | null;
}): number {
  return savePatientIntake(db, { ...data, priority: data.priority ?? null }, undefined, {
    source: "patient",
    editedBy: null,
    reason: data.revision_reason ?? null,
  });
}

export function latestIntakes(limit: number): IntakeRow[] {
  return db
    .prepare<[number], IntakeRow>(
      `SELECT i.id, i.patient_id, p.name AS patient_name,
              i.input_method, i.raw_text, i.structured_json,
              i.red_flags_json, i.meta_json, i.created_at
       FROM intakes i
       JOIN patients p ON p.id = i.patient_id
       ORDER BY i.created_at DESC
       LIMIT ?`,
    )
    .all(limit);
}

export function latestIntakeForPatient(
  patientId: number,
): IntakeRow | undefined {
  return db
    .prepare<[number], IntakeRow>(
      `SELECT i.id, i.patient_id, p.name AS patient_name,
              i.input_method, i.raw_text, i.structured_json, i.red_flags_json,
              i.meta_json, i.created_at
       FROM intakes i
       JOIN patients p ON p.id = i.patient_id
       WHERE i.patient_id = ?
       ORDER BY i.created_at DESC, i.id DESC
       LIMIT 1`,
    )
    .get(patientId);
}

export function getIntakeById(intakeId: number): IntakeRow | undefined {
  return db
    .prepare<[number], IntakeRow>(
      `SELECT i.id, i.patient_id, p.name AS patient_name,
              i.input_method, i.raw_text, i.structured_json, i.red_flags_json,
              i.meta_json, i.created_at
       FROM intakes i
       JOIN patients p ON p.id = i.patient_id
       WHERE i.id = ?
       LIMIT 1`,
    )
    .get(intakeId);
}

export function latestCaseSummary(patientId: number): CaseSummaryRow | undefined {
  return db
    .prepare<[number], CaseSummaryRow>(
      `SELECT id, patient_id, intake_id, generation_mode, model, summary_text,
              facts_json, rule_flags_json, ai_flags_json, values_json,
              inconsistencies_json, suggested_priority, priority_reasons_json,
              rules_version, dropped_ai_items, created_at
       FROM case_summaries
       WHERE patient_id = ?
       ORDER BY created_at DESC, id DESC
       LIMIT 1`,
    )
    .get(patientId);
}

export function caseSummaryHistory(
  patientId: number,
  limit = 5,
): CaseSummaryRow[] {
  return db
    .prepare<[number, number], CaseSummaryRow>(
      `SELECT id, patient_id, intake_id, generation_mode, model, summary_text,
              facts_json, rule_flags_json, ai_flags_json, values_json,
              inconsistencies_json, suggested_priority, priority_reasons_json,
              rules_version, dropped_ai_items, created_at
       FROM case_summaries
       WHERE patient_id = ?
       ORDER BY created_at DESC, id DESC
       LIMIT ?`,
    )
    .all(patientId, limit);
}

export function latestCaseSummaries(
  limit = 20,
): (CaseSummaryRow & { patient_name: string })[] {
  return db
    .prepare<[number], CaseSummaryRow & { patient_name: string }>(
      `SELECT s.id, s.patient_id, p.name AS patient_name,
              s.intake_id, s.generation_mode, s.model,
              s.summary_text, s.facts_json, s.rule_flags_json, s.ai_flags_json,
              s.values_json, s.inconsistencies_json, s.suggested_priority,
              s.priority_reasons_json, s.rules_version, s.dropped_ai_items,
              s.created_at
       FROM case_summaries s
       JOIN patients p ON p.id = s.patient_id
       ORDER BY s.created_at DESC, s.id DESC
       LIMIT ?`,
    )
    .all(limit);
}

export function createPatient(data: {
  name: string;
  phone: string;
  age?: number | null;
  next_visit_date?: string | null;
  request_id?: string | null;
  email?: string | null;
  self_description?: string | null;
  reference_code?: string | null;
  consent_at?: string | null;
  created_at?: string | null;
}): number {
  const result = db
    .prepare(
      `INSERT INTO patients (
        name, age, phone, next_visit_date, request_id, email, self_description,
        reference_code, consent_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      data.name,
      data.age ?? null,
      data.phone,
      data.next_visit_date ?? null,
      data.request_id ?? null,
      data.email ?? null,
      data.self_description ?? null,
      data.reference_code ?? null,
      data.consent_at ?? null,
      data.created_at ?? null,
    );

  return Number(result.lastInsertRowid);
}

export function getRegistrationReferenceCode(requestId: string): string | undefined {
  return db
    .prepare<[string], { reference_code: string | null }>(
      "SELECT reference_code FROM patients WHERE request_id = ?",
    )
    .get(requestId)?.reference_code ?? undefined;
}

export function referenceCodeExists(code: string): boolean {
  return (
    db
      .prepare<[string], { count: number }>(
        "SELECT COUNT(*) AS count FROM patients WHERE reference_code = ?",
      )
      .get(code)?.count ?? 0
  ) > 0;
}

export type StoredOutboxMessage = {
  id: number;
  patient_id: number;
  kind: "recap" | "reminder";
  body: string;
  status: "queued" | "sent" | "failed" | "canceled";
  scheduled_at: string;
  sent_at: string | null;
  attempts: number;
  provider_ref: string | null;
  error: string | null;
  phone: string | null;
};

export function enqueueOutboxMessage(
  message: Omit<StoredOutboxMessage, "id" | "attempts" | "provider_ref" | "error" | "phone">,
  database: Database.Database = db,
): number {
  const result = database.prepare(
    `INSERT INTO messages (patient_id, kind, body, status, scheduled_at, sent_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    message.patient_id,
    message.kind,
    message.body,
    message.status,
    message.scheduled_at,
    message.sent_at,
  );
  return Number(result.lastInsertRowid);
}

export function saveRecordedFollowup(
  database: Database.Database,
  input: {
    patientId: number;
    requestId: string;
    staffName: string;
    note: string;
    input_method: InputMethod;
    fields: IntakeFields;
    plan: FollowupPlan;
    recapBody: string | null;
    recapScheduledAt: string | null;
    reminderBody: string | null;
    reminderScheduledAt: string | null;
    now?: Date;
  },
): {
  intakeId: number;
  duplicate: boolean;
  noteMatches: boolean;
  recapQueued: boolean;
  reminderQueued: boolean;
} {
  const now = input.now ?? new Date();
  return database.transaction(() => {
    const existing = database.prepare<
      [string],
      { id: number; patient_id: number }
    >(
      "SELECT id, patient_id FROM intakes WHERE followup_request_id = ?",
    ).get(input.requestId);
    if (existing) {
      if (existing.patient_id !== input.patientId) {
        throw new Error("The request ID is already assigned to another patient.");
      }
      const savedNote = database.prepare<
        [number, number],
        { note_text: string | null }
      >(
        `SELECT note_text FROM notes
         WHERE patient_id = ? AND check_result_json = 'intake:' || ?
           AND edited_by IS NOT NULL
         ORDER BY created_at DESC, id DESC LIMIT 1`,
      ).get(input.patientId, existing.id)?.note_text ?? "";
      return {
        intakeId: existing.id,
        duplicate: true,
        noteMatches: savedNote === input.note.trim(),
        recapQueued: false,
        reminderQueued: false,
      };
    }

    const record = getDoctorPatientRecord(database, input.patientId);
    if (!record) throw new Error("Patient not found.");
    const timestamp = now.toISOString();
    const note = input.note.trim();
    const flags = redFlags(input.fields);
    const intakeId = savePatientIntake(
      database,
      {
        patient_id: input.patientId,
        input_method: input.input_method,
        raw_text: note || null,
        structured_json: JSON.stringify(input.fields),
        red_flags_json: JSON.stringify(flags),
        meta_json: null,
      },
      timestamp,
      {
        source: "clinician",
        editedBy: input.staffName,
        reason: "Clinic follow-up.",
      },
    );
    database.prepare(
      "UPDATE intakes SET followup_request_id = ? WHERE id = ?",
    ).run(input.requestId, intakeId);
    if (note) {
      database.prepare(
        `INSERT INTO notes (
           patient_id, note_text, check_result_json, override_reason,
           edited_by, created_at
         ) VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(
        input.patientId,
        note,
        `intake:${intakeId}`,
        "Clinic follow-up.",
        input.staffName,
        timestamp,
      );
    }

    database.prepare(
      `INSERT INTO followups (
         patient_id, intake_id, plan_json, next_visit_date,
         confirmed_by, confirmed_at, message, status
       ) VALUES (?, ?, ?, ?, ?, ?, ?, 'confirmed')`,
    ).run(
      input.patientId,
      intakeId,
      JSON.stringify(input.plan),
      input.plan.next_visit_date,
      input.staffName,
      timestamp,
      null,
    );
    if (input.plan.next_visit_date !== null) {
      database.prepare("UPDATE patients SET next_visit_date = ? WHERE id = ?")
        .run(input.plan.next_visit_date, input.patientId);
    }
    if (
      input.plan.next_visit_date !== null &&
      record.patient.next_visit_date !== null &&
      record.patient.next_visit_date !== input.plan.next_visit_date
    ) {
      database.prepare(
        "UPDATE messages SET status = 'canceled' WHERE patient_id = ? AND kind = 'reminder' AND status = 'queued'",
      ).run(input.patientId);
    }

    const contact = database.prepare<
      [number],
      { phone: string | null; consent_at: string | null }
    >("SELECT phone, consent_at FROM patients WHERE id = ?").get(input.patientId);
    let recapQueued = false;
    let reminderQueued = false;
    if (input.recapBody && input.recapScheduledAt && contact?.phone && contact.consent_at) {
      enqueueOutboxMessage({
        patient_id: input.patientId,
        kind: "recap",
        body: input.recapBody,
        status: "queued",
        scheduled_at: input.recapScheduledAt,
        sent_at: null,
      }, database);
      recapQueued = true;
    }
    const reminderAlreadyExists = input.reminderBody
      ? database.prepare<[number, string], { count: number }>(
          `SELECT COUNT(*) AS count FROM messages
           WHERE patient_id = ? AND kind = 'reminder' AND body = ?
             AND status IN ('queued', 'sent')`,
        ).get(input.patientId, input.reminderBody)?.count ?? 0
      : 0;
    if (
      input.plan.next_visit_date &&
      input.reminderBody &&
      input.reminderScheduledAt &&
      contact?.phone &&
      contact.consent_at &&
      reminderAlreadyExists === 0
    ) {
      enqueueOutboxMessage({
        patient_id: input.patientId,
        kind: "reminder",
        body: input.reminderBody,
        status: "queued",
        scheduled_at: input.reminderScheduledAt,
        sent_at: null,
      }, database);
      reminderQueued = true;
    }
    return {
      intakeId,
      duplicate: false,
      noteMatches: true,
      recapQueued,
      reminderQueued,
    };
  })();
}

export function dueMessages(now: string): StoredOutboxMessage[] {
  return db.prepare<[string], StoredOutboxMessage>(
    `SELECT m.id, m.patient_id, m.kind, m.body, m.status, m.scheduled_at,
            m.sent_at, m.attempts, m.provider_ref, m.error, p.phone
     FROM messages m JOIN patients p ON p.id = m.patient_id
     WHERE m.status = 'queued' AND m.scheduled_at <= ?
     ORDER BY m.scheduled_at, m.id LIMIT 100`,
  ).all(now);
}

export function markMessageSent(id: number, providerRef: string, now: string): void {
  db.prepare(
    `UPDATE messages SET status = 'sent', sent_at = ?, attempts = attempts + 1,
       provider_ref = ?, error = NULL WHERE id = ? AND status = 'queued'`,
  ).run(now, providerRef, id);
}

export function markMessageFailed(
  id: number,
  attempts: number,
  error: string,
  retryAt: string | null,
): void {
  db.prepare(
    `UPDATE messages SET status = ?, attempts = ?, error = ?, scheduled_at = ?
     WHERE id = ? AND status = 'queued'`,
  ).run(retryAt ? "queued" : "failed", attempts, error, retryAt ?? new Date().toISOString(), id);
}

export function latestMessages(limit = 50): StoredOutboxMessage[] {
  return db.prepare<[number], StoredOutboxMessage>(
    `SELECT m.id, m.patient_id, m.kind, m.body, m.status, m.scheduled_at,
            m.sent_at, m.attempts, m.provider_ref, m.error, p.phone
     FROM messages m JOIN patients p ON p.id = m.patient_id
     ORDER BY m.id DESC LIMIT ?`,
  ).all(limit);
}

export type NurseSurveyDecision =
  | "urgent_er"
  | "prompt_assessment"
  | "no_er_referral";

export type SurveySubmissionRow = {
  id: number;
  request_id: string;
  full_name: string;
  email: string | null;
  email_consent_at: string | null;
  answers_json: string;
  metadata_json: string;
  whatsapp_consent_at: string;
  created_at: string;
  nurse_decision: NurseSurveyDecision | null;
  nurse_name: string | null;
  nurse_decided_at: string | null;
  email_status: "not_sent" | "sending" | "accepted" | "failed";
  email_provider_ref: string | null;
  email_error: string | null;
};

export type SurveyDecisionHistoryRow = {
  id: number;
  submission_id: number;
  decision: NurseSurveyDecision;
  nurse_name: string;
  decided_at: string;
  assessment_confirmed_at: string | null;
};

export function insertSurveySubmission(input: {
  request_id: string;
  full_name: string;
  email: string;
  answers_json: string;
  metadata_json: string;
  email_consent_at: string;
  created_at: string;
}): boolean {
  return db.transaction(() => {
    const existing = db.prepare<[string], { id: number }>(
      "SELECT id FROM survey_submissions WHERE request_id = ?",
    ).get(input.request_id);
    if (existing) return false;
    db.prepare(
      `INSERT INTO survey_submissions (
         request_id, full_name, phone, email, answers_json, metadata_json,
         whatsapp_consent_at, email_consent_at, created_at
       ) VALUES (?, ?, '', ?, ?, ?, '', ?, ?)`,
    ).run(
      input.request_id,
      input.full_name,
      input.email,
      input.answers_json,
      input.metadata_json,
      input.email_consent_at,
      input.created_at,
    );
    return true;
  })();
}

export function listSurveySubmissions(): SurveySubmissionRow[] {
  return db.prepare<[], SurveySubmissionRow>(
    `SELECT id, request_id, full_name, email, email_consent_at,
            answers_json, metadata_json, whatsapp_consent_at, created_at,
            nurse_decision, nurse_name, nurse_decided_at, email_status,
            email_provider_ref, email_error
     FROM survey_submissions
     ORDER BY created_at DESC, id DESC LIMIT 200`,
  ).all();
}

export function getSurveySubmission(id: number): SurveySubmissionRow | undefined {
  return db.prepare<[number], SurveySubmissionRow>(
    `SELECT id, request_id, full_name, email, email_consent_at,
            answers_json, metadata_json, whatsapp_consent_at, created_at,
            nurse_decision, nurse_name, nurse_decided_at, email_status,
            email_provider_ref, email_error
     FROM survey_submissions WHERE id = ?`,
  ).get(id);
}

export function listSurveyDecisionHistory(): SurveyDecisionHistoryRow[] {
  return db.prepare<[], SurveyDecisionHistoryRow>(
    `SELECT h.id, h.submission_id, h.decision, h.nurse_name, h.decided_at,
            h.assessment_confirmed_at
     FROM survey_decision_history h
     WHERE h.submission_id IN (
       SELECT id FROM survey_submissions ORDER BY created_at DESC LIMIT 200
     )
     ORDER BY h.decided_at DESC, h.id DESC LIMIT 1000`,
  ).all();
}

export function saveNurseSurveyDecision(input: {
  id: number;
  decision: NurseSurveyDecision;
  nurseName: string;
  now: string;
  assessmentConfirmedAt: string;
}): "saved" | "not_found" | "message_in_progress" | "already_sent" {
  return db.transaction(() => {
    const current = db.prepare<
      [number],
      Pick<SurveySubmissionRow, "nurse_decision" | "nurse_name" | "email_status">
    >( "SELECT nurse_decision, nurse_name, email_status FROM survey_submissions WHERE id = ?")
      .get(input.id);
    if (!current) return "not_found";
    if (current.email_status === "sending") return "message_in_progress";
    if (current.email_status === "accepted") return "already_sent";
    if (current.nurse_decision !== input.decision || current.nurse_name !== input.nurseName) {
      db.prepare(
        `INSERT INTO survey_decision_history (
           submission_id, decision, nurse_name, decided_at, assessment_confirmed_at
         ) VALUES (?, ?, ?, ?, ?)`,
      ).run(
        input.id,
        input.decision,
        input.nurseName,
        input.now,
        input.assessmentConfirmedAt,
      );
    }
    db.prepare(
      `UPDATE survey_submissions
       SET nurse_decision = ?, nurse_name = ?, nurse_decided_at = ?,
           email_status = CASE
             WHEN nurse_decision = ? THEN email_status ELSE 'not_sent' END,
           email_provider_ref = CASE
             WHEN nurse_decision = ? THEN email_provider_ref ELSE NULL END,
           email_error = CASE
             WHEN nurse_decision = ? THEN email_error ELSE NULL END
       WHERE id = ?`,
    ).run(
      input.decision,
      input.nurseName,
      input.now,
      input.decision,
      input.decision,
      input.decision,
      input.id,
    );
    return "saved";
  })();
}

export function claimSurveyEmailSend(id: number): boolean {
  const result = db.prepare(
    `UPDATE survey_submissions SET email_status = 'sending', email_error = NULL
     WHERE id = ? AND nurse_decision IS NOT NULL
       AND email IS NOT NULL AND email_consent_at IS NOT NULL
       AND email_status IN ('not_sent', 'failed')`,
  ).run(id);
  return result.changes === 1;
}

export function markSurveyEmailAccepted(id: number, providerRef: string): void {
  db.prepare(
    `UPDATE survey_submissions
     SET email_status = 'accepted', email_provider_ref = ?, email_error = NULL
     WHERE id = ? AND email_status = 'sending'`,
  ).run(providerRef, id);
}

export function markSurveyEmailFailed(id: number, error: string): void {
  db.prepare(
    `UPDATE survey_submissions
     SET email_status = 'failed', email_error = ?
     WHERE id = ? AND email_status = 'sending'`,
  ).run(error, id);
}

export function saveEncounterClose(input: {
  intakeId: number;
  version: number;
  staffName: string;
  note: string;
  plan: FollowupPlan;
  recapBody: string | null;
  recapScheduledAt: string;
  reminderBody: string | null;
  reminderScheduledAt: string | null;
  now?: Date;
}): { ok: true; recapQueued: boolean; recapMessageId: number | null; reminderQueued: boolean } | { ok: false; conflict: true } {
  const now = input.now ?? new Date();
  return db.transaction(() => {
    const record = getDoctorPatientRecord(db, Number(
      db.prepare<[number], { patient_id: number }>("SELECT patient_id FROM intakes WHERE id = ?")
        .get(input.intakeId)?.patient_id,
    ));
    const intake = record?.intakes.find((item) => item.id === input.intakeId);
    if (!record || !intake) throw new Error("Intake not found.");
    const saveResult = saveClinicianEdit(db, input.intakeId, input.staffName, {
      version: input.version,
      patient: {
        name: record.patient.name,
        phone: record.patient.phone ?? "",
        email: record.patient.email ?? "",
        self_description: record.patient.self_description ?? "",
      },
      fields: intake.fields,
      raw_text: intake.raw_text,
      priority: intake.priority,
      status: intake.status,
      note: input.note,
      reason: "Encounter closed; follow-up plan confirmed.",
    }, getLatestClinicianNote(db, input.intakeId), now);
    if (!saveResult.ok) return { ok: false as const, conflict: true as const };
    deleteFollowupPlanDraft(db, input.intakeId);

    const timestamp = now.toISOString();
    db.prepare(
      `INSERT INTO followups (
         patient_id, intake_id, plan_json, next_visit_date,
         confirmed_by, confirmed_at, message, status
       ) VALUES (?, ?, ?, ?, ?, ?, ?, 'confirmed')`,
    ).run(
      record.patient.id,
      input.intakeId,
      JSON.stringify(input.plan),
      input.plan.next_visit_date,
      input.staffName,
      timestamp,
      null,
    );
    db.prepare("UPDATE patients SET next_visit_date = ? WHERE id = ?")
      .run(input.plan.next_visit_date, record.patient.id);
    const visitDateChanged = record.patient.next_visit_date !== input.plan.next_visit_date;
    if (visitDateChanged) {
      db.prepare(
        "UPDATE messages SET status = 'canceled' WHERE patient_id = ? AND kind = 'reminder' AND status = 'queued'",
      ).run(record.patient.id);
    }

    const patientInfo = db.prepare<[number], { consent_at: string | null; phone: string | null }>(
      "SELECT consent_at, phone FROM patients WHERE id = ?",
    ).get(record.patient.id);
    let recapMessageId: number | null = null;
    if (input.recapBody && patientInfo?.consent_at && patientInfo.phone) {
      recapMessageId = enqueueOutboxMessage({
        patient_id: record.patient.id,
        kind: "recap",
        body: input.recapBody,
        status: "queued",
        scheduled_at: input.recapScheduledAt,
        sent_at: null,
      });
    }
    let reminderQueued = false;
    const reminderAlreadyExists = input.reminderBody
      ? db.prepare<[number, string], { count: number }>(
          `SELECT COUNT(*) AS count FROM messages
           WHERE patient_id = ? AND kind = 'reminder' AND body = ?
             AND status IN ('queued', 'sent')`,
        ).get(record.patient.id, input.reminderBody)?.count ?? 0
      : 0;
    if (
      input.plan.next_visit_date &&
      input.reminderBody &&
      input.reminderScheduledAt &&
      patientInfo?.consent_at &&
      patientInfo.phone &&
      reminderAlreadyExists === 0
    ) {
      enqueueOutboxMessage({
        patient_id: record.patient.id,
        kind: "reminder",
        body: input.reminderBody,
        status: "queued",
        scheduled_at: input.reminderScheduledAt,
        sent_at: null,
      });
      reminderQueued = true;
    }
    return { ok: true as const, recapQueued: recapMessageId !== null, recapMessageId, reminderQueued };
  })();
}

export function cancelQueuedRecap(patientId: number, messageId: number): boolean {
  const result = db.prepare(
    `UPDATE messages SET status = 'canceled'
     WHERE id = ? AND patient_id = ? AND kind = 'recap' AND status = 'queued'`,
  ).run(messageId, patientId);
  return result.changes === 1;
}


export default db;
