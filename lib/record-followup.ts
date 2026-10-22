import { z } from "zod";
import { generateEncounterDraft } from "./encounter-draft.ts";
import {
  createFollowupPlanSchema,
  type FollowupPatientDates,
  type FollowupPlan,
} from "./followup-plan.ts";
import {
  intakeFieldsSchema,
  type IntakeFields,
} from "./intake.ts";
import {
  mergeFields,
  prepareIntake,
  type TapAnswers,
} from "./submitIntake.ts";

const tapAnswersSchema = z.object({
  missed_doses: z.boolean().nullable(),
  hypoglycemia_episodes: z.number().int().min(0).max(3).nullable(),
  foot_problem: z.boolean().nullable(),
  vision_change: z.boolean().nullable(),
}).strict();

const baseInputSchema = z.object({
  patient_id: z.number().int().positive(),
  tap_answers: tapAnswersSchema,
  note: z.string().max(4_000),
}).strict();

export const extractFollowupRequestSchema = baseInputSchema.extend({
  action: z.literal("extract"),
}).strict();

export const confirmFollowupRequestSchema = baseInputSchema.extend({
  action: z.literal("confirm"),
  request_id: z.string().uuid(),
  fields: intakeFieldsSchema,
  plan: z.unknown(),
  recap: z.string().trim().min(1).max(440),
}).strict();

export type RecordFollowupInput = z.infer<typeof baseInputSchema>;
export type ConfirmFollowupInput = z.infer<typeof confirmFollowupRequestSchema>;
export type ConfirmFollowupResult = {
  intakeId: number;
  duplicate: boolean;
  noteMatches: boolean;
  recapQueued: boolean;
  reminderQueued: boolean;
};

export async function extractRecordFollowup(
  input: RecordFollowupInput,
  patient: FollowupPatientDates & { next_visit_date: string | null },
  dependencies: {
    providerConfigured: boolean;
    prepare?: typeof prepareIntake;
    generatePlan: (
      payload: unknown,
      note: string,
      existingDate: string | null,
    ) => Promise<{ output: unknown; model: string }>;
    generateRecap: (note: string) => Promise<{ output: unknown; model: string }>;
    today?: Date;
  },
): Promise<{
  fields: IntakeFields;
  plan: FollowupPlan;
  recap: string;
  preview: string;
  mode: "mock" | "llm";
}> {
  const note = input.note.trim();
  const prepared = await (dependencies.prepare ?? prepareIntake)(
    note || null,
    input.tap_answers as TapAnswers,
  );
  const draft = await generateEncounterDraft(
    {
      note,
      existingDate: patient.next_visit_date,
      patientDates: patient,
      savedDraft: null,
      providerConfigured: dependencies.providerConfigured,
      payload: { doctor_note: note },
    },
    {
      generatePlan: dependencies.generatePlan,
      generateRecap: dependencies.generateRecap,
      today: dependencies.today,
    },
  );
  return { fields: prepared.fields, ...draft };
}

export function validateConfirmFollowup(
  input: ConfirmFollowupInput,
  existingDate: string | null,
): { fields: IntakeFields; plan: FollowupPlan; recap: string } | null {
  const fields = intakeFieldsSchema.safeParse(input.fields);
  const plan = createFollowupPlanSchema(input.note, existingDate).safeParse(input.plan);
  if (!fields.success || !plan.success) return null;
  return {
    fields: mergeFields(fields.data, input.tap_answers as TapAnswers),
    plan: plan.data,
    recap: input.recap.trim(),
  };
}

export function confirmRecordFollowup(
  input: ConfirmFollowupInput,
  existingDate: string | null,
  dependencies: {
    save: (
      input: ConfirmFollowupInput & { fields: IntakeFields; plan: FollowupPlan; recap: string },
    ) => ConfirmFollowupResult;
    afterSaved: (intakeId: number, note: string) => void;
  },
): ConfirmFollowupResult | null {
  const validated = validateConfirmFollowup(input, existingDate);
  if (!validated) return null;
  const result = dependencies.save({ ...input, ...validated });
  if (!result.duplicate && result.noteMatches && input.note.trim()) {
    dependencies.afterSaved(result.intakeId, input.note.trim());
  }
  return result;
}
