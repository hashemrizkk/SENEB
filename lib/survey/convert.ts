import { z } from "zod";
import {
  ausdriskAnswersSchema,
  scoreAusdrisk,
  type AusdriskItem,
  type AusdriskResult,
} from "./ausdrisk.ts";

export const surveySubmissionSchema = z.object({
  answers: ausdriskAnswersSchema,
}).strict();

export type SurveySubmission = z.infer<typeof surveySubmissionSchema>;

export type SurveyMetadata = AusdriskResult & {
  tool: "ausdrisk_ar_v1";
  answers: SurveySubmission["answers"];
};

export function prepareSurveyConversion(value: unknown): {
  metadata: SurveyMetadata;
} {
  const survey = surveySubmissionSchema.parse(value);
  const score = scoreAusdrisk(survey.answers);
  return {
    metadata: {
      tool: "ausdrisk_ar_v1",
      ...score,
      answers: survey.answers,
    },
  };
}

export type { AusdriskItem };
