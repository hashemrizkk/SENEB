import type { IntakeFields } from "@/lib/intake";

export type RedFlagResult = {
  flags: string[];
  unanswered: string[];
};

/**
 * Plain-code red-flag rules. No LLM, no scoring.
 * Returns flags (strings the doctor sees) and unanswered field names.
 */
export function redFlags(intake: IntakeFields): RedFlagResult {
  const flags: string[] = [];
  const unanswered: string[] = [];

  // --- Hypoglycemia ---
  if (
    intake.hypoglycemia_episodes !== null &&
    intake.hypoglycemia_episodes > 0
  ) {
    flags.push("hypoglycemia");
  }

  if (
    intake.hypoglycemia_symptoms === true &&
    (intake.hypoglycemia_episodes === null ||
      intake.hypoglycemia_episodes === 0)
  ) {
    flags.push("hypoglycemia (symptoms described)");
  }

  // --- Foot ---
  if (intake.foot_problem === true) {
    flags.push("foot problem");
  }

  // --- Vision ---
  if (intake.vision_change === true) {
    flags.push("vision change");
  }

  // --- Missed doses ---
  if (intake.missed_doses === true) {
    flags.push("missed doses");
  }

  // --- Emergency ---
  if (intake.emergency_symptoms_mentioned === true) {
    flags.push("possible emergency, review first");
  }

  // --- Unanswered ---
  if (intake.missed_doses === null) unanswered.push("missed_doses");
  if (intake.hypoglycemia_episodes === null)
    unanswered.push("hypoglycemia_episodes");
  if (intake.foot_problem === null) unanswered.push("foot_problem");
  if (intake.vision_change === null) unanswered.push("vision_change");

  return { flags, unanswered };
}
