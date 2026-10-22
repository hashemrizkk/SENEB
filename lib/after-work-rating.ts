import db, {
  buildAfterWorkRatingInput,
  hasAfterWorkRating,
  saveAfterWorkRating,
} from "./db.ts";
import {
  generateAfterWorkRating,
  verifyAfterWorkRatingQuotes,
} from "./llm.ts";
import { afterWorkRatingSchema } from "./summary-types.ts";

export async function generateAndSaveAfterWorkRating(
  intakeId: number,
  note: string,
): Promise<void> {
  try {
    const safeNote = /requestedSchema/i.test(note) ? "" : note;
    const context = buildAfterWorkRatingInput(db, intakeId, safeNote);
    if (!context || hasAfterWorkRating(db, intakeId, note)) return;
    const generated = await generateAfterWorkRating(context.input);
    if (!generated) return;
    const output = afterWorkRatingSchema.safeParse(
      verifyAfterWorkRatingQuotes(generated.output, safeNote),
    );
    if (!output.success) {
      console.error("After-work rating output did not pass validation.");
      return;
    }
    const mode = generated.model === "fallback"
      ? "fallback"
      : generated.model === "mock"
        ? "mock"
        : "llm";
    saveAfterWorkRating(db, {
      patientId: context.patientId,
      intakeId,
      note,
      output: output.data,
      mode,
      model: mode === "llm" ? generated.model : null,
    });
  } catch (error: unknown) {
    const errorType = error instanceof Error ? error.constructor.name : "UnknownError";
    console.error(`After-work rating failed (${errorType}).`);
  }
}
