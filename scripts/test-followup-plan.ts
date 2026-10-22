import assert from "node:assert/strict";
import {
  commitFollowupPlan,
  createFollowupPlanSchema,
  enrichFollowupPlan,
  seededMonitoringChecklist,
} from "../lib/followup-plan.ts";
import { generateEncounterDraft } from "../lib/encounter-draft.ts";
import { structuredPrompt } from "../lib/llm-prompt.ts";

const unstated = createFollowupPlanSchema("Continue current care.");
assert.equal(unstated.safeParse({
  followup_interval_weeks: null,
  next_visit_date: null,
  care_gap_reminders: [],
  patient_instructions: null,
  rationale_summary: null,
}).success, true);
assert.equal(unstated.safeParse({
  followup_interval_weeks: 4,
  next_visit_date: null,
  care_gap_reminders: [],
  patient_instructions: null,
  rationale_summary: null,
}).success, false);
assert.equal(createFollowupPlanSchema("Review again in 3 weeks.").safeParse({
  followup_interval_weeks: 3,
  next_visit_date: null,
  care_gap_reminders: [],
  patient_instructions: null,
  rationale_summary: null,
}).success, true);

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
assert.equal(seededMonitoringChecklist(
  { ...patientDates, last_hba1c_date: "2025-11-01" },
  "Increase metformin dose.",
  fixedToday,
)[0]?.due_in_days, 29);
assert.equal(seededMonitoringChecklist(
  { ...patientDates, last_hba1c_date: "2025-11-01" },
  "No medication changes.",
  fixedToday,
)[0]?.due_in_days, 119);
assert.equal(
  enrichFollowupPlan(planCandidate, "Continue care.", null, patientDates, fixedToday)
    .monitoring_checklist.length,
  5,
);

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
  createFollowupPlanSchema("No medication instructions in this note.")
    .parse(planCandidate).medication_changes,
  [],
);
assert.equal(
  createFollowupPlanSchema("No return precaution stated.").parse(planCandidate)
    .return_precautions,
  null,
);
assert.equal(
  createFollowupPlanSchema("No home monitoring stated.").parse(planCandidate)
    .self_monitoring,
  null,
);
console.log("PASS  seeded overdue monitoring, medication evidence, and nullable extracted fields");

let providerCalls = 0;
const mockDraft = await generateEncounterDraft({
  note: "Increase metformin dose to 1000 mg.",
  existingDate: "2026-02-01",
  patientDates,
  savedDraft: null,
  providerConfigured: false,
  payload: {},
}, {
  generatePlan: async () => {
    providerCalls += 1;
    throw new Error("Mock mode must not call providers.");
  },
  generateRecap: async () => {
    providerCalls += 1;
    throw new Error("Mock mode must not call providers.");
  },
  today: fixedToday,
});
assert.equal(mockDraft.mode, "mock");
assert.equal(mockDraft.plan.monitoring_checklist.length, 5);
assert.equal(mockDraft.plan.medication_changes[0]?.change, "Increase metformin dose to 1000 mg");
assert.match(mockDraft.preview, /موعد المتابعة القادم: 2026-02-01/);
assert.equal(providerCalls, 0);
await assert.rejects(generateEncounterDraft({
  note: "Continue care.",
  existingDate: null,
  patientDates,
  savedDraft: null,
  providerConfigured: true,
  payload: {},
}, {
  generatePlan: async () => { throw new Error("provider unavailable"); },
  generateRecap: async () => ({ output: { recap: "reviewed" }, model: "test" }),
}), /provider unavailable/);
console.log("PASS  deterministic mock generation and provider-error propagation");
