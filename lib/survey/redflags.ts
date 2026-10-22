import { z } from "zod";

export const surveySymptomsSchema = z.object({
  extreme_thirst: z.boolean().nullable(),
  rapid_weight_loss: z.boolean().nullable(),
  blurred_vision: z.boolean().nullable(),
  vomiting: z.boolean().nullable(),
  confusion: z.boolean().nullable(),
}).strict();

export type SurveySymptoms = z.infer<typeof surveySymptomsSchema>;
export type SurveyRedFlagSymptom = keyof SurveySymptoms;

export type SurveyRedFlagResult = {
  urgent: boolean;
  symptoms: SurveyRedFlagSymptom[];
};

export function surveyRedFlags(symptoms: SurveySymptoms): SurveyRedFlagResult {
  const parsed = surveySymptomsSchema.safeParse(symptoms);
  if (!parsed.success) {
    throw new TypeError("Survey symptoms must be answered yes, no, or unknown.");
  }
  const positive = (Object.keys(parsed.data) as SurveyRedFlagSymptom[]).filter(
    (key) => parsed.data[key] === true,
  );
  return { urgent: positive.length > 0, symptoms: positive };
}
