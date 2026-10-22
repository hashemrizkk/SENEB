import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import Database from "better-sqlite3";
import { summarizeCase, hasSummaryProviderConfigured } from "../lib/llm.ts";
import { generateCaseSummary } from "../lib/summary.ts";
import { verifySummaryOutput } from "../lib/summary.ts";
import { matchLexicon } from "../lib/lexicon.ts";
import { findAllOccurrences } from "../lib/text-normalize.ts";
import { intakeFieldsSchema } from "../lib/intake.ts";
import { summaryLlmOutputSchema } from "../lib/summary-types.ts";
import type { SummaryLlmInput, SummaryLlmOutput } from "../lib/summary-types.ts";

type GoldHighlight = {
  quote: string;
  category: string;
  assertion: string;
};
type GoldValue = {
  quote: string;
  kind: string;
  parts: { number: number; unit: string | null }[];
};
type EvalCase = {
  id: string;
  split: "dev" | "holdout";
  language: string;
  input_method: "typed" | "voice";
  text: string;
  structured: {
    missed_doses: boolean | null;
    hypoglycemia_episodes: number | null;
    foot_problem: boolean | null;
    vision_change: boolean | null;
  };
  gold_highlights: GoldHighlight[];
  gold_values: GoldValue[];
  must_catch_critical: boolean;
  label_review: "unreviewed";
  notes: string;
};
type CaseRunResult = {
  raw: SummaryLlmOutput | null;
  stored: {
    highlights: { quote: string; category: string }[];
    values: { quote: string; meaning: string }[];
  };
  dropped: number;
};

const root = process.cwd();
const require = createRequire(import.meta.url);
const nextEnv = require("@next/env") as typeof import("@next/env");
nextEnv.loadEnvConfig(root);

function argument(name: string, fallback: string): string {
  const prefix = `--${name}=`;
  const inline = process.argv.find((value) => value.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] ?? fallback : fallback;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function hasOption(name: string): boolean {
  return hasFlag(name) || process.argv.some((value) => value.startsWith(`--${name}=`));
}

function parseCount(value: string, name: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(`--${name} must be a positive integer.`);
  }
  return parsed;
}

function requireEvalCases(value: unknown): EvalCase[] {
  if (!Array.isArray(value) || value.length < 48) {
    throw new Error("The evaluation set must contain at least 48 cases.");
  }
  const ids = new Set<string>();
  for (const item of value as EvalCase[]) {
    if (
      !item || typeof item !== "object" ||
      typeof item.id !== "string" || ids.has(item.id) ||
      !["dev", "holdout"].includes(item.split) ||
      !["egyptian", "msa", "franco", "english", "mixed"].includes(item.language) ||
      !["typed", "voice"].includes(item.input_method) ||
      typeof item.text !== "string" ||
      !item.structured || !Array.isArray(item.gold_highlights) ||
      !Array.isArray(item.gold_values) ||
      typeof item.must_catch_critical !== "boolean" ||
      item.label_review !== "unreviewed"
    ) {
      throw new Error("The evaluation set contains an invalid or duplicate case.");
    }
    ids.add(item.id);
    for (const highlight of item.gold_highlights) {
      if (!item.text.includes(highlight.quote)) {
        throw new Error(`Gold quote is not an exact substring: ${item.id}.`);
      }
    }
    for (const mentionedValue of item.gold_values) {
      if (!item.text.includes(mentionedValue.quote)) {
        throw new Error(`Gold value is not an exact substring: ${item.id}.`);
      }
    }
  }
  return value as EvalCase[];
}

function emptyFields(testCase: EvalCase) {
  return intakeFieldsSchema.parse({
    missed_doses: testCase.structured.missed_doses,
    hypoglycemia_episodes: testCase.structured.hypoglycemia_episodes,
    hypoglycemia_symptoms: null,
    foot_problem: testCase.structured.foot_problem,
    vision_change: testCase.structured.vision_change,
    emergency_symptoms_mentioned: null,
    symptoms_text: null,
  });
}

