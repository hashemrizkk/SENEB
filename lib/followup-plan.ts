import { z } from "zod";

export type FollowupPlan = {
  followup_interval_weeks: number | null;
  next_visit_date: string | null;
  care_gap_reminders: string[];
  patient_instructions: string | null;
  rationale_summary: string | null;
  monitoring_checklist: MonitoringChecklistItem[];
  medication_changes: MedicationChange[];
  return_precautions: string | null;
  self_monitoring: string | null;
};

export type MonitoringChecklistItem = {
  item: string;
  due_in_days: number | null;
  source: "guideline" | "doctor";
};

export type MedicationChange = {
  drug: string | null;
  change: string;
};

export type FollowupPatientDates = {
  last_hba1c_date: string | null;
  last_kidney_labs_date: string | null;
  last_foot_exam_date: string | null;
  last_eye_exam_date: string | null;
  last_bp_date: string | null;
};

const followupPlanOutputSchema = z.object({
  followup_interval_weeks: z.number().int().min(1).max(104).nullable(),
  next_visit_date: z.string().date().nullable(),
  care_gap_reminders: z.array(z.string().trim().min(1).max(160)).max(10),
  patient_instructions: z.string().trim().max(400).nullable(),
  rationale_summary: z.string().trim().max(240).nullable(),
  monitoring_checklist: z.array(z.object({
    item: z.string().trim().min(1).max(160),
    due_in_days: z.number().int().min(-3_650).max(3_650).nullable(),
    source: z.enum(["guideline", "doctor"]),
  }).strict()).max(20).default([]),
  medication_changes: z.array(z.object({
    drug: z.string().trim().min(1).max(100).nullable(),
    change: z.string().trim().min(1).max(200),
  }).strict()).max(10).default([]),
  return_precautions: z.string().trim().max(220).nullable().default(null),
  self_monitoring: z.string().trim().max(300).nullable().default(null),
}).strict();

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

function parseDate(value: string | null | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value
    ? null
    : date;
}

function mentionsMedicationChange(note: string): boolean {
  return note.split(/[.!?؛\n]+/u).some((sentence) =>
    !/\b(?:no|not|without)\s+(?:medication\s+)?changes?\b|(?:مفيش|لا يوجد|لم يحدث)\s+تغيير/iu.test(sentence) &&
    /\b(start(?:ed)?|stop(?:ped)?|increase(?:d)?|decrease(?:d)?|change(?:d)?|adjust(?:ed)?|switch(?:ed)?)\b|(?:بدأ|ابدا|أوقف|وقف|زود|قلل|غيّر|غير|عدّل|عدل)/iu.test(sentence),
  );
}

export function extractMedicationChanges(note: string): MedicationChange[] {
  return note
    .split(/[.!?؛\n]+/u)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0 && mentionsMedicationChange(sentence))
    .map((change) => ({ drug: null, change }));
}

function dueInDays(
  lastDate: string | null | undefined,
  thresholdDays: number,
  today: Date,
): number | null {
  const date = parseDate(lastDate);
  if (!date) return null;
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const daysSince = Math.floor((todayUtc - date.getTime()) / 86_400_000);
  return thresholdDays - daysSince;
}

export function seededMonitoringChecklist(
  patient: Partial<FollowupPatientDates>,
  note: string,
  today = new Date(),
): MonitoringChecklistItem[] {
  const hba1cDueDays = mentionsMedicationChange(note) ? 90 : 180;
  return [
    {
      item: "HbA1c",
      due_in_days: dueInDays(patient.last_hba1c_date, hba1cDueDays, today),
      source: "guideline",
    },
    {
      item: "Kidney labs",
      due_in_days: dueInDays(patient.last_kidney_labs_date, 365, today),
      source: "guideline",
    },
    {
      item: "Foot exam",
      due_in_days: dueInDays(patient.last_foot_exam_date, 365, today),
      source: "guideline",
    },
    {
      item: "Eye exam",
      due_in_days: dueInDays(patient.last_eye_exam_date, 365, today),
      source: "guideline",
    },
    {
      item: "Blood pressure check",
      due_in_days: dueInDays(patient.last_bp_date, 180, today),
      source: "guideline",
    },
  ];
}

export function createFollowupPlanSchema(note: string, existingDate: string | null = null) {
  return followupPlanOutputSchema.superRefine((plan, context) => {
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

    const noteLower = note.toLocaleLowerCase();
    for (const [index, item] of plan.monitoring_checklist.entries()) {
      if (item.source === "doctor" && !noteLower.includes(item.item.toLocaleLowerCase())) {
        context.addIssue({
          code: "custom",
          path: ["monitoring_checklist", index, "item"],
          message: "Doctor-specific checklist items must be present in the note.",
        });
      }
    }
    for (const [index, change] of plan.medication_changes.entries()) {
      if (
        !noteLower.includes(change.change.toLocaleLowerCase()) ||
        (change.drug !== null && !noteLower.includes(change.drug.toLocaleLowerCase()))
      ) {
        context.addIssue({
          code: "custom",
          path: ["medication_changes", index],
          message: "Medication changes must be copied from the doctor's note.",
        });
      }
    }
    for (const key of ["return_precautions", "self_monitoring"] as const) {
      const value = plan[key];
      if (value !== null && !noteLower.includes(value.toLocaleLowerCase())) {
        context.addIssue({
          code: "custom",
          path: [key],
          message: "Free-text details must be copied from the doctor's note.",
        });
      }
    }
  });
}

export function enrichFollowupPlan(
  candidate: unknown,
  note: string,
  existingDate: string | null,
  patient: Partial<FollowupPatientDates>,
  today = new Date(),
): FollowupPlan {
  const parsed = createFollowupPlanSchema(note, existingDate).parse(candidate);
  const doctorItems = parsed.monitoring_checklist.filter((item) => item.source === "doctor");
  const guidelineItems = seededMonitoringChecklist(patient, note, today);
  const seenItems = new Set(guidelineItems.map((item) => item.item.toLocaleLowerCase()));
  const uniqueDoctorItems = doctorItems.filter((item) => {
    const key = item.item.toLocaleLowerCase();
    if (seenItems.has(key)) return false;
    seenItems.add(key);
    return true;
  });
  const medicationChanges = [...parsed.medication_changes];
  const seenChanges = new Set(
    medicationChanges.map((change) => change.change.toLocaleLowerCase()),
  );
  for (const change of extractMedicationChanges(note)) {
    const key = change.change.toLocaleLowerCase();
    if (!seenChanges.has(key)) {
      medicationChanges.push(change);
      seenChanges.add(key);
    }
  }
  return {
    ...parsed,
    monitoring_checklist: [...guidelineItems, ...uniqueDoctorItems],
    medication_changes: medicationChanges,
  };
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

export function mockFollowupPlan(
  note = "",
  existingDate: string | null = null,
  patient: Partial<FollowupPatientDates> = {},
  today = new Date(),
): FollowupPlan {
  return enrichFollowupPlan({
    followup_interval_weeks: null,
    next_visit_date: null,
    care_gap_reminders: [],
    patient_instructions: null,
    rationale_summary: null,
    monitoring_checklist: [],
    medication_changes: extractMedicationChanges(note),
    return_precautions: null,
    self_monitoring: null,
  }, note, existingDate, patient, today);
}
