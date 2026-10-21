import type Database from "better-sqlite3";
import { assessIntake } from "./case-assessment.ts";
import { buildFacts, type CaseFacts } from "./case-facts.ts";
import { intakeFieldsSchema, intakeMetaSchema, type IntakeFields } from "./intake.ts";
import { cairoDate } from "./date-time.ts";
import { BANNED_SUMMARY_TERMS, RULES_VERSION } from "./priority-config.ts";
import { normalizeWithMap, verifyQuote } from "./text-normalize.ts";
import {
  summaryLlmInputSchema,
  summaryLlmOutputSchema,
  type SummaryLlmInput,
  type SummaryLlmOutput,
} from "./summary-types.ts";

type SummaryPatient = {
  id: number;
  age: number | null;
  diabetes_type: string | null;
  last_hba1c_date: string | null;
  last_foot_exam_date: string | null;
  last_bp_date: string | null;
  next_visit_date: string | null;
};

type SummaryIntake = {
  id: number;
  raw_text: string | null;
  structured_json: string | null;
  meta_json: string | null;
};

type SummaryResult = {
  ok: boolean;
  summary_id?: number;
  error?: string;
  status?: number;
};

export type SummaryDependencies = {
  db: Database.Database;
  summarizeCase: (
    payload: SummaryLlmInput,
  ) => Promise<{ output: unknown; model: string | null }>;
  hasProvider: () => boolean;
  now?: () => Date;
};

type JsonText = { text: string };

function parseStoredJson(value: string, label: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new Error(`Stored ${label} is not valid JSON.`);
  }
}

function makeMockSummary(
  facts: CaseFacts,
  fields: IntakeFields,
): SummaryLlmOutput {
  const name = facts.diabetes_type
    ? `Diabetes type is recorded as ${facts.diabetes_type}.`
    : "Diabetes type is not recorded.";
  const age =
    facts.age === null ? "Age is not recorded." : `Age is recorded as ${facts.age}.`;
  const answers = [
    fields.missed_doses === null
      ? "medication doses not answered"
      : `missed doses ${fields.missed_doses ? "yes" : "no"}`,
    fields.hypoglycemia_episodes === null
      ? "low-sugar episodes not answered"
      : `${fields.hypoglycemia_episodes} low-sugar episode(s)`,
    fields.foot_problem === null
      ? "foot problem not answered"
      : `foot problem ${fields.foot_problem ? "yes" : "no"}`,
    fields.vision_change === null
      ? "vision change not answered"
      : `vision change ${fields.vision_change ? "yes" : "no"}`,
  ].join(", ");
  return {
    summary: `[MOCK] Demo-only summary. ${age} ${name} Recorded answers: ${answers}.`,
    highlights: [],
    values: [],
    inconsistencies: [],
  };
}

function makeLlmPayload(
  facts: CaseFacts,
  fields: IntakeFields,
  patientText: string | null,
): SummaryLlmInput {
  return summaryLlmInputSchema.parse({
    age: facts.age,
    diabetes_type: facts.diabetes_type,
    intake: {
      missed_doses: fields.missed_doses,
      hypoglycemia_episodes: fields.hypoglycemia_episodes,
      hypoglycemia_symptoms: fields.hypoglycemia_symptoms,
      foot_problem: fields.foot_problem,
      vision_change: fields.vision_change,
    },
    patient_text: patientText,
    care_gaps: [
      {
        item: "HbA1c",
        days_overdue_or_null:
          facts.care_gaps.hba1c.days_since === null
            ? null
            : Math.max(
                0,
                facts.care_gaps.hba1c.days_since -
                  facts.care_gaps.hba1c.threshold_days,
              ),
      },
      {
        item: "foot examination",
        days_overdue_or_null:
          facts.care_gaps.foot_exam.days_since === null
            ? null
            : Math.max(
                0,
                facts.care_gaps.foot_exam.days_since -
                  facts.care_gaps.foot_exam.threshold_days,
              ),
      },
      {
        item: "blood pressure",
        days_overdue_or_null:
          facts.care_gaps.blood_pressure.days_since === null
            ? null
            : Math.max(
                0,
                facts.care_gaps.blood_pressure.days_since -
                  facts.care_gaps.blood_pressure.threshold_days,
              ),
      },
      {
        item: "next visit",
        days_overdue_or_null:
          facts.care_gaps.next_visit.date === null
            ? null
            : facts.care_gaps.next_visit.days_overdue ?? 0,
      },
    ],
  });
}

function hasBannedTerm(summary: string): boolean {
  const lowered = summary.toLowerCase();
  return BANNED_SUMMARY_TERMS.some((term) => lowered.includes(term));
}

function checkAiOutput(
  output: SummaryLlmOutput,
  patientText: string | null,
): {
  highlights: SummaryLlmOutput["highlights"];
  values: SummaryLlmOutput["values"];
  inconsistencies: SummaryLlmOutput["inconsistencies"];
  dropped: number;
} {
  let dropped = 0;
  const highlights = output.highlights.filter((item) => {
    const verified =
      patientText !== null && verifyQuote(patientText, item.quote);
    if (!verified) dropped += 1;
    return verified;
  });
  const values = output.values.filter((item) => {
    const verified =
      patientText !== null &&
      verifyQuote(patientText, item.quote) &&
      /\d/.test(normalizeWithMap(item.quote).normalized);
    if (!verified) dropped += 1;
    return verified;
  });
  const inconsistencies = output.inconsistencies.filter((item) => {
    const verified =
      patientText !== null &&
      item.quotes.length > 0 &&
      item.quotes.every((quote) => verifyQuote(patientText, quote));
    if (!verified) dropped += 1;
    return verified;
  });
  return { highlights, values, inconsistencies, dropped };
}

