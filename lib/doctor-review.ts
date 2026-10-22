import type Database from "better-sqlite3";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import {
  emailSchema,
  fullNameSchema,
  phoneSchema,
} from "./registration.ts";
import {
  intakeFieldsSchema,
  type IntakeFields,
  type InputMethod,
  intakeMetaSchema,
} from "./intake.ts";
import { redFlags, type RedFlagResult } from "./rules.ts";

export type ReviewStatus = "new" | "triaged" | "seen";
export type ReviewPriority = "urgent" | "important" | "normal" | null;

export const clinicianEditSchema = z.object({
  version: z.number().int().positive(),
  patient: z.object({
    name: fullNameSchema,
    phone: phoneSchema,
    email: emailSchema,
    self_description: z.string().trim().max(300),
  }).strict(),
  fields: intakeFieldsSchema,
  raw_text: z.string().max(1_000).nullable(),
  priority: z.enum(["urgent", "important", "normal"]).nullable(),
  status: z.enum(["new", "triaged", "seen"]),
  note: z.string().trim().max(4_000).optional(),
  reason: z.string().trim().max(500),
}).strict();

export type ClinicianEdit = z.infer<typeof clinicianEditSchema>;

type PatientSnapshot = {
  id: number;
  name: string;
  age: number | null;
  phone: string | null;
  email: string | null;
  self_description: string | null;
  reference_code: string | null;
  request_id: string | null;
  consent_at: string | null;
  created_at: string | null;
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

type IntakeSnapshot = {
  id: number;
  patient_id: number;
  input_method: InputMethod | "assisted" | null;
  raw_text: string | null;
  structured_json: string | null;
  red_flags_json: string | null;
  meta_json: string | null;
  created_at: string | null;
  priority: ReviewPriority;
  status: ReviewStatus;
  version: number;
  edited_by: string | null;
  edited_at: string | null;
};

export type IntakeRevision = {
  id: number;
  intake_id: number;
  revision: number;
  source: "patient" | "clinician";
  edited_by: string | null;
  edited_at: string;
  reason: string | null;
  snapshot_json: string;
  changed_fields_json: string;
  is_backfill: number;
};

export type ReviewIntake = IntakeSnapshot & {
  patient_name: string;
  reference_code: string | null;
  fields: IntakeFields;
  flags: RedFlagResult;
  meta: z.infer<typeof intakeMetaSchema> | null;
  originalFields: IntakeFields | null;
  originalTrustworthy: boolean;
  flagsCount: number;
  edited: boolean;
  unansweredCount: number;
  revisions: IntakeRevision[];
  doctorNotes: {
    id: number;
    note_text: string | null;
    edited_by: string | null;
    created_at: string | null;
  }[];
};

export type ReviewFilter = "new" | "triaged" | "all";

function tableColumns(db: Database.Database, table: string): Set<string> {
  return new Set(
    db
      .prepare<[string], { name: string }>("SELECT name FROM pragma_table_info(?)")
      .all(table)
      .map((column) => column.name),
  );
}

function addColumnIfMissing(
  db: Database.Database,
  columns: Set<string>,
  name: string,
  declaration: string,
): void {
  if (columns.has(name)) return;
  db.exec(`ALTER TABLE intakes ADD COLUMN ${name} ${declaration}`);
  columns.add(name);
}

function readPatient(
  db: Database.Database,
  patientId: number,
): PatientSnapshot | undefined {
  return db
    .prepare<[number], PatientSnapshot>(
      `SELECT id, name, age, phone, email, self_description, reference_code,
              request_id, consent_at, created_at, diabetes_type,
              last_hba1c_date, last_kidney_labs_date, last_foot_exam_date,
              last_eye_exam_date, last_bp_date, next_visit_date,
              edited_by, edited_at
       FROM patients WHERE id = ?`,
    )
    .get(patientId);
}

function readIntake(
  db: Database.Database,
  intakeId: number,
): IntakeSnapshot | undefined {
  return db
    .prepare<[number], IntakeSnapshot>(
      `SELECT id, patient_id, input_method, raw_text, structured_json,
              red_flags_json, meta_json, created_at, priority, status, version,
              edited_by, edited_at
       FROM intakes WHERE id = ?`,
    )
    .get(intakeId);
}

function snapshotFor(
  patient: PatientSnapshot,
  intake: IntakeSnapshot,
): Record<string, unknown> {
  return {
    patient: {
      name: patient.name,
      age: patient.age,
      phone: patient.phone,
      email: patient.email,
      self_description: patient.self_description,
      reference_code: patient.reference_code,
      request_id: patient.request_id,
      consent_at: patient.consent_at,
      created_at: patient.created_at,
      diabetes_type: patient.diabetes_type,
      last_hba1c_date: patient.last_hba1c_date,
      last_kidney_labs_date: patient.last_kidney_labs_date,
      last_foot_exam_date: patient.last_foot_exam_date,
      last_eye_exam_date: patient.last_eye_exam_date,
      last_bp_date: patient.last_bp_date,
      next_visit_date: patient.next_visit_date,
    },
    intake: {
      id: intake.id,
      patient_id: intake.patient_id,
      input_method: intake.input_method,
      raw_text: intake.raw_text,
      structured_json: intake.structured_json,
      red_flags_json: intake.red_flags_json,
      meta_json: intake.meta_json,
      created_at: intake.created_at,
      priority: intake.priority,
      status: intake.status,
    },
  };
}

function insertRevision(
  db: Database.Database,
  intakeId: number,
  options: {
    source: "patient" | "clinician";
    editedBy: string | null;
    reason: string | null;
    changedFields: string[];
    isBackfill: boolean;
    editedAt?: string;
  },
): void {
  const patient = readPatient(
    db,
    db
      .prepare<[number], { patient_id: number }>(
        "SELECT patient_id FROM intakes WHERE id = ?",
      )
      .get(intakeId)?.patient_id ?? -1,
  );
  const intake = readIntake(db, intakeId);
  if (!patient || !intake) {
    throw new Error("Cannot create a revision for a missing intake or patient.");
  }
  const nextRevision =
    db
      .prepare<[number], { revision: number }>(
        "SELECT MAX(revision) AS revision FROM intake_revisions WHERE intake_id = ?",
      )
      .get(intakeId)?.revision ?? 0;
  const maxRevision = Number.isInteger(nextRevision) ? nextRevision : 0;
  db.prepare(
    `INSERT INTO intake_revisions (
       intake_id, revision, source, edited_by, edited_at, reason,
       snapshot_json, changed_fields_json, is_backfill
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    intakeId,
    maxRevision + 1,
    options.source,
    options.editedBy,
    options.editedAt ?? new Date().toISOString(),
    options.reason,
    JSON.stringify(snapshotFor(patient, intake)),
    JSON.stringify(options.changedFields),
    options.isBackfill ? 1 : 0,
  );
}

function backfillRevisions(db: Database.Database): void {
  const intakes = db
    .prepare<[], { id: number }>(
      `SELECT i.id FROM intakes i
       LEFT JOIN intake_revisions r
         ON r.intake_id = i.id AND r.revision = 1
       WHERE r.id IS NULL ORDER BY i.id`,
    )
    .all();
  for (const intake of intakes) {
    insertRevision(db, intake.id, {
      source: "patient",
      editedBy: null,
      reason: "Reconstructed by migration from the current record; original submission was not preserved.",
      changedFields: [],
      isBackfill: true,
    });
  }
}

function importLegacyQueueState(db: Database.Database): void {
  const tables = db
    .prepare<[], { name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('queue_entries', 'queue_audit')",
    )
    .all()
    .map((table) => table.name);
  if (!tables.includes("queue_entries")) return;

  const columns = tableColumns(db, "queue_entries");
  if (
    !columns.has("intake_id") ||
    !columns.has("status") ||
    !columns.has("priority")
  ) {
    throw new Error("Legacy queue_entries table is missing required columns.");
  }
  const rows = db
    .prepare<
      [],
      { intake_id: number; status: string; priority: string | null }
    >(
      `SELECT intake_id, status, priority
       FROM queue_entries WHERE intake_id IS NOT NULL`,
    )
    .all();
  const update = db.prepare(
    "UPDATE intakes SET status = ?, priority = ? WHERE id = ?",
  );
  for (const row of rows) {
    const status: ReviewStatus =
      row.status === "in_visit" || row.status === "seen"
        ? "seen"
        : "triaged";
    const priority =
      row.priority === "urgent" ||
      row.priority === "important" ||
      row.priority === "normal"
        ? row.priority
        : null;
    update.run(status, priority, row.intake_id);
  }
}

export function migrateDoctorReview(db: Database.Database): void {
  const initialColumns = tableColumns(db, "intakes");
  const shouldImportLegacyQueue = !initialColumns.has("status");
  db.transaction(() => {
    addColumnIfMissing(
      db,
      initialColumns,
      "status",
      "TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'triaged', 'seen'))",
    );
    addColumnIfMissing(
      db,
      initialColumns,
      "priority",
      "TEXT CHECK (priority IN ('urgent', 'important', 'normal'))",
    );
    addColumnIfMissing(db, initialColumns, "version", "INTEGER NOT NULL DEFAULT 1");
    addColumnIfMissing(db, initialColumns, "edited_by", "TEXT");
    addColumnIfMissing(db, initialColumns, "edited_at", "TEXT");
    const patients = tableColumns(db, "patients");
    if (!patients.has("edited_by")) {
      db.exec("ALTER TABLE patients ADD COLUMN edited_by TEXT");
    }
    if (!patients.has("edited_at")) {
      db.exec("ALTER TABLE patients ADD COLUMN edited_at TEXT");
    }
    const notes = tableColumns(db, "notes");
    if (!notes.has("edited_by")) {
      db.exec("ALTER TABLE notes ADD COLUMN edited_by TEXT");
    }
    db.exec(`
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
      CREATE INDEX IF NOT EXISTS idx_intakes_review_queue
        ON intakes(status, created_at, id);
    `);
    if (shouldImportLegacyQueue) importLegacyQueueState(db);
    backfillRevisions(db);
  })();
}

function parseJson<T>(
  value: string | null,
  schema: z.ZodType<T>,
  fallback: T,
): T {
  if (value === null) return fallback;
  const parsedJson: unknown = JSON.parse(value);
  const parsed = schema.safeParse(parsedJson);
  return parsed.success ? parsed.data : fallback;
}

function reviewIntake(
  db: Database.Database,
  row: IntakeSnapshot & {
    patient_name: string;
    reference_code: string | null;
  },
): ReviewIntake {
  const emptyFields = intakeFieldsSchema.parse({
    missed_doses: null,
    hypoglycemia_episodes: null,
    hypoglycemia_symptoms: null,
    foot_problem: null,
    vision_change: null,
    emergency_symptoms_mentioned: null,
    symptoms_text: null,
  });
  const fields = parseJson(row.structured_json, intakeFieldsSchema, emptyFields);
  const flags = redFlags(fields);
  const meta = parseJson(row.meta_json, intakeMetaSchema, null);
  const revisions = db
    .prepare<[number], IntakeRevision>(
      `SELECT id, intake_id, revision, source, edited_by, edited_at, reason,
              snapshot_json, changed_fields_json, is_backfill
       FROM intake_revisions WHERE intake_id = ? ORDER BY revision`,
    )
    .all(row.id);
  const original = revisions[0];
  let originalFields: IntakeFields | null = null;
  if (original && original.is_backfill === 0) {
    try {
      const snapshot = JSON.parse(original.snapshot_json) as {
        intake?: { structured_json?: string | null };
      };
      originalFields = parseJson(
        snapshot.intake?.structured_json ?? null,
        intakeFieldsSchema,
        emptyFields,
      );
    } catch {
      originalFields = null;
    }
  }
  const doctorNotes = db
    .prepare<
      [number, string],
      { id: number; note_text: string | null; edited_by: string | null; created_at: string | null }
    >(
      `SELECT id, note_text, edited_by, created_at
       FROM notes
       WHERE patient_id = ? AND edited_by IS NOT NULL
         AND check_result_json = ?
       ORDER BY created_at, id`,
    )
    .all(row.patient_id, `intake:${row.id}`);
  return {
    ...row,
    fields,
    flags,
    meta,
    originalFields,
    originalTrustworthy: original?.is_backfill === 0,
    flagsCount: flags.flags.length,
    edited: row.edited_by !== null,
    unansweredCount: flags.unanswered.length,
    revisions,
    doctorNotes,
  };
}

export function getDoctorPatientRecord(
  db: Database.Database,
  patientId: number,
): {
  patient: PatientSnapshot;
  intakes: ReviewIntake[];
  latestIntake: ReviewIntake | null;
} | null {
  const patient = readPatient(db, patientId);
  if (!patient) return null;
  const rows = db
    .prepare<
      [number],
      IntakeSnapshot & { patient_name: string; reference_code: string | null }
    >(
      `SELECT i.id, i.patient_id, i.input_method, i.raw_text,
              i.structured_json, i.red_flags_json, i.meta_json, i.created_at,
              i.priority, i.status, i.version, i.edited_by, i.edited_at,
              p.name AS patient_name, p.reference_code
       FROM intakes i JOIN patients p ON p.id = i.patient_id
       WHERE i.patient_id = ?
       ORDER BY i.created_at DESC, i.id DESC`,
    )
    .all(patientId);
  const intakes = rows.map((row) => reviewIntake(db, row));
  return { patient, intakes, latestIntake: intakes[0] ?? null };
}

export function listDoctorQueue(
  db: Database.Database,
  filter: ReviewFilter,
): ReviewIntake[] {
  const rows = db
    .prepare<
      [string, string],
      IntakeSnapshot & { patient_name: string; reference_code: string | null }
    >(
      `SELECT i.id, i.patient_id, i.input_method, i.raw_text,
              i.structured_json, i.red_flags_json, i.meta_json, i.created_at,
              i.priority, i.status, i.version, i.edited_by, i.edited_at,
              p.name AS patient_name, p.reference_code
       FROM intakes i JOIN patients p ON p.id = i.patient_id
       WHERE (? = 'all' OR i.status = ?)
       ORDER BY i.created_at ASC, i.id ASC`,
    )
    .all(filter, filter);
  const records = rows.map((row) => reviewIntake(db, row));
  return records.sort((left, right) => {
    if (filter === "new") {
      const leftEmergency = left.flags.flags.includes(
        "possible emergency, review first",
      );
      const rightEmergency = right.flags.flags.includes(
        "possible emergency, review first",
      );
      return (
        Number(rightEmergency) - Number(leftEmergency) ||
        right.flagsCount - left.flagsCount ||
        (left.created_at ?? "").localeCompare(right.created_at ?? "") ||
        left.id - right.id
      );
    }
    if (filter === "triaged") {
      const rank = (priority: ReviewPriority) =>
        priority === "urgent" ? 0 : priority === "important" ? 1 : priority === "normal" ? 2 : 3;
      return (
        rank(left.priority) - rank(right.priority) ||
        (left.created_at ?? "").localeCompare(right.created_at ?? "") ||
        left.id - right.id
      );
    }
    return (
      (left.created_at ?? "").localeCompare(right.created_at ?? "") ||
      left.id - right.id
    );
  });
}

export type SaveClinicianEditResult =
  | { ok: true; record: ReviewIntake; noteChanged: boolean }
  | { ok: false; conflict: true };

export function saveClinicianEdit(
  db: Database.Database,
  intakeId: number,
  staffName: string,
  edit: ClinicianEdit,
  previousNote: string | null,
  now = new Date(),
): SaveClinicianEditResult {
  const normalizedName = staffName.trim();
  const data = clinicianEditSchema.parse(edit);
  const current = readIntake(db, intakeId);
  if (!current) throw new Error("Intake not found.");
  if (current.version !== data.version) return { ok: false, conflict: true };
  const previousPatient = readPatient(db, current.patient_id);
  if (!previousPatient) throw new Error("Patient not found.");
  const note = data.note ?? "";
  const noteChanged = Boolean(note) && note !== (previousNote ?? "");

  const flags = redFlags(data.fields);
  const timestamp = now.toISOString();
  const nextVersion = current.version + 1;
  const newPatient = {
    ...previousPatient,
    name: data.patient.name,
    phone: data.patient.phone,
    email: data.patient.email || null,
    self_description: data.patient.self_description || null,
  };
  const newIntake = {
    ...current,
    raw_text: data.raw_text,
    structured_json: JSON.stringify(data.fields),
    red_flags_json: JSON.stringify(flags),
    status: data.status,
    priority: data.priority,
    version: nextVersion,
    edited_by: normalizedName,
    edited_at: timestamp,
  };
  const changedFields = Object.keys(newPatient)
    .filter((key) => key in previousPatient && newPatient[key as keyof PatientSnapshot] !== previousPatient[key as keyof PatientSnapshot])
    .map((key) => `patient.${key}`)
    .concat(
      Object.keys(newIntake)
        .filter((key) => key in current && newIntake[key as keyof IntakeSnapshot] !== current[key as keyof IntakeSnapshot])
        .map((key) => `intake.${key}`),
    )
    .concat(noteChanged ? ["notes.note_text"] : []);
  const revisionReason = [
    data.reason || null,
    data.priority !== current.priority && data.priority !== null
      ? "Priority source: manual."
      : null,
  ].filter((part): part is string => Boolean(part)).join(" ");
  const updatePatient = db.prepare(
    `UPDATE patients
     SET name = ?, phone = ?, email = ?, self_description = ?,
         edited_by = ?, edited_at = ?
     WHERE id = ?`,
  );
  const updateIntake = db.prepare(
    `UPDATE intakes
     SET raw_text = ?, structured_json = ?, red_flags_json = ?,
         status = ?, priority = ?, version = ?, edited_by = ?, edited_at = ?
     WHERE id = ? AND version = ?`,
  );
  const tx = db.transaction(() => {
    updatePatient.run(
      newPatient.name,
      newPatient.phone,
      newPatient.email,
      newPatient.self_description,
      normalizedName,
      timestamp,
      previousPatient.id,
    );
    const updateResult = updateIntake.run(
      newIntake.raw_text,
      newIntake.structured_json,
      newIntake.red_flags_json,
      newIntake.status,
      newIntake.priority,
      nextVersion,
      normalizedName,
      timestamp,
      intakeId,
      data.version,
    );
    if (updateResult.changes !== 1) {
      throw new Error("The intake changed while saving.");
    }
    insertRevision(db, intakeId, {
      source: "clinician",
      editedBy: normalizedName,
      reason: revisionReason || null,
      changedFields,
      isBackfill: false,
      editedAt: timestamp,
    });
    if (noteChanged) {
      db.prepare(
        `INSERT INTO notes (
           patient_id, note_text, check_result_json, override_reason,
           edited_by, created_at
         ) VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(
        current.patient_id,
        note,
        `intake:${intakeId}`,
        data.reason || null,
        normalizedName,
        timestamp,
      );
    }
  });
  tx();
  const record = getDoctorPatientRecord(db, current.patient_id);
  const saved = record?.intakes.find((intake) => intake.id === intakeId);
  if (!saved) throw new Error("Saved intake could not be reloaded.");
  return { ok: true, record: saved, noteChanged };
}

