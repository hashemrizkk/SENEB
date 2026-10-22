import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { migrateInputMethodCheck } from "../lib/db-migrations.ts";
import {
  authenticateDoctor,
  clinicianEditSchema,
  createDoctorSession,
  failedLoginIsLimited,
  getDoctorPatientRecord,
  listDoctorQueue,
  migrateDoctorReview,
  recordFailedLogin,
  requestDoctorSession,
  saveClinicianEdit,
  savePatientIntake,
  verifyDoctorSession,
} from "../lib/doctor-review.ts";
import { intakeFieldsSchema } from "../lib/intake.ts";
import { redFlags } from "../lib/rules.ts";
import {
  authenticateNurse,
  createNurseSession,
  verifyNurseSession,
} from "../lib/nurse-auth.ts";

function createLegacyDatabase(): Database.Database {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  db.exec(`
    CREATE TABLE patients (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      age INTEGER,
      phone TEXT,
      email TEXT,
      self_description TEXT,
      reference_code TEXT,
      request_id TEXT,
      consent_at TEXT,
      created_at TEXT,
      diabetes_type TEXT,
      last_hba1c_date TEXT,
      last_kidney_labs_date TEXT,
      last_foot_exam_date TEXT,
      last_eye_exam_date TEXT,
      last_bp_date TEXT,
      next_visit_date TEXT
    );
    CREATE TABLE intakes (
      id INTEGER PRIMARY KEY,
      patient_id INTEGER NOT NULL REFERENCES patients(id),
      input_method TEXT,
      raw_text TEXT,
      structured_json TEXT,
      red_flags_json TEXT,
      meta_json TEXT,
      created_at TEXT
    );
    CREATE TABLE notes (
      id INTEGER PRIMARY KEY,
      patient_id INTEGER NOT NULL REFERENCES patients(id),
      note_text TEXT,
      check_result_json TEXT,
      override_reason TEXT,
      created_at TEXT
    );
    CREATE TABLE queue_entries (
      intake_id INTEGER,
      status TEXT NOT NULL,
      priority TEXT
    );
    CREATE TABLE queue_audit (
      id INTEGER PRIMARY KEY,
      intake_id INTEGER,
      status TEXT
    );
    INSERT INTO patients (id, name, age, phone, email, created_at)
    VALUES (1, 'Test Patient', 40, '01012345678', '', '2025-01-01T10:00:00Z');
    INSERT INTO intakes (
      id, patient_id, input_method, raw_text, structured_json,
      red_flags_json, meta_json, created_at
    ) VALUES (
      1, 1, 'voice', 'Original patient text',
      '{"missed_doses":false,"hypoglycemia_episodes":1,"hypoglycemia_symptoms":null,"foot_problem":false,"vision_change":false,"emergency_symptoms_mentioned":null,"symptoms_text":null}',
      '{"flags":[],"unanswered":[]}',
      '{"llm_mode":"none","model":null,"needs_review":false,"contradiction":false}',
      '2025-01-01T10:00:00Z'
    );
    INSERT INTO queue_entries (intake_id, status, priority)
    VALUES (1, 'waiting', 'urgent');
  `);
  return db;
}

function check(condition: unknown, message: string): asserts condition {
  assert.ok(condition, message);
}

