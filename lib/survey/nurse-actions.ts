import { z } from "zod";
import { ar } from "../strings.ar.ts";

export const nurseSurveyDecisionSchema = z.enum([
  "urgent_er",
  "prompt_assessment",
  "no_er_referral",
]);

export type NurseSurveyDecision = z.infer<typeof nurseSurveyDecisionSchema>;

export const nurseSurveyDecisionLabels: Record<NurseSurveyDecision, string> = {
  urgent_er: "Urgent ER referral",
  prompt_assessment: "Recommend prompt clinical assessment",
  no_er_referral: "No ER referral from this review",
};

export function patientSurveyDecisionMessage(
  decision: NurseSurveyDecision,
): string {
  return ar.survey.patientActionMessages[decision];
}
