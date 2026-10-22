import { z } from "zod";
import { findriscAnswersSchema, type FindriscBand, type FindriscItem } from "./survey/findrisc.ts";
import { surveySymptomsSchema, type SurveyRedFlagSymptom } from "./survey/redflags.ts";

// ----- LLM-facing schema (nullable = not answered) -----

export const intakeFieldsSchema = z.object({
  missed_doses: z.boolean().nullable(),
  hypoglycemia_episodes: z.number().int().min(0).max(20).nullable(),
  hypoglycemia_symptoms: z.boolean().nullable(),
  foot_problem: z.boolean().nullable(),
  vision_change: z.boolean().nullable(),
  emergency_symptoms_mentioned: z.boolean().nullable(),
  symptoms_text: z.string().max(500).nullable(),
});

export const inputMethodSchema = z.enum(["tap", "typed", "voice", "mixed"]);
export type InputMethod = z.infer<typeof inputMethodSchema>;

export type IntakeFields = z.infer<typeof intakeFieldsSchema>;

// ----- Meta object saved in meta_json -----

export const intakeMetaSchema = z.object({
  llm_mode: z.enum(["real", "mock", "none"]),
  model: z.string().nullable(),
  needs_review: z.boolean(),
  contradiction: z.boolean(),
  survey: z.object({
    total: z.number().int().min(0).max(26),
    band: z.enum(["low", "slightly_elevated", "moderate", "high", "very_high"]),
    bmi: z.number().nonnegative().nullable(),
    items: z.array(z.object({
      item: z.enum([
        "age",
        "bmi",
        "waist",
        "activity",
        "fruit_veg",
        "antihypertensive",
        "high_glucose",
        "family_history",
      ]),
      answer: z.union([z.number(), z.boolean(), z.string()]).nullable(),
      points: z.number().int().min(0).max(5),
    }).strict()).length(8),
    unknownItems: z.array(z.enum([
      "age",
      "bmi",
      "waist",
      "activity",
      "fruit_veg",
      "antihypertensive",
      "high_glucose",
      "family_history",
    ])),
    answers: findriscAnswersSchema,
    symptoms: surveySymptomsSchema,
    redFlagSymptoms: z.array(z.enum([
      "extreme_thirst",
      "rapid_weight_loss",
      "blurred_vision",
      "vomiting",
      "confusion",
    ])),
  }).strict().optional(),
});

export type IntakeMeta = z.infer<typeof intakeMetaSchema>;
export type SurveyMetadata = {
  total: number;
  band: FindriscBand;
  bmi: number | null;
  items: { item: FindriscItem; answer: number | boolean | string | null; points: number }[];
  unknownItems: FindriscItem[];
  answers: z.infer<typeof findriscAnswersSchema>;
  symptoms: z.infer<typeof surveySymptomsSchema>;
  redFlagSymptoms: SurveyRedFlagSymptom[];
};

// ----- POST body validation -----

export const intakeRequestSchema = z.object({
  patient_id: z.number().int().positive(),
  tap_missed_doses: z.boolean().nullable(),
  tap_hypo_episodes: z.number().int().min(0).max(3).nullable(),
  tap_foot_problem: z.boolean().nullable(),
  tap_vision_change: z.boolean().nullable(),
  free_text: z.string().max(500).nullable().optional(),
  input_method: inputMethodSchema,
});

export type IntakeRequest = z.infer<typeof intakeRequestSchema>;
