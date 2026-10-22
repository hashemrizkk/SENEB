import type Database from "better-sqlite3";
import { z } from "zod";
import db, { completeVisitNoteCheck, getPatient, insertVisitNote, latestIntakeForPatient } from "./db.ts";
import { intakeFieldsSchema } from "./intake.ts";
import { matchLexicon } from "./lexicon.ts";
import { buildRequiredItems, NOTE_RULES_VERSION, type NoteChecklistItem } from "./note-checklist.ts";
import { anchorOnlyResults, checkNoteCoverage, noteFallbackReason, verifyNoteCheck } from "./note-check.ts";
import { lightFromChecklist, type NoteCheckMode } from "./note-light.ts";
import { hasGroqCheckProviderConfigured } from "./llm.ts";

export const saveNoteRequestSchema = z.object({
  patient_id: z.number().int().positive(),
  note_text: z.string().max(5_000),
  input_method: z.enum(["typed", "voice", "mixed"]),
  author_role: z.enum(["nurse", "doctor"]),
  author_name: z.string().trim().min(2).max(80),
}).strict();

export type SaveNoteInput = z.infer<typeof saveNoteRequestSchema>;
export type NoteCheckFunction = (noteText: string, items: NoteChecklistItem[]) => Promise<{
  mode: "llm" | "mock"; model: string | null; results: { id: string; status: "documented" | "declined_or_deferred" | "not_documented" | "unclear"; evidence_quote: string | null }[];
}>;

export async function saveNoteAndCheck(input: SaveNoteInput, dependencies: {
  database?: Database.Database;
  now?: () => Date;
  check?: NoteCheckFunction;
} = {}): Promise<{ noteId: number; light: "green" | "yellow" | "red" | null; checkMode: NoteCheckMode; results: ReturnType<typeof lightFromChecklist>["reasons"]; unverifiedItems: number }> {
  const data = saveNoteRequestSchema.parse(input);
  const database = dependencies.database ?? db;
  const now = dependencies.now ?? (() => new Date());
  const noteId = insertVisitNote(database, {
    patientId: data.patient_id, noteText: data.note_text, inputMethod: data.input_method,
    authorRole: data.author_role, authorName: data.author_name, now: now(),
  });
  let items: NoteChecklistItem[] = [];
  let intakeId: number | null = null;
  try {
    const patient = getPatient(data.patient_id, database);
    if (!patient) throw new Error("Patient record unavailable after note save.");
    const intake = latestIntakeForPatient(data.patient_id, database);
    intakeId = intake?.id ?? null;
    let fields: z.infer<typeof intakeFieldsSchema> | null = null;
    if (intake?.structured_json) {
      const parsedFields = intakeFieldsSchema.safeParse(JSON.parse(intake.structured_json) as unknown);
      if (!parsedFields.success) throw new Error("Stored intake structure is invalid.");
      fields = parsedFields.data;
    }
    items = buildRequiredItems({
      intake: intake && fields ? {
        fields,
        rawText: intake.raw_text,
        redFlags: intake.red_flags_json ? JSON.parse(intake.red_flags_json) as unknown : null,
        lexiconMatches: matchLexicon(intake.raw_text ?? ""),
      } : null,
      patientDates: {
        last_foot_exam_date: patient.last_foot_exam_date,
        last_bp_date: patient.last_bp_date,
        last_hba1c_date: patient.last_hba1c_date,
      },
      today: now(),
    });

    let mode: NoteCheckMode;
    let model: string | null;
    let results: { id: string; status: "documented" | "declined_or_deferred" | "not_documented" | "unclear"; evidence_quote: string | null }[];
    const fallbackReasonCode: string | null = null;
    const fallbackDetail: string | null = null;
    if (dependencies.check) {
      const checked = await dependencies.check(data.note_text, items);
      mode = checked.mode;
      model = checked.model;
      results = checked.results;
    } else {
      if (!hasGroqCheckProviderConfigured()) throw new Error("NOTE_PROVIDER_NOT_CONFIGURED");
      const checked = await checkNoteCoverage({ noteText: data.note_text, items });
      mode = checked.mode;
      model = checked.model;
      results = checked.results;
    }
    const verified = verifyNoteCheck(data.note_text, items, results);
    const computed = lightFromChecklist(items, verified.results, mode, data.note_text);
    const storedResults = { results: computed.reasons, unverified_items: verified.unverifiedItems };
    const completed = completeVisitNoteCheck(database, {
      noteId, checkResultJson: JSON.stringify(storedResults), light: computed.light, mode,
      model, rulesVersion: NOTE_RULES_VERSION, intakeId, fallbackReason: fallbackReasonCode,
      fallbackDetail,
    });
    if (!completed) throw new Error("NOTE_COMPLETION_FAILED");
    return { noteId, light: computed.light, checkMode: mode, results: computed.reasons, unverifiedItems: verified.unverifiedItems };
  } catch (error: unknown) {
    const safeFailure = noteFallbackReason(error);
    const fallbackResults = anchorOnlyResults(data.note_text, items);
    const verified = verifyNoteCheck(data.note_text, items, fallbackResults);
    const computed = lightFromChecklist(items, verified.results, "fallback", data.note_text);
    completeVisitNoteCheck(database, {
      noteId,
      checkResultJson: JSON.stringify({ results: computed.reasons, unverified_items: verified.unverifiedItems }),
      light: computed.light, mode: "fallback", model: null, rulesVersion: NOTE_RULES_VERSION,
      intakeId, fallbackReason: safeFailure.code, fallbackDetail: safeFailure.detail,
    });
    return { noteId, light: computed.light, checkMode: "fallback", results: computed.reasons, unverifiedItems: verified.unverifiedItems };
  }
}