function testClinicianNotePersistence(): void {
  const database = createLegacyDatabase();
  try {
    migrateDoctorReview(database);
    migrateInputMethodCheck(database);
    database.prepare(
      `INSERT INTO notes (
         patient_id, note_text, check_result_json, edited_by, created_at
       ) VALUES (?, ?, ?, ?, ?)`,
    ).run(1, "Original clinician note", "intake:1", "Dr Test", "2025-01-01T11:00:00Z");

    const baseEdit = {
      patient: {
        name: "Test Patient",
        phone: "01012345678",
        email: "",
        self_description: "",
      },
      fields: intakeFieldsSchema.parse({
        missed_doses: false,
        hypoglycemia_episodes: 1,
        hypoglycemia_symptoms: null,
        foot_problem: false,
        vision_change: false,
        emergency_symptoms_mentioned: null,
        symptoms_text: null,
      }),
      raw_text: "Original patient text",
      priority: "urgent" as const,
      status: "seen" as const,
      reason: "",
    };
    const readNotes = () => database.prepare(
      "SELECT note_text FROM notes WHERE check_result_json = 'intake:1' ORDER BY id",
    ).all() as { note_text: string }[];

    const statusOnly = clinicianEditSchema.parse({ ...baseEdit, version: 1 });
    const firstSave = saveClinicianEdit(
      database, 1, "Dr Test", statusOnly, "Original clinician note",
    );
    assert.equal(firstSave.ok, true);
    if (!firstSave.ok) throw new Error("The status-only edit unexpectedly conflicted.");
    assert.equal(firstSave.noteChanged, false);
    assert.equal(readNotes()[0]?.note_text, "Original clinician note");

    const emptyNote = clinicianEditSchema.parse({ ...baseEdit, version: 2, note: "" });
    const emptySave = saveClinicianEdit(
      database, 1, "Dr Test", emptyNote, "Original clinician note",
    );
    assert.equal(emptySave.ok, true);
    if (!emptySave.ok) throw new Error("The empty-note edit unexpectedly conflicted.");
    assert.equal(emptySave.noteChanged, false);
    assert.equal(readNotes()[0]?.note_text, "Original clinician note");

    const changedNote = clinicianEditSchema.parse({
      ...baseEdit,
      version: 3,
      note: "New clinician note",
    });
    const changedSave = saveClinicianEdit(
      database, 1, "Dr Test", changedNote, "Original clinician note",
    );
    assert.equal(changedSave.ok, true);
    if (!changedSave.ok) throw new Error("The changed-note edit unexpectedly conflicted.");
    assert.equal(changedSave.noteChanged, true);
    assert.deepEqual(readNotes().map((row) => row.note_text), [
      "Original clinician note",
      "New clinician note",
    ]);
    const changedFields = JSON.parse(
      changedSave.record.revisions[3]!.changed_fields_json,
    ) as string[];
    assert.ok(changedFields.includes("notes.note_text"));

    const omittedNote = clinicianEditSchema.parse({ ...baseEdit, version: 4 });
    const omittedSave = saveClinicianEdit(
      database, 1, "Dr Test", omittedNote, "New clinician note",
    );
    assert.equal(omittedSave.ok, true);
    if (!omittedSave.ok) throw new Error("The omitted-note edit unexpectedly conflicted.");
    assert.equal(omittedSave.noteChanged, false);
    const laterEmptyNote = clinicianEditSchema.parse({
      ...baseEdit,
      version: 5,
      note: "",
    });
    const laterEmptySave = saveClinicianEdit(
      database, 1, "Dr Test", laterEmptyNote, "New clinician note",
    );
    assert.equal(laterEmptySave.ok, true);
    if (!laterEmptySave.ok) throw new Error("The later empty-note edit unexpectedly conflicted.");
    assert.equal(laterEmptySave.noteChanged, false);
    assert.deepEqual(readNotes().map((row) => row.note_text), [
      "Original clinician note",
      "New clinician note",
    ]);
  } finally {
    database.close();
  }
}

