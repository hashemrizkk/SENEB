import { z } from "zod";

export type FollowupPlan = {
  followup_interval_weeks: number | null;
  next_visit_date: string | null;
  care_gap_reminders: string[];
  patient_instructions: string | null;
  rationale_summary: string | null;
};

function normalizeDigits(value: string): string {
  return value.replace(/[٠-٩]/g, (digit) =>
    String.fromCharCode(digit.charCodeAt(0) - 0x0660 + 48),
  );
}

function intervalIsExplicit(note: string, interval: number): boolean {
  const normalized = normalizeDigits(note).toLowerCase();
  const pattern = new RegExp(
    `(?:\\b(?:in|after|within|every)\\s+${interval}\\s+weeks?\\b|(?:بعد|خلال|كل)\\s*${interval}\\s*(?:أسبوع|اسبوع|أسابيع|اسابيع))`,
  );
  return pattern.test(normalized);
}

export function createFollowupPlanSchema(note: string, existingDate: string | null = null) {
  return z.object({
    followup_interval_weeks: z.number().int().min(1).max(104).nullable(),
    next_visit_date: z.string().date().nullable(),
    care_gap_reminders: z.array(z.string().trim().min(1).max(160)).max(10),
    patient_instructions: z.string().trim().max(400).nullable(),
    rationale_summary: z.string().trim().max(240).nullable(),
  }).strict().superRefine((plan, context) => {
    if (
      plan.followup_interval_weeks !== null &&
      !intervalIsExplicit(note, plan.followup_interval_weeks)
    ) {
      context.addIssue({
        code: "custom",
        path: ["followup_interval_weeks"],
        message: "The doctor's note does not explicitly state this interval.",
      });
    }

    if (
      plan.next_visit_date !== null &&
      plan.next_visit_date !== existingDate &&
      !note.includes(plan.next_visit_date)
    ) {
      context.addIssue({
        code: "custom",
        path: ["next_visit_date"],
        message: "The date is not present in the doctor's note or existing patient data.",
      });
    }
  });
}

export async function commitFollowupPlan<T>(
  confirmed: boolean,
  plan: T,
  save: (plan: T) => Promise<unknown> | unknown,
): Promise<boolean> {
  if (!confirmed) return false;
  await save(plan);
  return true;
}

export function mockFollowupPlan(): FollowupPlan {
  return {
    followup_interval_weeks: null,
    next_visit_date: null,
    care_gap_reminders: [],
    patient_instructions: null,
    rationale_summary: null,
  };
}
