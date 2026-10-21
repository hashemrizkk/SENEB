import { z } from "zod";

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

export type IntakeFields = z.infer<typeof intakeFieldsSchema>;

// ----- Meta object saved in meta_json -----

export const intakeMetaSchema = z.object({
  llm_mode: z.enum(["real", "mock", "none"]),
  model: z.string().nullable(),
  needs_review: z.boolean(),
  contradiction: z.boolean(),
});

export type IntakeMeta = z.infer<typeof intakeMetaSchema>;

// ----- POST body validation -----

export const intakeRequestSchema = z.object({
  patient_id: z.number().int().positive(),
  tap_missed_doses: z.boolean().nullable(),
  tap_hypo_episodes: z.number().int().min(0).max(3).nullable(),
  tap_foot_problem: z.boolean().nullable(),
  tap_vision_change: z.boolean().nullable(),
  free_text: z.string().max(500).nullable().optional(),
  input_method: z.enum(["tap", "typed"]),
});

export type IntakeRequest = z.infer<typeof intakeRequestSchema>;

