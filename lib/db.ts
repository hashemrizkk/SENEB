import { readFileSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { seedPatients } from "./seed.ts";

// ----- Connection (singleton for dev hot-reload) -----

const databasePath = path.join(process.cwd(), "hackathon.db");
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

// ----- Safe migration: add intakes.meta_json if missing -----

const intakeColumns = db
  .prepare<[string], { name: string }>(
    "SELECT name FROM pragma_table_info(?) WHERE name = 'meta_json'",
  )
  .all("intakes");

if (intakeColumns.length === 0) {
  db.exec("ALTER TABLE intakes ADD COLUMN meta_json TEXT");
}

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

// ----- Query functions -----

export function getPatient(id: number): Patient | undefined {
  return db
    .prepare<[number], Patient>(
      `SELECT id, name, age, phone, diabetes_type, last_hba1c_date,
              last_foot_exam_date, last_bp_date, next_visit_date
       FROM patients WHERE id = ?`,
    )
    .get(id);
}

export function listPatients(): Patient[] {
  return db
    .prepare<[], Patient>(
      `SELECT id, name, age, phone, diabetes_type, last_hba1c_date,
              last_foot_exam_date, last_bp_date, next_visit_date
       FROM patients ORDER BY id`,
    )
    .all();
}

export function insertIntake(data: {
  patient_id: number;
  input_method: string;
  raw_text: string | null;
  structured_json: string;
  red_flags_json: string;
  meta_json: string | null;
}): number {
  const result = db
    .prepare(
      `INSERT INTO intakes (patient_id, input_method, raw_text, structured_json, red_flags_json, meta_json)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      data.patient_id,
      data.input_method,
      data.raw_text,
      data.structured_json,
      data.red_flags_json,
      data.meta_json,
    );
  return Number(result.lastInsertRowid);
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

export default db;