function inMemoryDb(testCase: EvalCase): Database.Database {
  const db = new Database(":memory:");
  db.exec(readFileSync(path.join(root, "lib", "schema.sql"), "utf8"));
  db.prepare(
    `INSERT INTO patients
       (id, name, age, diabetes_type, last_hba1c_date, last_foot_exam_date,
        last_bp_date, next_visit_date)
     VALUES (1, 'Synthetic Evaluation Patient', 47, 'type 2', NULL, NULL, NULL, NULL)`,
  ).run();
  db.prepare(
    `INSERT INTO intakes
       (id, patient_id, input_method, raw_text, structured_json, red_flags_json,
        meta_json, created_at)
     VALUES (1, 1, ?, ?, ?, '{}', ?, '2026-10-01T12:00:00.000Z')`,
  ).run(
    testCase.input_method,
    testCase.text,
    JSON.stringify(emptyFields(testCase)),
    JSON.stringify({ llm_mode: "real", model: null, needs_review: false, contradiction: false }),
  );
  return db;
}

function span(text: string, quote: string): { start: number; end: number }[] {
  return findAllOccurrences(text, quote);
}

function spanOverlap(text: string, left: string, right: string): boolean {
  const leftSpans = span(text, left);
  const rightSpans = span(text, right);
  return leftSpans.some((a) => rightSpans.some((b) => {
    const overlap = Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start));
    return overlap / Math.min(a.end - a.start, b.end - b.start) >= 0.5;
  }));
}

function categoryGroup(category: string): string {
  if (["medication_issue", "medication"].includes(category)) return "medication";
  if (["foot_problem", "infection_or_wound", "foot"].includes(category)) return "foot";
  if (["vision_problem", "vision"].includes(category)) return "vision";
  if (category === "hyperglycemia" || category === "hyperglycemia_symptoms") return "hyperglycemia";
  if (category === "hypoglycemia" || category === "hypoglycemia_symptoms") return "hypoglycemia";
  if ([
    "loss_of_consciousness", "chest_pain", "breathing_difficulty", "confusion",
    "vomiting", "bleeding", "swelling", "pain_other", "fatigue", "symptom", "other",
  ].includes(category)) return "symptom";
  return category;
}

function compatibleCategory(left: string, right: string): boolean {
  return left === right || categoryGroup(left) === categoryGroup(right);
}

function numericValues(text: string): number[] {
  const normalized = text.replace(/[٠-٩]/g, (digit) =>
    String(digit.charCodeAt(0) - 0x0660),
  ).replace(/[۰-۹]/g, (digit) =>
    String(digit.charCodeAt(0) - 0x06f0),
  );
  return (normalized.match(/\d+(?:[.,٫]\d+)?/g) ?? [])
    .map((value) => Number(value.replace(/[٫,]/g, ".")));
}

