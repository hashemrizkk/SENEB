import assert from "node:assert/strict";
import {
  commitFollowupPlan,
  createFollowupPlanSchema,
} from "../lib/followup-plan.ts";

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
