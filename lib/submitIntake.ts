import { insertIntakeWithRevision } from "./db";
import { extractIntake } from "./llm";
import {
  type InputMethod,
  intakeFieldsSchema,
  type IntakeFields,
  type IntakeMeta,
} from "./intake";
import { redFlags, type RedFlagResult } from "./rules";
import { autoPriorityMetadata } from "./intake-priority.ts";

export type { InputMethod } from "./intake";
export type TapAnswers = Partial<
  Pick<
    IntakeFields,
    | "missed_doses"
    | "hypoglycemia_episodes"
    | "foot_problem"
    | "vision_change"
    | "emergency_symptoms_mentioned"
  >
>;

const EMPTY_FIELDS: IntakeFields = {
  missed_doses: null,
  hypoglycemia_episodes: null,
  hypoglycemia_symptoms: null,
  foot_problem: null,
  vision_change: null,
  emergency_symptoms_mentioned: null,
  symptoms_text: null,
};

/** Explicit tap values override extraction; null means the patient skipped it. */
export function mergeFields(
  extracted: IntakeFields | null,
  answers: TapAnswers,
): IntakeFields {
  const merged = { ...(extracted ?? EMPTY_FIELDS) };

  if (answers.missed_doses != null) {
    merged.missed_doses = answers.missed_doses;
  }
  if (answers.hypoglycemia_episodes != null) {
    merged.hypoglycemia_episodes = answers.hypoglycemia_episodes;
  }
  if (answers.foot_problem != null) merged.foot_problem = answers.foot_problem;
  if (answers.vision_change != null) {
    merged.vision_change = answers.vision_change;
  }
  if (answers.emergency_symptoms_mentioned != null) {
    merged.emergency_symptoms_mentioned = answers.emergency_symptoms_mentioned;
  }

  const parsed = intakeFieldsSchema.safeParse(merged);
  if (!parsed.success) {
    throw new Error("Could not validate the merged intake fields.");
  }
  return parsed.data;
}

/** Runs extraction and rules before any synchronous SQLite transaction. */
export async function prepareIntake(
  freeText: string | null,
  answers: TapAnswers,
): Promise<{
  fields: IntakeFields;
  flags: RedFlagResult;
  meta: IntakeMeta;
}> {
  let extracted = EMPTY_FIELDS;
  let meta: IntakeMeta = {
    llm_mode: "none",
    model: null,
    needs_review: Boolean(freeText?.trim()),
    contradiction: false,
  };

  if (freeText?.trim()) {
    try {
      const result = await extractIntake(freeText);
      extracted = result.fields;
      meta = result.meta;
    } catch (error: unknown) {
      const errorType =
        error instanceof Error ? error.constructor.name : "UnknownError";
      console.error(`Intake extraction failed (${errorType}).`);
    }
  }

  const fields = mergeFields(extracted, answers);
  const contradiction =
    meta.contradiction ||
    (answers.hypoglycemia_episodes === 0 &&
      extracted.hypoglycemia_symptoms === true);
  meta = { ...meta, contradiction };

  return { fields, flags: redFlags(fields), meta };
}

/** Synchronous half: safe to call inside db.transaction(). */
export function saveIntake(data: {
  patient_id: number;
  input_method: InputMethod;
  raw_text: string | null;
  fields: IntakeFields;
  flags: RedFlagResult;
  meta: IntakeMeta;
  priorityOverride?: "urgent" | "important" | null;
}): number {
  const automatic = autoPriorityMetadata(
    data.fields,
    data.raw_text,
    data.meta.needs_review,
  );
  const priority = data.priorityOverride ?? automatic.priority;
  return insertIntakeWithRevision({
    patient_id: data.patient_id,
    input_method: data.input_method,
    raw_text: data.raw_text,
    structured_json: JSON.stringify(data.fields),
    red_flags_json: JSON.stringify(data.flags),
    meta_json: JSON.stringify(data.meta),
    priority,
    revision_reason:
      data.priorityOverride != null
        ? "Priority source: survey rules."
        : automatic.revision_reason,
  });
}

export async function submitIntake(data: {
  patient_id: number;
  input_method: InputMethod;
  freeText: string | null;
  answers: TapAnswers;
}): Promise<{ intakeId: number; fields: IntakeFields; flags: RedFlagResult }> {
  const prepared = await prepareIntake(data.freeText, data.answers);
  const intakeId = saveIntake({
    patient_id: data.patient_id,
    input_method: data.input_method,
    raw_text: data.freeText,
    fields: prepared.fields,
    flags: prepared.flags,
    meta: prepared.meta,
  });
  return { intakeId, fields: prepared.fields, flags: prepared.flags };
}
