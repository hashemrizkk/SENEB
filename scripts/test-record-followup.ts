import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  confirmFollowupRequestSchema,
  confirmRecordFollowup,
  extractRecordFollowup,
  type ConfirmFollowupInput,
} from "../lib/record-followup.ts";
import { intakeFieldsSchema, type IntakeFields } from "../lib/intake.ts";
import { createFollowupPlanSchema, type FollowupPlan } from "../lib/followup-plan.ts";
import type { prepareIntake } from "../lib/submitIntake.ts";
import { createReminderMessage } from "../lib/messaging.ts";
import { deriveInputMethod } from "../lib/voice-utils.ts";

const previousDatabasePath = process.env.HACKATHON_DB_PATH;
const testDirectory = mkdtempSync(path.join(tmpdir(), "st17-record-followup-"));
process.env.HACKATHON_DB_PATH = path.join(testDirectory, "test.sqlite");
let closeDatabase: (() => void) | undefined;

try {
  const databaseModule = await import("../lib/db.ts");
  const database = databaseModule.default;
  closeDatabase = () => database.close();
  const patientId = databaseModule.createPatient({
    name: "Follow-up test patient",
    phone: "01000000000",
      next_visit_date: "2026-11-15",
      consent_at: "2026-01-01T00:00:00.000Z",
  });
  const patientRecord = databaseModule.getPatientRecord(patientId);
  assert.ok(patientRecord);
  const patient = patientRecord.patient;
  const existingReminderId = databaseModule.enqueueOutboxMessage({
    patient_id: patientId,
    kind: "reminder",
    body: "Existing visit reminder",
    status: "queued",
    scheduled_at: "2026-11-12T00:00:00.000Z",
    sent_at: null,
  });
  const tapAnswers = {
    missed_doses: null,
    hypoglycemia_episodes: null,
    foot_problem: null,
    vision_change: null,
  };
  const emptyFields = intakeFieldsSchema.parse({
    missed_doses: null,
    hypoglycemia_episodes: null,
    hypoglycemia_symptoms: null,
    foot_problem: null,
    vision_change: null,
    emergency_symptoms_mentioned: null,
    symptoms_text: null,
  });
  const prepare = (async () => ({
    fields: emptyFields,
    flags: { flags: [], unanswered: [] },
    meta: {
      llm_mode: "mock",
      model: null,
      needs_review: false,
      contradiction: false,
    },
  })) satisfies typeof prepareIntake;
  const note = "Follow-up visit completed; review again in 4 weeks. No medication changes.";
  const inputMethod = deriveInputMethod({
    texts: [note],
    transcriptPieces: [[note]],
    editedAfterAppend: [false],
    maxChars: [4_000],
  });
  assert.equal(inputMethod, "voice");
  const extractionInput = {
    patient_id: patientId,
    tap_answers: tapAnswers,
    note,
  };
  const baselineIntake = databaseModule.latestIntakeForPatient(patientId);
  const baselineRecaps = databaseModule.latestMessages(500).filter(
    (message) => message.patient_id === patientId && message.kind === "recap",
  ).length;
  assert.equal(baselineIntake, undefined);
  const mockExtracted = await extractRecordFollowup(
    extractionInput,
    patient,
    {
      providerConfigured: false,
      prepare,
      generatePlan: async () => { throw new Error("Mock extraction called an LLM."); },
      generateRecap: async () => { throw new Error("Mock extraction called an LLM."); },
    },
  );
  assert.equal(mockExtracted.mode, "mock");
  assert.deepEqual(mockExtracted.fields, emptyFields);
  assert.equal(mockExtracted.plan.monitoring_checklist.length, 5);
  assert.equal(databaseModule.latestIntakeForPatient(patientId), undefined, "extract must not write an intake");
  console.log("PASS  mock extraction returns fields and plan without database writes");

  const validPlan = createFollowupPlanSchema(note).parse({
    followup_interval_weeks: 4,
    next_visit_date: null,
    care_gap_reminders: [],
    patient_instructions: null,
    rationale_summary: null,
    monitoring_checklist: [],
    medication_changes: [],
    return_precautions: null,
    self_monitoring: null,
  });
  const confirmInput = confirmFollowupRequestSchema.parse({
    ...extractionInput,
    action: "confirm",
    request_id: randomUUID(),
    input_method: inputMethod,
    fields: emptyFields,
    plan: validPlan,
    recap: "Your clinic follow-up is recorded.",
  });
  const ratingCalls: Array<{ intakeId: number; note: string }> = [];
  const saveDependencies = {
    save: (data: ConfirmFollowupInput & {
      fields: IntakeFields;
      plan: FollowupPlan;
      recap: string;
    }) =>
      databaseModule.saveRecordedFollowup(database, {
        patientId,
        requestId: data.request_id,
        staffName: "Dr Test",
        note: data.note,
        input_method: data.input_method,
        fields: data.fields,
        plan: data.plan,
        recapBody: data.recap,
        recapScheduledAt: "2026-01-01T00:00:00.000Z",
        reminderBody: data.plan.next_visit_date
          ? createReminderMessage({
              patientId,
              visitDate: data.plan.next_visit_date,
            }).body
          : null,
        reminderScheduledAt: data.plan.next_visit_date
          ? createReminderMessage({
              patientId,
              visitDate: data.plan.next_visit_date,
            }).scheduled_at
          : null,
        now: new Date("2026-01-01T00:00:00.000Z"),
      }),
    afterSaved: (intakeId: number, savedNote: string) =>
      ratingCalls.push({ intakeId, note: savedNote }),
  };
  const saved = confirmRecordFollowup(confirmInput, patient.next_visit_date, saveDependencies);
  assert.ok(saved);
  assert.equal(saved.duplicate, false);
  assert.equal(saved.recapQueued, true);
  assert.equal(ratingCalls.length, 1, "a saved note schedules its after-work rating");
  assert.equal(databaseModule.latestIntakeForPatient(patientId)?.id, saved.intakeId);
  assert.equal(databaseModule.getPatient(patientId)?.next_visit_date, "2026-11-15");
  assert.equal(
    databaseModule.latestMessages(500).find((message) => message.id === existingReminderId)?.status,
    "queued",
  );
  assert.equal(databaseModule.getPatientRecord(patientId)?.intakes.length, 1);
  assert.equal(
    databaseModule.getPatientRecord(patientId)?.latestIntake?.input_method,
    "voice",
  );
  assert.deepEqual(
    databaseModule.getPatientRecord(patientId)?.intakes.find((intake) => intake.id === saved.intakeId)?.fields,
    emptyFields,
    "note-only follow-ups keep unanswered tap fields null",
  );
  assert.equal(databaseModule.latestMessages(500).filter(
    (message) => message.patient_id === patientId && message.kind === "recap" && message.status === "queued",
  ).length, baselineRecaps + 1);
  console.log("PASS  null plan date preserves existing appointment and queued reminder; voice input method is saved");
  const repeated = confirmRecordFollowup(confirmInput, patient.next_visit_date, saveDependencies);
  assert.ok(repeated?.duplicate);
  assert.equal(repeated.intakeId, saved.intakeId);
  assert.equal(ratingCalls.length, 1, "an idempotent retry does not re-run rating");
  assert.equal(databaseModule.latestIntakeForPatient(patientId)?.id, saved.intakeId);
  assert.equal(databaseModule.latestMessages(500).filter(
    (message) => message.patient_id === patientId && message.kind === "recap" && message.status === "queued",
  ).length, baselineRecaps + 1);
  console.log("PASS  confirm persists one intake, plan, recap, and rating call; retries are idempotent");

  const datedNote = "Follow-up completed. Review on 2026-12-01.";
  const datedPlan = createFollowupPlanSchema(datedNote, "2026-11-15").parse({
    ...validPlan,
    followup_interval_weeks: null,
    next_visit_date: "2026-12-01",
  });
  const datedInput = confirmFollowupRequestSchema.parse({
    ...confirmInput,
    request_id: randomUUID(),
    input_method: "typed",
    note: datedNote,
    plan: datedPlan,
  });
  const datedSaved = confirmRecordFollowup(datedInput, "2026-11-15", saveDependencies);
  assert.ok(datedSaved);
  assert.equal(datedSaved.duplicate, false);
  assert.equal(datedSaved.reminderQueued, true);
  assert.equal(databaseModule.getPatient(patientId)?.next_visit_date, "2026-12-01");
  const remindersAfterDateChange = databaseModule.latestMessages(500).filter(
    (message) => message.patient_id === patientId && message.kind === "reminder",
  );
  assert.equal(
    remindersAfterDateChange.find((message) => message.id === existingReminderId)?.status,
    "canceled",
  );
  assert.equal(
    remindersAfterDateChange.filter((message) => message.status === "queued").length,
    1,
  );
  assert.equal(
    remindersAfterDateChange.filter((message) => message.status === "queued" && message.body.includes("2026-12-01")).length,
    1,
  );
  const repeatedDatedSave = confirmRecordFollowup(datedInput, "2026-11-15", saveDependencies);
  assert.ok(repeatedDatedSave?.duplicate);
  const remindersAfterRetry = databaseModule.latestMessages(500).filter(
    (message) => message.patient_id === patientId && message.kind === "reminder",
  );
  assert.equal(remindersAfterRetry.filter((message) => message.status === "queued").length, 1);
  assert.equal(databaseModule.getPatientRecord(patientId)?.intakes.length, 2);
  console.log("PASS  non-null date updates appointment, replaces old reminder once, and retries create no duplicates");

  const unsupportedPlan = {
    ...validPlan,
    followup_interval_weeks: 8,
  };
  const unsupportedInput = confirmFollowupRequestSchema.parse({
    ...confirmInput,
    request_id: randomUUID(),
    plan: unsupportedPlan,
  });
  assert.equal(
    confirmRecordFollowup(unsupportedInput, patient.next_visit_date, saveDependencies),
    null,
    "intervals absent from the note are rejected",
  );
  assert.equal(databaseModule.latestIntakeForPatient(patientId)?.id, datedSaved.intakeId);
  console.log("PASS  unsupported follow-up intervals are rejected before save");

  const providerFailureBaseline = databaseModule.latestIntakeForPatient(patientId)?.id;
  await assert.rejects(
    extractRecordFollowup(extractionInput, patient, {
      providerConfigured: true,
      prepare,
      generatePlan: async () => { throw new Error("test provider failure"); },
      generateRecap: async () => ({ output: { recap: "unreached" }, model: "test" }),
    }),
    /test provider failure/,
  );
  assert.equal(databaseModule.latestIntakeForPatient(patientId)?.id, providerFailureBaseline);
  console.log("PASS  provider extraction failure rejects cleanly and writes nothing");
  console.log("LLM-dependent tests ran in mock mode; provider-failure case was injected.");
} finally {
  closeDatabase?.();
  if (previousDatabasePath === undefined) delete process.env.HACKATHON_DB_PATH;
  else process.env.HACKATHON_DB_PATH = previousDatabasePath;
  rmSync(testDirectory, { recursive: true, force: true });
}
