import { z } from "zod";
import type { IntakeFields } from "./intake.ts";
import {
  BP_OVERDUE_DAYS,
  FOOT_EXAM_OVERDUE_DAYS,
  HBA1C_OVERDUE_DAYS,
} from "./priority-config.ts";

type PatientFactsInput = {
  age: number | null;
  diabetes_type: string | null;
  last_hba1c_date: string | null;
  last_foot_exam_date: string | null;
  last_bp_date: string | null;
  next_visit_date: string | null;
};

const careGapSchema = z.object({
  date: z.string().nullable(),
  days_since: z.number().int().nullable(),
  overdue: z.boolean(),
  threshold_days: z.number().int(),
});

export const caseFactsSchema = z.object({
  age: z.number().int().nullable(),
  diabetes_type: z.string().nullable(),
  answers: z.object({
    missed_doses: z.string(),
    hypoglycemia_episodes: z.string(),
    hypoglycemia_symptoms: z.string(),
    foot_problem: z.string(),
    vision_change: z.string(),
  }),
  care_gaps: z.object({
    hba1c: careGapSchema,
    foot_exam: careGapSchema,
    blood_pressure: careGapSchema,
    next_visit: z.object({
      date: z.string().nullable(),
      days_overdue: z.number().int().nullable(),
    }),
  }),
});

export type CaseFacts = z.infer<typeof caseFactsSchema>;
export type CareGap = z.infer<typeof careGapSchema>;

function parseDate(date: string | null): Date | null {
  if (!date) return null;
  const dateOnly = date.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) return null;
  const parsed = new Date(`${dateOnly}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== dateOnly
    ? null
    : parsed;
}

function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / 86_400_000);
}

function careGap(date: string | null, threshold: number, today: Date): CareGap {
  const parsedDate = parseDate(date);
  if (!parsedDate) {
    return {
      date: null,
      days_since: null,
      overdue: false,
      threshold_days: threshold,
    };
  }
  const daysSince = daysBetween(parsedDate, today);
  return {
    date: date?.slice(0, 10) ?? null,
    days_since: daysSince,
    overdue: daysSince >= threshold,
    threshold_days: threshold,
  };
}

function answer(value: boolean | number | null, format: (value: boolean | number) => string): string {
  return value === null ? "Not answered" : format(value);
}

export function buildFacts(
  patient: PatientFactsInput,
  structured: Pick<
    IntakeFields,
    | "missed_doses"
    | "hypoglycemia_episodes"
    | "hypoglycemia_symptoms"
    | "foot_problem"
    | "vision_change"
  >,
  today: Date,
): CaseFacts {
  const nextVisit = parseDate(patient.next_visit_date);
  const nextVisitDays = nextVisit ? daysBetween(nextVisit, today) : null;
  return {
    age: patient.age,
    diabetes_type: patient.diabetes_type,
    answers: {
      missed_doses: answer(structured.missed_doses, (value) =>
        value ? "Yes" : "No",
      ),
      hypoglycemia_episodes: answer(
        structured.hypoglycemia_episodes,
        (value) => `${value} episode(s)`,
      ),
      hypoglycemia_symptoms: answer(structured.hypoglycemia_symptoms, (value) =>
        value ? "Yes" : "No",
      ),
      foot_problem: answer(structured.foot_problem, (value) =>
        value ? "Yes" : "No",
      ),
      vision_change: answer(structured.vision_change, (value) =>
        value ? "Yes" : "No",
      ),
    },
    care_gaps: {
      hba1c: careGap(patient.last_hba1c_date, HBA1C_OVERDUE_DAYS, today),
      foot_exam: careGap(
        patient.last_foot_exam_date,
        FOOT_EXAM_OVERDUE_DAYS,
        today,
      ),
      blood_pressure: careGap(patient.last_bp_date, BP_OVERDUE_DAYS, today),
      next_visit: {
        date: patient.next_visit_date?.slice(0, 10) ?? null,
        days_overdue:
          nextVisitDays !== null && nextVisitDays > 0 ? nextVisitDays : null,
      },
    },
  };
}
