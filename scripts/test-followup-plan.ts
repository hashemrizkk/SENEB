import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  commitFollowupPlan,
  createFollowupPlanSchema,
  enrichFollowupPlan,
  seededMonitoringChecklist,
  type FollowupPlan,
} from "../lib/followup-plan.ts";
import { generateFollowupPlanDraft } from "../lib/followup-plan-drafts.ts";
import { generateEncounterDraft } from "../lib/encounter-draft.ts";
import { requestEncounterDraft } from "../lib/encounter-draft-request.ts";
import { structuredPrompt } from "../lib/llm-prompt.ts";
import { savePatientIntake } from "../lib/doctor-review.ts";

const unstated = createFollowupPlanSchema("Continue current care.");
assert.equal(
  unstated.safeParse({
    followup_interval_weeks: null,
    next_visit_date: null,
    care_gap_reminders: [],
    patient_instructions: null,
    rationale_summary: null,
  }).success,
  true,
);
assert.equal(
  unstated.safeParse({
    followup_interval_weeks: 4,
    next_visit_date: null,
    care_gap_reminders: [],
    patient_instructions: null,
    rationale_summary: null,
  }).success,
  false,
);
assert.equal(
  createFollowupPlanSchema("Review again in 3 weeks.")
    .safeParse({
      followup_interval_weeks: 3,
      next_visit_date: null,
      care_gap_reminders: [],
      patient_instructions: null,
      rationale_summary: null,
    }).success,
  true,
);

let writes = 0;
await commitFollowupPlan(false, {}, async () => { writes += 1; });
assert.equal(writes, 0, "declining a draft must persist nothing");
await commitFollowupPlan(true, {}, async () => { writes += 1; });
assert.equal(writes, 1, "confirmed draft must persist through the save callback");
console.log("PASS  plan evidence validation and confirm/decline persistence gate");

const promptRequest = structuredPrompt("Extract only supplied data.", { note: "synthetic" });
assert.equal(promptRequest.instructions, "Extract only supplied data.");
assert.deepEqual(promptRequest.messages, [
  { role: "user", content: "{\"note\":\"synthetic\"}" },
]);
console.log("PASS  AI SDK structured prompts use instructions instead of system messages");

const planCandidate = {
  followup_interval_weeks: null,
  next_visit_date: null,
  care_gap_reminders: [],
  patient_instructions: null,
  rationale_summary: null,
  monitoring_checklist: [],
  medication_changes: [],
  return_precautions: null,
  self_monitoring: null,
};
const patientDates = {
  last_hba1c_date: "2024-01-01",
  last_kidney_labs_date: "2024-01-01",
  last_foot_exam_date: "2024-01-01",
  last_eye_exam_date: "2024-01-01",
  last_bp_date: "2024-01-01",
};
const fixedToday = new Date("2026-01-01T00:00:00.000Z");
const seededChecklist = seededMonitoringChecklist(patientDates, "Continue care.", fixedToday);
assert.deepEqual(seededChecklist.map((item) => item.item), [
  "HbA1c",
  "Kidney labs",
  "Foot exam",
  "Eye exam",
  "Blood pressure check",
]);
assert.ok(seededChecklist.every((item) =>
  item.source === "guideline" && item.due_in_days !== null && item.due_in_days < 0,
));
assert.equal(
  seededMonitoringChecklist(
    { ...patientDates, last_hba1c_date: "2025-11-01" },
    "Increase metformin dose.",
    fixedToday,
  )[0]?.due_in_days,
  29,
  "a note-stated medication change uses the 90-day HbA1c threshold",
);
assert.equal(
  seededMonitoringChecklist(
    { ...patientDates, last_hba1c_date: "2025-11-01" },
    "No medication changes.",
    fixedToday,
  )[0]?.due_in_days,
  119,
  "a note explicitly denying a medication change keeps the 180-day threshold",
);
const checklistSurvivesModel = enrichFollowupPlan(
  planCandidate,
  "Continue care.",
  null,
  patientDates,
  fixedToday,
);
assert.equal(checklistSurvivesModel.monitoring_checklist.length, 5);