export function createPatientRevisionOne(
  db: Database.Database,
  intakeId: number,
  editedAt: string,
  author: {
    source: "patient" | "clinician";
    editedBy: string | null;
    reason: string | null;
  } = { source: "patient", editedBy: null, reason: null },
): void {
  insertRevision(db, intakeId, {
    source: author.source,
    editedBy: author.editedBy,
    reason: author.reason,
    changedFields: [],
    isBackfill: false,
    editedAt,
  });
}

export function savePatientIntake(
  db: Database.Database,
  data: {
    patient_id: number;
    input_method: InputMethod;
    raw_text: string | null;
    structured_json: string;
    red_flags_json: string;
    meta_json: string | null;
    priority?: ReviewPriority;
  },
  editedAt = new Date().toISOString(),
  author: {
    source: "patient" | "clinician";
    editedBy: string | null;
    reason: string | null;
  } = { source: "patient", editedBy: null, reason: null },
): number {
  return db.transaction(() => {
    const result = db.prepare(
      `INSERT INTO intakes (
         patient_id, input_method, raw_text, structured_json,
         red_flags_json, meta_json, priority, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      data.patient_id,
      data.input_method,
      data.raw_text,
      data.structured_json,
      data.red_flags_json,
      data.meta_json,
      data.priority ?? null,
      editedAt,
    );
    const intakeId = Number(result.lastInsertRowid);
    createPatientRevisionOne(db, intakeId, editedAt, author);
    return intakeId;
  })();
}

const SESSION_COOKIE = "doctor_session";
const SESSION_SECONDS = 4 * 60 * 60;

export type DoctorSession = {
  name: string;
  expiresAt: number;
};

function sessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || Buffer.byteLength(secret) < 32) {
    throw new Error("SESSION_SECRET must contain at least 32 bytes.");
  }
  return secret;
}

function signature(payload: string): Buffer {
  return createHmac("sha256", sessionSecret()).update(payload).digest();
}

function secureStringEqual(actual: string, expected: string): boolean {
  const actualBytes = Buffer.from(actual);
  const expectedBytes = Buffer.from(expected);
  return (
    actualBytes.length === expectedBytes.length &&
    timingSafeEqual(actualBytes, expectedBytes)
  );
}

export function authenticateDoctor(name: string, password: string): boolean {
  const expectedName = process.env.DOCTOR_NAME;
  const expectedPassword = process.env.DOCTOR_PASSWORD;
  if (expectedName || expectedPassword) {
    if (!expectedName || !expectedPassword) {
      throw new Error("DOCTOR_NAME and DOCTOR_PASSWORD must both be configured.");
    }
    return name === expectedName && secureStringEqual(password, expectedPassword);
  }

  const expectedPasscode = process.env.DOCTOR_PASSCODE;
  if (!expectedPasscode) {
    throw new Error("Configure DOCTOR_NAME and DOCTOR_PASSWORD.");
  }
  return secureStringEqual(password, expectedPasscode);
}

export function createDoctorSession(name: string, now = Date.now()): string {
  const payload = Buffer.from(
    JSON.stringify({ role: "doctor", name, issuedAt: now, expiresAt: now + SESSION_SECONDS * 1000 }),
  ).toString("base64url");
  return `${payload}.${signature(payload).toString("base64url")}`;
}

export function verifyDoctorSession(
  token: string | null | undefined,
  now = Date.now(),
): DoctorSession | null {
  if (!token) return null;
  const separator = token.lastIndexOf(".");
  if (separator < 1) return null;
  const payload = token.slice(0, separator);
  const supplied = token.slice(separator + 1);
  let expected: Buffer;
  let actual: Buffer;
  try {
    expected = signature(payload);
    actual = Buffer.from(supplied, "base64url");
  } catch {
    return null;
  }
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return null;
  }
  try {
    const decoded: unknown = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    );
    if (
      decoded === null ||
      typeof decoded !== "object" ||
      !("role" in decoded) ||
      decoded.role !== "doctor" ||
      !("name" in decoded) ||
      typeof decoded.name !== "string" ||
      !("expiresAt" in decoded) ||
      typeof decoded.expiresAt !== "number" ||
      decoded.expiresAt <= now ||
      decoded.name.length < 2 ||
      decoded.name.length > 80
    ) {
      return null;
    }
    return { name: decoded.name, expiresAt: decoded.expiresAt };
  } catch {
    return null;
  }
}

export function doctorCookieName(): string {
  return SESSION_COOKIE;
}

export function doctorCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "strict" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_SECONDS,
  };
}

export function requestDoctorSession(request: Request): DoctorSession | null {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const cookie = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE}=`));
  if (!cookie) return null;
  try {
    return verifyDoctorSession(
      decodeURIComponent(cookie.slice(SESSION_COOKIE.length + 1)),
    );
  } catch {
    return null;
  }
}

export async function currentDoctorSession(): Promise<DoctorSession | null> {
  const { cookies } = await import("next/headers");
  const cookieStore = await cookies();
  return verifyDoctorSession(cookieStore.get(SESSION_COOKIE)?.value);
}

export async function requireDoctorSession(): Promise<DoctorSession> {
  const { redirect } = await import("next/navigation");
  const session = await currentDoctorSession();
  if (!session) {
    redirect("/doctor/login");
    throw new Error("Unauthenticated doctor session.");
  }
  return session;
}

const failedLoginAttempts = new Map<string, { count: number; resetAt: number }>();
const FAILED_LOGIN_LIMIT = 5;
const FAILED_LOGIN_WINDOW_MS = 15 * 60_000;

function loginClientKey(request: Request): string {
  return (
    request.headers.get("x-real-ip")?.trim() ||
    request.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim() ||
    "local"
  );
}

export function failedLoginIsLimited(request: Request): boolean {
  const key = loginClientKey(request);
  const entry = failedLoginAttempts.get(key);
  if (!entry || entry.resetAt <= Date.now()) {
    failedLoginAttempts.delete(key);
    return false;
  }
  return entry.count >= FAILED_LOGIN_LIMIT;
}

export function recordFailedLogin(request: Request): void {
  const key = loginClientKey(request);
  const now = Date.now();
  for (const [entryKey, entry] of failedLoginAttempts) {
    if (entry.resetAt <= now) failedLoginAttempts.delete(entryKey);
  }
  const existing = failedLoginAttempts.get(key);
  if (!existing || existing.resetAt <= now) {
    if (failedLoginAttempts.size >= 10_000) {
      const oldest = failedLoginAttempts.keys().next().value;
      if (oldest !== undefined) failedLoginAttempts.delete(oldest);
    }
    failedLoginAttempts.set(key, {
      count: 1,
      resetAt: now + FAILED_LOGIN_WINDOW_MS,
    });
  } else {
    existing.count += 1;
  }
}

export function clearFailedLogins(request: Request): void {
  failedLoginAttempts.delete(loginClientKey(request));
}
