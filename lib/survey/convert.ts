import { z } from "zod";
import {
  findriscAnswersSchema,
  scoreFindrisc,
  type FindriscBand,
  type FindriscItem,
} from "./findrisc.ts";
import {
  surveyRedFlags,
  surveySymptomsSchema,
  type SurveyRedFlagSymptom,
} from "./redflags.ts";

export type SurveyPriority = "urgent" | "important" | null;

export const surveySubmissionSchema = z.object({
  answers: findriscAnswersSchema,
  symptoms: surveySymptomsSchema,
}).strict();

export type SurveySubmission = z.infer<typeof surveySubmissionSchema>;

export type SurveyMetadata = {
  total: number;
  band: FindriscBand;
  bmi: number | null;
  items: { item: FindriscItem; answer: number | boolean | string | null; points: number }[];
  unknownItems: FindriscItem[];
  answers: SurveySubmission["answers"];
  symptoms: SurveySubmission["symptoms"];
  redFlagSymptoms: SurveyRedFlagSymptom[];
};

export type SurveyConversion = {
  priorityOverride: SurveyPriority;
  metadata: SurveyMetadata;
  redFlagCodes: string[];
  intakeAnswers: {
    vision_change: boolean | null;
    emergency_symptoms_mentioned: boolean | null;
  };
};

export function surveyPriority(
  band: FindriscBand,
  hasPositiveSymptom: boolean,
): SurveyPriority {
  if (hasPositiveSymptom) return "urgent";
  if (band === "high" || band === "very_high") return "important";
  return null;
}

export function prepareSurveyConversion(value: unknown): SurveyConversion {
  const survey = surveySubmissionSchema.parse(value);
  const score = scoreFindrisc(survey.answers);
  const redFlags = surveyRedFlags(survey.symptoms);
  const severeSymptomAnswers = [
    survey.symptoms.vomiting,
    survey.symptoms.confusion,
  ];
  const emergencySymptoms =
    severeSymptomAnswers.some((answer) => answer === true)
      ? true
      : severeSymptomAnswers.every((answer) => answer === false)
        ? false
        : null;

  return {
    priorityOverride: surveyPriority(score.band, redFlags.urgent),
    redFlagCodes: redFlags.symptoms.map((symptom) => `survey_${symptom}`),
    intakeAnswers: {
      vision_change: survey.symptoms.blurred_vision,
      emergency_symptoms_mentioned: emergencySymptoms,
    },
    metadata: {
      ...score,
      answers: survey.answers,
      symptoms: survey.symptoms,
      redFlagSymptoms: redFlags.symptoms,
    },
  };
}