const medicationNote =
  "Increase metformin dose to 1000 mg; check glucose twice daily; return immediately for chest pain.";
const extractedPlan = enrichFollowupPlan({
  ...planCandidate,
  medication_changes: [{ drug: "metformin", change: "Increase metformin dose to 1000 mg" }],
  return_precautions: "return immediately for chest pain.",
  self_monitoring: "check glucose twice daily",
  monitoring_checklist: [{
    item: "check glucose twice daily",
    due_in_days: null,
    source: "doctor",
  }],
}, medicationNote, null, patientDates, fixedToday);
assert.equal(extractedPlan.medication_changes[0]?.change, "Increase metformin dose to 1000 mg");
assert.equal(extractedPlan.return_precautions, "return immediately for chest pain.");
assert.equal(extractedPlan.self_monitoring, "check glucose twice daily");
assert.equal(extractedPlan.monitoring_checklist.length, 6);
assert.deepEqual(
  createFollowupPlanSchema("No medication instructions in this note.").parse(planCandidate).medication_changes,
  [],
);
assert.equal(
  createFollowupPlanSchema("No return precaution stated.").parse(planCandidate).return_precautions,
  null,
);
assert.equal(
  createFollowupPlanSchema("No home monitoring stated.").parse(planCandidate).self_monitoring,
  null,
);
console.log("PASS  seeded overdue monitoring, medication evidence, and nullable extracted fields");

