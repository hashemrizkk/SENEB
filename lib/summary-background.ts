import db, { latestCaseSummary, latestIntakeForPatient } from "./db.ts";
import { hasSummaryProviderConfigured, summarizeCase } from "./llm.ts";
import { generateCaseSummary } from "./summary.ts";

export function summaryIsMissingOrStale(patientId: number): boolean {
  const intake = latestIntakeForPatient(patientId);
  if (!intake) return false;
  return latestCaseSummary(patientId)?.intake_id !== intake.id;
}

export async function generateSummarySafely(patientId: number): Promise<void> {
  try {
    const result = await generateCaseSummary(patientId, {
      db,
      summarizeCase,
      hasProvider: hasSummaryProviderConfigured,
    });
    if (!result.ok) {
      console.error(`Background case summary generation failed (status ${result.status ?? 500}).`);
    }
  } catch (error: unknown) {
    const errorType = error instanceof Error ? error.constructor.name : "UnknownError";
    console.error(`Background case summary generation failed (${errorType}).`);
  }
}