function metricsFor(cases: EvalCase[], results: Map<string, {
  raw: SummaryLlmOutput | null;
  stored: { highlights: { quote: string; category: string }[]; values: { quote: string; meaning: string }[] };
  dropped: number;
}[]>): Record<string, unknown> {
  let goldHighlights = 0;
  let predictedHighlights = 0;
  let matchedHighlights = 0;
  let goldValues = 0;
  let predictedValues = 0;
  let matchedValues = 0;
  let numericExact = 0;
  let rawItems = 0;
  let hallucinatedItems = 0;
  let dropped = 0;
  let criticalCases = 0;
  let lexiconCaught = 0;
  let aiCaught = 0;
  let combinedCaught = 0;

  for (const testCase of cases) {
    const caseResults = results.get(testCase.id) ?? [];
    for (const result of caseResults) {
      const predicted = result.stored.highlights;
      const predictedValueList = result.stored.values;
      goldHighlights += testCase.gold_highlights.length;
      predictedHighlights += predicted.length;
      goldValues += testCase.gold_values.length;
      predictedValues += predictedValueList.length;
      dropped += result.dropped;

      const raw = result.raw;
      if (raw) {
        rawItems += raw.highlights.length + raw.values.length;
        hallucinatedItems += raw.highlights.filter((item) => !span(testCase.text, item.quote).length).length;
        hallucinatedItems += raw.values.filter((item) => !span(testCase.text, item.quote).length).length;
      }

      const usedHighlights = new Set<number>();
      for (const gold of testCase.gold_highlights) {
        const index = predicted.findIndex((item, candidateIndex) =>
          !usedHighlights.has(candidateIndex) &&
          compatibleCategory(gold.category, item.category) &&
          spanOverlap(testCase.text, gold.quote, item.quote),
        );
        if (index >= 0) {
          usedHighlights.add(index);
          matchedHighlights += 1;
        }
      }
      const usedValues = new Set<number>();
      for (const gold of testCase.gold_values) {
        const index = predictedValueList.findIndex((item, candidateIndex) =>
          !usedValues.has(candidateIndex) &&
          spanOverlap(testCase.text, gold.quote, item.quote),
        );
        if (index >= 0) {
          usedValues.add(index);
          matchedValues += 1;
          const expected = gold.parts.map((part) => part.number).sort((a, b) => a - b);
          const actual = numericValues(predictedValueList[index]!.quote).sort((a, b) => a - b);
          if (JSON.stringify(expected) === JSON.stringify(actual)) numericExact += 1;
        }
      }

      if (testCase.must_catch_critical) {
        const criticalGold = testCase.gold_highlights.filter((highlight) =>
          ["loss_of_consciousness", "chest_pain", "breathing_difficulty", "confusion", "vomiting", "bleeding"].includes(highlight.category),
        );
        const ruleCaught = matchLexicon(testCase.text).some((match) =>
          criticalGold.some((gold) => spanOverlap(testCase.text, gold.quote, match.term)),
        );
        const aiFound = criticalGold.some((gold) =>
          predicted.some((item) =>
            compatibleCategory(gold.category, item.category) &&
            spanOverlap(testCase.text, gold.quote, item.quote),
          ),
        );
        criticalCases += 1;
        if (ruleCaught) lexiconCaught += 1;
        if (aiFound) aiCaught += 1;
        if (ruleCaught || aiFound) combinedCaught += 1;
      }
    }
  }

  return {
    highlight_recall: goldHighlights ? matchedHighlights / goldHighlights : null,
    highlight_precision: predictedHighlights ? matchedHighlights / predictedHighlights : null,
    assertion_accuracy: "not available in baseline schema",
    value_recall: goldValues ? matchedValues / goldValues : null,
    value_precision: predictedValues ? matchedValues / predictedValues : null,
    numeric_exactness: matchedValues ? numericExact / matchedValues : null,
    unit_accuracy: "not available in baseline schema",
    hallucination_rate_before_verification: rawItems ? hallucinatedItems / rawItems : null,
    hallucinated_items_before_verification: hallucinatedItems,
    raw_items: rawItems,
    dropped_by_verification: dropped,
    repaired_by_verification: 0,
    unaccounted_numbers: "not measured by baseline",
    critical_coverage: {
      cases: criticalCases,
      lexicon_only: lexiconCaught,
      llm_only: aiCaught,
      either: combinedCaught,
      neither: criticalCases - combinedCaught,
    },
  };
}