function testInputMethodMigration(): void {
  const database = new Database(":memory:");
  database.pragma("foreign_keys = ON");
  try {
    database.exec(`
      CREATE TABLE patients (id INTEGER PRIMARY KEY);
      CREATE TABLE intakes (
        id INTEGER PRIMARY KEY,
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
      CREATE TABLE child_records (
        intake_id INTEGER REFERENCES intakes(id), detail TEXT
      );
      INSERT INTO patients VALUES (1);
      INSERT INTO intakes (id, patient_id, input_method, raw_text)
      VALUES (9, 1, 'assisted', 'preserved');
      INSERT INTO child_records VALUES (9, 'child preserved');
    `);
    migrateInputMethodCheck(database);
    migrateInputMethodCheck(database);
    assert.deepEqual(
      database.prepare("SELECT id, input_method, raw_text FROM intakes").get(),
      { id: 9, input_method: "assisted", raw_text: "preserved" },
    );
    assert.deepEqual(
      database.prepare("SELECT intake_id, detail FROM child_records").get(),
      { intake_id: 9, detail: "child preserved" },
    );
    assert.deepEqual(database.pragma("foreign_key_check"), []);
    database.prepare(
      "UPDATE intakes SET input_method = 'mixed' WHERE id = 9",
    ).run();
  } finally {
    database.close();
  }
}