function latestIntake(
  database: Database.Database,
  patientId: number,
): SummaryIntake | undefined {
  return database
    .prepare<[number], SummaryIntake>(
      `SELECT id, raw_text, structured_json, meta_json
       FROM intakes
       WHERE patient_id = ?
       ORDER BY created_at DESC, id DESC
       LIMIT 1`,
    )
    .get(patientId);
}

const generationInProgress = new Set<number>();

export async function generateCaseSummary(
  patientId: number,
  deps: SummaryDependencies,
): Promise<SummaryResult> {
  if (generationInProgress.has(patientId)) {
    return {
      ok: false,
      error: "A summary is already being generated. Please wait.",
      status: 429,
    };
  }
  generationInProgress.add(patientId);
  try {
    return await generateCaseSummaryInternal(patientId, deps);
  } finally {
    generationInProgress.delete(patientId);
  }
}

async function generateCaseSummaryInternal(
  patientId: number,
  deps: SummaryDependencies,
): Promise<SummaryResult> {
  const { db: database } = deps;
  const patient = database
    .prepare<[number], SummaryPatient>(
      `SELECT id, age, diabetes_type, last_hba1c_date, last_foot_exam_date,
              last_bp_date, next_visit_date
       FROM patients WHERE id = ?`,
    )
    .get(patientId);
  if (!patient) {
    return { ok: false, error: "Patient not found.", status: 404 };
  }

  const intake = latestIntake(database, patientId);
  if (!intake) {
    return { ok: false, error: "No intake is available for this patient.", status: 409 };
  }

  const now = (deps.now ?? (() => new Date()))();
  const previousSummary = database
    .prepare<[number], JsonText>(
      `SELECT created_at AS text
       FROM case_summaries
       WHERE patient_id = ?
       ORDER BY created_at DESC, id DESC
       LIMIT 1`,
    )
    .get(patientId);
  if (previousSummary) {
    const elapsed = now.getTime() - Date.parse(previousSummary.text);
    if (elapsed >= 0 && elapsed < 5_000) {
      return {
        ok: false,
        error: "Please wait 5 seconds before generating another summary.",
        status: 429,
      };
    }
  }

  if (intake.structured_json === null) {
    return { ok: false, error: "The intake answers are unavailable.", status: 422 };
  }
  const parsedFields = intakeFieldsSchema.safeParse(
    parseStoredJson(intake.structured_json, "intake answers"),
  );
  if (!parsedFields.success) {
    return { ok: false, error: "The intake answers are invalid.", status: 422 };
  }
  const fields = parsedFields.data;
  let needsReview = true;
  if (intake.meta_json !== null) {
    const parsedMeta = intakeMetaSchema.safeParse(
      parseStoredJson(intake.meta_json, "intake metadata"),
    );
    if (!parsedMeta.success) {
      return { ok: false, error: "The intake review status is invalid.", status: 422 };
    }
    needsReview = parsedMeta.data.needs_review;
  }

  const today = new Date(`${cairoDate(now)}T00:00:00.000Z`);
  const facts = buildFacts(patient, fields, today);
  const assessment = assessIntake({
    fields,
    rawText: intake.raw_text,
    hasIntake: true,
    needsReview,
  });
  const payload = makeLlmPayload(facts, fields, intake.raw_text);

  let mode: "llm" | "mock" | "fallback" = "fallback";
  let model: string | null = null;
  let summary: SummaryLlmOutput | null = null;
  if (!deps.hasProvider()) {
    mode = "mock";
    summary = makeMockSummary(facts, fields);
    console.log("MOCK MODE: case summaries use deterministic demo text.");
  } else {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      let result: { output: unknown; model: string | null };
      try {
        result = await deps.summarizeCase(payload);
      } catch (error: unknown) {
        const errorType =
          error instanceof Error ? error.constructor.name : "UnknownError";
        console.error(`Case summary attempt ${attempt + 1} failed (${errorType}).`);
        continue;
      }

      const parsedOutput = summaryLlmOutputSchema.safeParse(result.output);
      if (!parsedOutput.success || hasBannedTerm(parsedOutput.data.summary)) {
        continue;
      }
      summary = parsedOutput.data;
      model = result.model;
      mode = "llm";
      break;
    }
  }

  const verified =
    summary && mode === "llm"
      ? checkAiOutput(summary, intake.raw_text)
      : {
          highlights: [],
          values: [],
          inconsistencies: [],
          dropped: 0,
        };
  const insert = database.prepare(
    `INSERT INTO case_summaries (
       patient_id, intake_id, generation_mode, model, summary_text, facts_json,
       rule_flags_json, ai_flags_json, values_json, inconsistencies_json,
       suggested_priority, priority_reasons_json, rules_version,
       dropped_ai_items, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const result = insert.run(
    patient.id,
    intake.id,
    mode,
    model,
    mode === "fallback" ? null : summary?.summary ?? null,
    JSON.stringify(facts),
    JSON.stringify(assessment.lexiconMatches),
    JSON.stringify(verified.highlights),
    JSON.stringify(verified.values),
    JSON.stringify([
      ...assessment.inconsistencies,
      ...verified.inconsistencies,
    ]),
    assessment.suggestion.priority,
    JSON.stringify(assessment.suggestion.reasons),
    RULES_VERSION,
    verified.dropped,
    now.toISOString(),
  );
  return { ok: true, summary_id: Number(result.lastInsertRowid) };
}
