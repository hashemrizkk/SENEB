import {
  enrichFollowupPlan,
  mockFollowupPlan,
  type FollowupPatientDates,
  type FollowupPlan,
} from "./followup-plan.ts";

export type FollowupPlanDraftInput = {
  intakeId: number;
  noteChanged: boolean;
  note: string;
  existingDate: string | null;
  patientDates: Partial<FollowupPatientDates>;
  payload: unknown;
};

export type FollowupPlanDraftDependencies = {
  providerConfigured: boolean;
  generate: (
    payload: unknown,
    note: string,
    existingDate: string | null,
  ) => Promise<{ output: unknown }>;
  save: (
    intakeId: number,
    note: string,
    plan: FollowupPlan,
    mode: "mock" | "llm",
  ) => boolean;
};

export async function generateFollowupPlanDraft(
  input: FollowupPlanDraftInput,
  dependencies: FollowupPlanDraftDependencies,
): Promise<boolean> {
  if (!input.noteChanged || !input.note.trim()) return false;

  try {
    const mode = dependencies.providerConfigured ? "llm" : "mock";
    const candidate = dependencies.providerConfigured
      ? (await dependencies.generate(input.payload, input.note, input.existingDate)).output
      : mockFollowupPlan(input.note, input.existingDate, input.patientDates);
    const plan = enrichFollowupPlan(
      candidate,
      input.note,
      input.existingDate,
      input.patientDates,
    );
    return dependencies.save(input.intakeId, input.note, plan, mode);
  } catch (error: unknown) {
    const errorType = error instanceof Error ? error.constructor.name : "UnknownError";
    console.error(`Automatic follow-up draft failed (${errorType}).`);
    return false;
  }
}
