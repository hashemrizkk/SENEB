import { z } from "zod";
import {
  enrichFollowupPlan,
  mockFollowupPlan,
  type FollowupPatientDates,
  type FollowupPlan,
} from "./followup-plan.ts";
import { composeRecapBody } from "./recap-content.ts";

const recapSchema = z.object({
  recap: z.string().trim().min(1).max(440),
}).strict();

export type SavedEncounterPlanDraft = {
  plan_json: string;
  generation_mode: "mock" | "llm";
};

export async function generateEncounterDraft(input: {
  note: string;
  existingDate: string | null;
  patientDates: FollowupPatientDates;
  savedDraft: SavedEncounterPlanDraft | null;
  providerConfigured: boolean;
  payload: unknown;
}, dependencies: {
  generatePlan: (
    payload: unknown,
    note: string,
    existingDate: string | null,
  ) => Promise<{ output: unknown; model: string }>;
  generateRecap: (note: string) => Promise<{ output: unknown; model: string }>;
  today?: Date;
}): Promise<{
  plan: FollowupPlan;
  recap: string;
  preview: string;
  mode: "mock" | "llm";
}> {
  const mockMode = !input.providerConfigured;
  const [planCandidate, recapCandidate] = await Promise.all([
    input.savedDraft
      ? Promise.resolve({
          output: JSON.parse(input.savedDraft.plan_json) as unknown,
          model: input.savedDraft.generation_mode,
        })
      : mockMode
        ? Promise.resolve({
            output: mockFollowupPlan(
              input.note,
              input.existingDate,
              input.patientDates,
              dependencies.today,
            ),
            model: "mock",
          })
        : dependencies.generatePlan(input.payload, input.note, input.existingDate),
    mockMode
      ? Promise.resolve({
          output: { recap: "تمت مراجعة ملاحظات الزيارة من فريق العيادة." },
          model: "mock",
        })
      : dependencies.generateRecap(input.note),
  ]);
  const plan = enrichFollowupPlan(
    planCandidate.output,
    input.note,
    input.existingDate,
    input.patientDates,
    dependencies.today,
  );
  const recap = recapSchema.parse(recapCandidate.output).recap;
  const mode = input.savedDraft?.generation_mode ?? (mockMode ? "mock" : "llm");
  return {
    plan,
    recap,
    preview: composeRecapBody({
      recap,
      returnPrecautions: plan.return_precautions,
      nextVisitDate: plan.next_visit_date ?? input.existingDate,
      patientInstructions: plan.patient_instructions,
    }),
    mode,
  };
}