async function main(): Promise<void> {
  const config = argument("config", "baseline");
  const split = argument("split", "dev");
  const runs = parseCount(argument("runs", "1"), "runs");
  if (config !== "baseline") {
    throw new Error("Only baseline is available before the baseline run is approved.");
  }
  if (!["dev", "holdout", "all"].includes(split)) {
    throw new Error("--split must be dev, holdout, or all.");
  }
  const allCases = requireEvalCases(JSON.parse(
    readFileSync(path.join(root, "data", "eval", "gold.json"), "utf8"),
  ) as unknown);
  const cases = allCases.filter((item) => split === "all" || item.split === split);
  const labelCount = cases.filter((item) => item.label_review === "unreviewed").length;
  const configuredProviderCount = Number(Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY)) +
    Number(Boolean(process.env.GROQ_API_KEY));
  const plannedMaximum = cases.length * runs * 2 * configuredProviderCount;
  const maxCalls = hasOption("max-calls")
    ? parseCount(argument("max-calls", ""), "max-calls")
    : plannedMaximum;

  console.log(`Config: ${config}; split: ${split}; runs: ${runs}`);
  console.log(`Cases: ${cases.length}; unreviewed labels: ${labelCount}`);
  console.log(`Maximum provider API calls (including production retry/fallback): ${plannedMaximum}`);
  console.log(`Call guard (--max-calls): ${maxCalls}`);
  if (!hasFlag("yes")) {
    console.log("No API calls made. Re-run with --yes only after approving the call budget.");
    return;
  }
  if (!hasSummaryProviderConfigured() || configuredProviderCount === 0) {
    console.error("Evaluation requires the real LLM; mock results are meaningless");
    process.exitCode = 1;
    return;
  }

  const results = new Map<string, CaseRunResult[]>();
  let apiCalls = 0;
  for (const testCase of cases) {
    const runResults: CaseRunResult[] = [];
    for (let run = 0; run < runs; run += 1) {
      const db = inMemoryDb(testCase);
      let raw: SummaryLlmOutput | null = null;
      try {
        await generateCaseSummary(1, {
          db,
          hasProvider: hasSummaryProviderConfigured,
          summarizeCase: async (payload: SummaryLlmInput, options) => {
            const result = await summarizeCase(payload, {
              onProviderRequest: () => {
                if (apiCalls >= maxCalls) throw new Error("Evaluation max-calls guard reached.");
                apiCalls += 1;
                options?.onProviderRequest?.();
              },
            });
            const parsed = summaryLlmOutputSchema.safeParse(result.output);
            raw = parsed.success ? parsed.data : null;
            return result;
          },
          now: () => new Date("2026-10-21T12:00:00.000Z"),
        });
        const row = db.prepare(
          "SELECT ai_flags_json, values_json, dropped_ai_items FROM case_summaries ORDER BY id DESC LIMIT 1",
        ).get() as {
          ai_flags_json: string | null;
          values_json: string | null;
          dropped_ai_items: number;
        } | undefined;
        const output = raw;
        const verification = output
          ? verifySummaryOutput(output, testCase.text)
          : { highlights: [], values: [], dropped: 0 };
        runResults.push({
          raw: output,
          stored: row
            ? {
                highlights: JSON.parse(row.ai_flags_json ?? "[]") as { quote: string; category: string }[],
                values: JSON.parse(row.values_json ?? "[]") as { quote: string; meaning: string }[],
              }
            : { highlights: verification.highlights, values: verification.values },
          dropped: row?.dropped_ai_items ?? verification.dropped,
        });
      } finally {
        db.close();
      }
    }
    results.set(testCase.id, runResults);
  }

  const byLanguage = Object.fromEntries([...new Set(cases.map((item) => item.language))]
    .sort().map((language) => [language, metricsFor(cases.filter((item) => item.language === language), results)]));
  const byCategory = Object.fromEntries([...new Set(cases.flatMap((item) => item.gold_highlights.map((highlight) => highlight.category)))]
    .sort().map((category) => [category, metricsFor(cases.filter((item) => item.gold_highlights.some((highlight) => highlight.category === category)), results)]));
  const report = {
    config,
    split,
    runs,
    provider_api_calls: apiCalls,
    cases: cases.length,
    unreviewed_labels: labelCount,
    metrics: metricsFor(cases, results),
    by_language: byLanguage,
    by_category: byCategory,
  };
  console.log(JSON.stringify(report, null, 2));
  const outputDirectory = path.join(root, "data", "eval", "results");
  mkdirSync(outputDirectory, { recursive: true });
  writeFileSync(
    path.join(outputDirectory, `baseline-${split}.json`),
    `${JSON.stringify(report, null, 2)}\n`,
  );
}

try {
  await main();
} catch (error: unknown) {
  console.error(error instanceof Error ? error.message : "Evaluation failed.");
  process.exitCode = 1;
}