const db = createLegacyDatabase();
try {
  testInputMethodMigration();
  testClinicianNotePersistence();
  migrateDoctorReview(db);
  let record = getDoctorPatientRecord(db, 1);
  check(record, "legacy patient should load after migration");
  assert.equal(record.latestIntake?.status, "triaged");
  assert.equal(record.latestIntake?.priority, "urgent");
  assert.equal(record.latestIntake?.revisions.length, 1);
  assert.equal(record.latestIntake?.revisions[0]?.is_backfill, 1);
  assert.equal(record.latestIntake?.originalTrustworthy, false);
  assert.equal(record.latestIntake?.input_method, "voice");
  assert.equal(listDoctorQueue(db, "all")[0]?.input_method, "voice");

  const migratedSnapshot = JSON.parse(record.latestIntake!.revisions[0]!.snapshot_json) as {
    intake: { status: string; priority: string; input_method: string };
  };
  assert.equal(migratedSnapshot.intake.status, "triaged");
  assert.equal(migratedSnapshot.intake.priority, "urgent");
  assert.equal(migratedSnapshot.intake.input_method, "voice");

  migrateDoctorReview(db);
  record = getDoctorPatientRecord(db, 1);
  check(record, "patient should remain available after a repeat migration");
  assert.equal(record.latestIntake?.revisions.length, 1);
  assert.equal(
    db.prepare<[], { count: number }>("SELECT COUNT(*) AS count FROM queue_entries").get()?.count,
    1,
    "legacy queue tables must be preserved",
  );

  const defaultFields = intakeFieldsSchema.parse({
    missed_doses: null,
    hypoglycemia_episodes: null,
    hypoglycemia_symptoms: null,
    foot_problem: null,
    vision_change: null,
    emergency_symptoms_mentioned: null,
    symptoms_text: null,
  });
  const nextIntakeId = savePatientIntake(db, {
    patient_id: 1,
    input_method: "tap",
    raw_text: null,
    structured_json: JSON.stringify(defaultFields),
    red_flags_json: JSON.stringify(redFlags(defaultFields)),
    meta_json: '{"llm_mode":"none","model":null,"needs_review":false,"contradiction":false}',
  }, new Date("2025-01-02T10:00:00Z").toISOString());
  const newIntake = getDoctorPatientRecord(db, 1)?.intakes.find((item) => item.id === nextIntakeId);
  check(newIntake, "new intake should load");
  assert.equal(newIntake.revisions.length, 1);
  assert.equal(newIntake.revisions[0]?.source, "patient");
  assert.equal(newIntake.revisions[0]?.is_backfill, 0);
  assert.equal(newIntake.originalTrustworthy, true);

  const originalFields = getDoctorPatientRecord(db, 1)?.intakes
    .find((item) => item.id === 1)?.fields;
  check(originalFields, "initial registration answers should be available");
  const followupId = savePatientIntake(
    db,
    {
      patient_id: 1,
      input_method: "tap",
      raw_text: "Fake clinic follow-up",
      structured_json: JSON.stringify({ ...defaultFields, missed_doses: true }),
      red_flags_json: JSON.stringify(redFlags({ ...defaultFields, missed_doses: true })),
      meta_json: '{"llm_mode":"none","model":null,"needs_review":false,"contradiction":false}',
    },
    new Date("2025-01-03T10:00:00Z").toISOString(),
    { source: "clinician", editedBy: "Dr Test", reason: "Clinic follow-up" },
  );
  const afterFollowup = getDoctorPatientRecord(db, 1);
  check(afterFollowup, "patient should load after a clinic follow-up");
  const clinicFollowup = afterFollowup.intakes.find((item) => item.id === followupId);
  check(clinicFollowup, "clinic follow-up should be a separate record");
  assert.equal(clinicFollowup.revisions[0]?.source, "clinician");
  assert.equal(clinicFollowup.revisions[0]?.edited_by, "Dr Test");
  assert.equal(clinicFollowup.revisions[0]?.reason, "Clinic follow-up");
  assert.deepEqual(
    afterFollowup.intakes.find((item) => item.id === 1)?.fields,
    originalFields,
    "creating a follow-up must not replace the initial registration answers",
  );
  assert.equal(afterFollowup.latestIntake?.id, followupId);

  const secret = process.env.SESSION_SECRET;
  const doctorName = process.env.DOCTOR_NAME;
  const doctorPassword = process.env.DOCTOR_PASSWORD;
  const passcode = process.env.DOCTOR_PASSCODE;
  const nurseName = process.env.NURSE_NAME;
  const nursePassword = process.env.NURSE_PASSWORD;
  process.env.SESSION_SECRET = "test-session-secret-with-at-least-32-bytes";
  process.env.DOCTOR_NAME = "Dr Test";
  process.env.DOCTOR_PASSWORD = "test-clinician-password";
  process.env.NURSE_NAME = "Nurse Test";
  process.env.NURSE_PASSWORD = "test-nurse-password";
  delete process.env.DOCTOR_PASSCODE;
  try {
    assert.equal(authenticateDoctor("Dr Test", "test-clinician-password"), true);
    assert.equal(authenticateDoctor("Dr Other", "test-clinician-password"), false);
    assert.equal(authenticateDoctor("Dr Test", "wrong"), false);
    process.env.DOCTOR_PASSCODE = "test-clinic-passcode";
    process.env.DOCTOR_NAME = "";
    process.env.DOCTOR_PASSWORD = "";
    assert.equal(authenticateDoctor("Any Staff", "test-clinic-passcode"), true);
    process.env.DOCTOR_NAME = "Dr Test";
    process.env.DOCTOR_PASSWORD = "test-clinician-password";
    delete process.env.DOCTOR_PASSWORD;
    assert.throws(
      () => authenticateDoctor("Dr Test", "test-clinician-password"),
      /DOCTOR_NAME and DOCTOR_PASSWORD must both be configured/,
    );
    process.env.DOCTOR_PASSWORD = "test-clinician-password";
    assert.equal(authenticateNurse("Nurse Test", "test-nurse-password"), true);
    assert.equal(authenticateNurse("Dr Test", "test-nurse-password"), false);
    assert.equal(authenticateNurse("Nurse Test", "wrong"), false);
    const nurseToken = createNurseSession("Nurse Test", 1_000);
    assert.deepEqual(verifyNurseSession(nurseToken, 1_001), {
      name: "Nurse Test",
      expiresAt: 14_401_000,
    });
    assert.equal(verifyDoctorSession(nurseToken, 1_001), null);
    assert.equal(verifyNurseSession(createDoctorSession("Dr Test", 1_000), 1_001), null);
    const token = createDoctorSession("Dr Test", 1_000);
    assert.deepEqual(verifyDoctorSession(token, 1_001), {
      name: "Dr Test",
      expiresAt: 14_401_000,
    });
    assert.equal(verifyDoctorSession(token, 20_000_000), null);
    assert.equal(verifyDoctorSession(`${token}x`, 1_001), null);
    const activeToken = createDoctorSession("Dr Test");
    const activeSession = verifyDoctorSession(activeToken);
    check(activeSession, "new session should be valid");
    const request = new Request("http://localhost/api/doctor/intakes/1", {
      headers: { cookie: `doctor_session=${encodeURIComponent(activeToken)}` },
    });
    assert.deepEqual(requestDoctorSession(request), activeSession);
    const limitedRequest = new Request("http://localhost/api/doctor/login", {
      headers: { "x-real-ip": "192.0.2.11" },
    });
    for (let count = 0; count < 5; count += 1) recordFailedLogin(limitedRequest);
    assert.equal(failedLoginIsLimited(limitedRequest), true);

    delete process.env.DOCTOR_NAME;
    delete process.env.DOCTOR_PASSWORD;
    process.env.DOCTOR_PASSCODE = "test-clinic-passcode";
    assert.equal(authenticateDoctor("Any Staff", "test-clinic-passcode"), true);
    assert.equal(authenticateDoctor("Any Staff", "wrong"), false);
  } finally {
    if (secret === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = secret;
    if (doctorName === undefined) delete process.env.DOCTOR_NAME;
    else process.env.DOCTOR_NAME = doctorName;
    if (doctorPassword === undefined) delete process.env.DOCTOR_PASSWORD;
    else process.env.DOCTOR_PASSWORD = doctorPassword;
    if (nurseName === undefined) delete process.env.NURSE_NAME;
    else process.env.NURSE_NAME = nurseName;
    if (nursePassword === undefined) delete process.env.NURSE_PASSWORD;
    else process.env.NURSE_PASSWORD = nursePassword;
    if (passcode === undefined) delete process.env.DOCTOR_PASSCODE;
    else process.env.DOCTOR_PASSCODE = passcode;
  }

  const edit = {
    version: 1,
    patient: {
      name: "Test Patient Updated",
      phone: "01012345678",
      email: "doctor-test@example.org",
      self_description: "Fake test record",
    },
    fields: {
      ...defaultFields,
      missed_doses: true,
      hypoglycemia_episodes: 0,
    },
    raw_text: "Edited test note",
    priority: "important" as const,
    status: "seen" as const,
    note: "N".repeat(3_000),
    reason: "Test edit",
  };
  const saved = saveClinicianEdit(
    db, 1, "Dr Test", edit, null, new Date("2025-01-02T10:00:00Z"),
  );
  assert.equal(saved.ok, true);
  if (!saved.ok) throw new Error("The valid clinician edit unexpectedly conflicted.");
  assert.equal(saved.record.version, 2);
  assert.equal(saved.record.status, "seen");
  assert.equal(saved.record.priority, "important");
  assert.equal(saved.record.flags.flags.includes("missed doses"), true);
  assert.equal(saved.record.input_method, "voice", "doctor edit preserves original provenance");
  assert.equal(saved.record.revisions[0]?.snapshot_json.includes('"input_method":"voice"'), true);
  assert.equal(saved.record.revisions[1]?.snapshot_json.includes('"input_method":"voice"'), true);
  assert.equal(saved.record.revisions.length, 2);
  const changedFields = JSON.parse(
    saved.record.revisions[1]!.changed_fields_json,
  ) as string[];
  for (const field of ["patient.name", "intake.status", "intake.priority"]) {
    assert.ok(changedFields.includes(field), `revision should include ${field}`);
  }
  assert.equal(saved.record.doctorNotes[0]?.note_text, "N".repeat(3_000));

  const stale = saveClinicianEdit(db, 1, "Dr Test", edit, null);
  assert.deepEqual(stale, { ok: false, conflict: true });

  console.log("Doctor workflow tests passed: migration, queue import, revisions, edits, conflicts, and sessions.");
} finally {
  db.close();
}
