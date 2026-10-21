import { z } from "zod";
import type { IntakeFields } from "./intake.ts";
import { flagRules } from "./questions.ts";

export type RedFlagResult = {
  flags: string[];
  unanswered: string[];
};

export const redFlagResultSchema = z.object({
  flags: z.array(z.string()),
  unanswered: z.array(z.string()),
});

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
    flags.push(flagRules.hypoglycemia);
  }

  if (
    intake.hypoglycemia_symptoms === true &&
    (intake.hypoglycemia_episodes === null ||
      intake.hypoglycemia_episodes === 0)
  ) {
    flags.push(flagRules.hypoglycemiaSymptoms);
  }

  // --- Foot ---
  if (intake.foot_problem === true) {
    flags.push(flagRules.footProblem);
  }

  // --- Vision ---
  if (intake.vision_change === true) {
    flags.push(flagRules.visionChange);
  }

  // --- Missed doses ---
  if (intake.missed_doses === true) {
    flags.push(flagRules.missedDoses);
  }

  // --- Emergency ---
  if (intake.emergency_symptoms_mentioned === true) {
    flags.push(flagRules.possibleEmergency);
  }

  // --- Unanswered ---
  if (intake.missed_doses === null) unanswered.push("missed_doses");
  if (intake.hypoglycemia_episodes === null)
    unanswered.push("hypoglycemia_episodes");
  if (intake.foot_problem === null) unanswered.push("foot_problem");
  if (intake.vision_change === null) unanswered.push("vision_change");

  return { flags, unanswered };
}
