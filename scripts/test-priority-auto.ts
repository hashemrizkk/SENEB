import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import Database from "better-sqlite3";
import {
  autoPriorityMetadata,
  priorityForIntake,
  priorityIfUnset,
} from "../lib/intake-priority.ts";
import { migrateDoctorReview, savePatientIntake } from "../lib/doctor-review.ts";
import type { IntakeFields } from "../lib/intake.ts";

const fields: IntakeFields = {
  missed_doses: true,
  hypoglycemia_episodes: null,
  hypoglycemia_symptoms: null,
  foot_problem: false,
  vision_change: false,
  emergency_symptoms_mentioned: null,
  symptoms_text: null,
};

const result = priorityForIntake(fields, null, false);
assert.equal(result.priority, "important");
assert.ok(result.reasons.length > 0);
assert.equal(priorityIfUnset(null, result.priority), "important");
assert.equal(priorityIfUnset("normal", result.priority), "normal");
const db = new Database(":memory:");
db.exec(readFileSync("lib/schema.sql", "utf8"));
migrateDoctorReview(db);
const patientId = Number(db.prepare(
  "INSERT INTO patients (name, phone) VALUES (?, ?)",
).run("Demo Patient", "01000000000").lastInsertRowid);
const metadata = autoPriorityMetadata(fields, null, false);
const intakeId = savePatientIntake(db, {
  patient_id: patientId,
  input_method: "tap",
  raw_text: null,
  structured_json: JSON.stringify(fields),
  red_flags_json: JSON.stringify({ flags: [], unanswered: [] }),
  meta_json: JSON.stringify({ llm_mode: "none", model: null, needs_review: false, contradiction: false }),
  priority: priorityIfUnset(null, metadata.priority),
}, undefined, { source: "patient", editedBy: null, reason: metadata.revision_reason });
assert.equal(
  db.prepare<[number], { priority: string }>("SELECT priority FROM intakes WHERE id = ?").get(intakeId)?.priority,
  "important",
);
assert.match(
  db.prepare<[number], { reason: string }>("SELECT reason FROM intake_revisions WHERE intake_id = ?").get(intakeId)?.reason ?? "",
  /auto \(rules\)/,
);
db.close();
console.log("PASS  deterministic priority is stored with rule-source reason and manual value stays intact");
