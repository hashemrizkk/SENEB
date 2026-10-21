import { readFileSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { seedPatients } from "./seed.ts";
import {
  getDoctorPatientRecord,
  listDoctorQueue,
  migrateDoctorReview,
  savePatientIntake,
  type ReviewFilter,
  type ReviewIntake,
} from "./doctor-review.ts";

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

  for (const [columnName, sql] of patientMigrations) {
    if (!patientColumnNames.has(columnName)) db.exec(sql);
  }

  db.exec("UPDATE patients SET created_at = CURRENT_TIMESTAMP WHERE created_at IS NULL");
  db.exec(
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_patients_reference_code ON patients(reference_code)",
  );
  db.exec(
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_patients_request_id ON patients(request_id)",
  );
})();

// Additive clinician-review schema migration; existing queue tables are preserved.
migrateDoctorReview(db);

// ----- Types -----

export type Patient = {
  id: number;
  name: string;
  age: number | null;
  phone: string | null;
  diabetes_type: string | null;
  last_hba1c_date: string | null;
  last_foot_exam_date: string | null;
  last_bp_date: string | null;
  next_visit_date: string | null;
  edited_by: string | null;
  edited_at: string | null;
};

export type IntakeRow = {
  id: number;
  patient_id: number;
  patient_name: string;
  input_method: string | null;
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
              last_foot_exam_date, last_bp_date, next_visit_date,
              edited_by, edited_at
       FROM patients WHERE id = ?`,
    )
    .get(id);
}

export function insertIntakeWithRevision(data: {
  patient_id: number;
  input_method: string;
  raw_text: string | null;
  structured_json: string;
  red_flags_json: string;
  meta_json: string | null;
}): number {
  return savePatientIntake(db, data);
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
        name, phone, request_id, email, self_description, reference_code, consent_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      data.name,
      data.phone,
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

export default db;