let providerCalls = 0;
const noDraftYet = await generateEncounterDraft(
  {
    note: "Increase metformin dose to 1000 mg.",
    existingDate: "2026-02-01",
    patientDates,
    savedDraft: null,
    providerConfigured: false,
    payload: {},
  },
  {
    generatePlan: async () => {
      providerCalls += 1;
      throw new Error("Mock mode must not call providers.");
    },
    generateRecap: async () => {
      providerCalls += 1;
      throw new Error("Mock mode must not call providers.");
    },
    today: fixedToday,
  },
);
assert.equal(noDraftYet.mode, "mock");
assert.equal(noDraftYet.plan.monitoring_checklist.length, 5);
assert.equal(
  noDraftYet.plan.medication_changes[0]?.change,
  "Increase metformin dose to 1000 mg",
);
assert.match(noDraftYet.preview, /موعد المتابعة القادم: 2026-02-01/);
assert.equal(providerCalls, 0, "a missing draft generates a deterministic mock preview");
await assert.rejects(
  generateEncounterDraft(
    {
      note: "Continue care.",
      existingDate: null,
      patientDates,
      savedDraft: null,
      providerConfigured: true,
      payload: {},
    },
    {
      generatePlan: async () => { throw new Error("provider unavailable"); },
      generateRecap: async () => ({ output: { recap: "reviewed" }, model: "test" }),
    },
  ),
  /provider unavailable/,
);
await assert.rejects(
  requestEncounterDraft(
    async () => new Response(JSON.stringify({ ok: false, error: "safe draft error" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    }),
    "/api/doctor/encounters/1",
    { action: "draft" },
  ),
  /Encounter draft request failed/,
);
console.log("PASS  no-draft mock generation and server-error propagation for retry UI");

let latestNote = "First saved clinician note";
const drafts = new Map<number, { note: string; plan: unknown; mode: string }>();
const followupWrites = 0;
const nextVisitDate: string | null = null;
const outboxWrites = 0;
const dependencies = {
  providerConfigured: false,
  generate: async () => {
    throw new Error("Mock mode must not call a provider.");
  },
  save: (
    intakeId: number,
    note: string,
    plan: unknown,
    mode: "mock" | "llm",
  ) => {
    if (latestNote !== note) return false;
    drafts.set(intakeId, { note, plan, mode });
    return true;
  },
};
const firstDraftSaved = await generateFollowupPlanDraft(
  {
    intakeId: 7,
    noteChanged: true,
    note: latestNote,
    existingDate: null,
    patientDates: { last_hba1c_date: "2025-01-01" },
    payload: {},
  },
  dependencies,
);
assert.equal(firstDraftSaved, true);
assert.equal(drafts.get(7)?.mode, "mock");
assert.deepEqual(
  (drafts.get(7)?.plan as FollowupPlan).monitoring_checklist.map((item) => item.item),
  ["HbA1c", "Kidney labs", "Foot exam", "Eye exam", "Blood pressure check"],
  "automatic mock drafts retain deterministic monitoring items",
);
assert.equal(followupWrites, 0);
assert.equal(nextVisitDate, null);
assert.equal(outboxWrites, 0);

latestNote = "Second saved clinician note";
const secondDraftSaved = await generateFollowupPlanDraft(
  {
    intakeId: 7,
    noteChanged: true,
    note: latestNote,
    existingDate: null,
    patientDates: {},
    payload: {},
  },
  dependencies,
);
assert.equal(secondDraftSaved, true);
assert.equal(drafts.size, 1, "only one draft is retained for an intake");
assert.equal(drafts.get(7)?.note, latestNote, "the newest saved note supersedes its prior draft");
assert.equal(
  await generateFollowupPlanDraft(
    {
      intakeId: 7,
      noteChanged: true,
      note: "",
      existingDate: null,
      patientDates: {},
      payload: {},
    },
    dependencies,
  ),
  false,
  "an empty note cannot create a draft",
);
assert.equal(
  await generateFollowupPlanDraft(
    {
      intakeId: 7,
      noteChanged: false,
      note: latestNote,
      existingDate: null,
      patientDates: {},
      payload: {},
    },
    dependencies,
  ),
  false,
  "an unchanged note cannot create a draft",
);
assert.equal(followupWrites, 0);
assert.equal(nextVisitDate, null);
assert.equal(outboxWrites, 0);
console.log("PASS  automatic drafts are mock-labeled, latest-only, and have no confirmation side effects");

const previousDatabasePath = process.env.HACKATHON_DB_PATH;
const testDatabaseDirectory = mkdtempSync(path.join(tmpdir(), "st17-followup-drafts-"));
process.env.HACKATHON_DB_PATH = path.join(testDatabaseDirectory, "test.sqlite");
let closeTestDatabase: (() => void) | undefined;
try {
  const {
    default: testDatabase,
    createPatient,
    deleteFollowupPlanDraft,
    getFollowupPlanDraft,
    migratePatientFollowupDates,
    migrateFollowupPlanDrafts,
    saveFollowupPlanDraft,
  } = await import("../lib/db.ts");
  closeTestDatabase = () => testDatabase.close();
  migrateFollowupPlanDrafts(testDatabase);
  const legacyPatientDatabase = new Database(":memory:");
  try {
    legacyPatientDatabase.exec(`
      CREATE TABLE patients (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        last_hba1c_date TEXT,
        last_foot_exam_date TEXT,
        last_bp_date TEXT
      )
    `);
    migratePatientFollowupDates(legacyPatientDatabase);
    migratePatientFollowupDates(legacyPatientDatabase);
    const patientDateColumns = legacyPatientDatabase
      .prepare<[], { name: string }>("SELECT name FROM pragma_table_info('patients')")
      .all()
      .map((column) => column.name);
    assert.ok(patientDateColumns.includes("last_kidney_labs_date"));
    assert.ok(patientDateColumns.includes("last_eye_exam_date"));
  } finally {
    legacyPatientDatabase.close();
  }
  const patientId = createPatient({
    name: "Draft test patient",
    phone: "01000000000",
  });
  const intakeId = savePatientIntake(
    testDatabase,
    {
      patient_id: patientId,
      input_method: "typed",
      raw_text: null,
      structured_json: JSON.stringify({
        missed_doses: null,
        hypoglycemia_episodes: null,
        hypoglycemia_symptoms: null,
        foot_problem: null,
        vision_change: null,
        emergency_symptoms_mentioned: null,
        symptoms_text: null,
      }),
      red_flags_json: JSON.stringify({ flags: [], unanswered: [] }),
      meta_json: null,
    },
    "2025-01-01T10:00:00.000Z",
  );
  const initialOutboxCount = testDatabase.prepare<[], { count: number }>(
    "SELECT COUNT(*) AS count FROM messages",
  ).get()?.count;
  const initialFollowupCount = testDatabase.prepare<[], { count: number }>(
    "SELECT COUNT(*) AS count FROM followups",
  ).get()?.count;
  const initialNextVisit = testDatabase.prepare<[number], { next_visit_date: string | null }>(
    "SELECT next_visit_date FROM patients WHERE id = ?",
  ).get(patientId)?.next_visit_date;
  const insertNote = testDatabase.prepare(
    `INSERT INTO notes (
       patient_id, note_text, check_result_json, edited_by, created_at
     ) VALUES (?, ?, ?, ?, ?)`,
  );
  insertNote.run(
    patientId,
    "First auto-draft note",
    `intake:${intakeId}`,
    "Dr Test",
    "2025-01-01T10:00:00.000Z",
  );
  const testPlan = {
    followup_interval_weeks: null,
    next_visit_date: null,
    care_gap_reminders: [],
    patient_instructions: null,
    rationale_summary: null,
    monitoring_checklist: [],
    medication_changes: [],
    return_precautions: null,
    self_monitoring: null,
  };
  assert.equal(
    saveFollowupPlanDraft(testDatabase, intakeId, "First auto-draft note", testPlan, "mock"),
    true,
  );
  assert.ok(getFollowupPlanDraft(testDatabase, intakeId, "First auto-draft note"));

  insertNote.run(
    patientId,
    "Second auto-draft note",
    `intake:${intakeId}`,
    "Dr Test",
    "2025-01-02T10:00:00.000Z",
  );
  assert.equal(getFollowupPlanDraft(testDatabase, intakeId), null);
  assert.equal(
    saveFollowupPlanDraft(testDatabase, intakeId, "Second auto-draft note", testPlan, "mock"),
    true,
  );
  assert.equal(getFollowupPlanDraft(testDatabase, intakeId)?.plan_json, JSON.stringify(testPlan));
  assert.equal(
    saveFollowupPlanDraft(testDatabase, intakeId, "First auto-draft note", testPlan, "mock"),
    false,
    "a stale generation cannot replace the latest note draft",
  );
  assert.equal(
    testDatabase.prepare<[number], { count: number }>(
      "SELECT COUNT(*) AS count FROM followup_plan_drafts WHERE intake_id = ?",
    ).get(intakeId)?.count,
    1,
  );
  assert.equal(
    testDatabase.prepare<[], { count: number }>("SELECT COUNT(*) AS count FROM messages").get()?.count,
    initialOutboxCount,
  );
  assert.equal(
    testDatabase.prepare<[], { count: number }>("SELECT COUNT(*) AS count FROM followups").get()?.count,
    initialFollowupCount,
  );
  assert.equal(
    testDatabase.prepare<[number], { next_visit_date: string | null }>(
      "SELECT next_visit_date FROM patients WHERE id = ?",
    ).get(patientId)?.next_visit_date,
    initialNextVisit,
  );
  deleteFollowupPlanDraft(testDatabase, intakeId);
} finally {
  closeTestDatabase?.();
  if (previousDatabasePath === undefined) delete process.env.HACKATHON_DB_PATH;
  else process.env.HACKATHON_DB_PATH = previousDatabasePath;
  rmSync(testDatabaseDirectory, { recursive: true, force: true });
}
console.log("PASS  draft migration is repeatable, persists only the latest note, and does not confirm plans");
