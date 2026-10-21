import { z } from "zod";

export const summaryLlmInputSchema = z.object({
  age: z.number().int().nullable(),
  diabetes_type: z.string().nullable(),
  intake: z.object({
    missed_doses: z.boolean().nullable(),
    hypoglycemia_episodes: z.number().int().min(0).max(20).nullable(),
    hypoglycemia_symptoms: z.boolean().nullable(),
    foot_problem: z.boolean().nullable(),
    vision_change: z.boolean().nullable(),
  }),
  patient_text: z.string().nullable(),
  care_gaps: z.array(
    z.object({
      item: z.string(),
      days_overdue_or_null: z.number().int().nullable(),
    }),
  ),
});

export type SummaryLlmInput = z.infer<typeof summaryLlmInputSchema>;

function sentenceCount(summary: string): number {
  return (summary.match(/[.!?](?:\s|$)/g) ?? []).length;
}

export const summaryLlmOutputSchema = z.object({
  summary: z
    .string()
    .min(1)
    .max(500)
    .refine((summary) => sentenceCount(summary) >= 2 && sentenceCount(summary) <= 4),
  highlights: z.array(
    z.object({
      quote: z.string().min(2),
      category: z.enum([
        "symptom",
        "medication",
        "foot",
        "vision",
        "hypoglycemia",
        "hyperglycemia",
        "other",
      ]),
    }),
  ),
  values: z.array(
    z.object({
      quote: z.string().min(2),
      meaning: z.string().min(1).max(120),
    }),
  ),
  inconsistencies: z.array(
    z.object({
      description: z.string().min(1).max(240),
      quotes: z.array(z.string().min(2)).min(1),
    }),
  ),
});

export type SummaryLlmOutput = z.infer<typeof summaryLlmOutputSchema>;
