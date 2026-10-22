// Optional API integration checks run when TEST_BASE_URL targets an isolated app.
// Uses synthetic registrations only and checks the AUSDRISK registration path.
import assert from "node:assert/strict";
import path from "node:path";
import Database from "better-sqlite3";
import type { AusdriskAnswers } from "../lib/survey/ausdrisk.ts";

const BASE_URL = process.env.TEST_BASE_URL;
const ORIGIN = BASE_URL ? new URL(BASE_URL).origin : "";
const databasePath = process.env.HACKATHON_DB_PATH
  ? path.resolve(process.env.HACKATHON_DB_PATH)
  : path.resolve("hackathon.db");

function report(name: string, pass: boolean): void {
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}`);
  assert.equal(pass, true, name);
}

function answers(overrides: Partial<AusdriskAnswers> = {}): AusdriskAnswers {
  return {
    age: 45,
    sex: "male",
    family_history: false,
    high_glucose: true,
    antihypertensive: false,
    daily_smoking: false,
    daily_fruit_veg: true,
    activity_150_minutes: true,
    waist_cm: 90,
    ...overrides,
  };
}

function registration(requestId: string, surveyAnswers: AusdriskAnswers) {
  return {
    full_name: "محمود تجريبي",
    phone: "01012345678",
    email: "survey@example.com",
    self_description: "",
    answers: {
      missed_doses: null,
      hypo_episodes: null,
      foot_problem: null,
      vision_change: null,
    },
    notes: "",
    input_method: "typed",
    consent: true,
    website: "",
    request_id: requestId,
    survey: { answers: surveyAnswers },
  };
}

async function postRegistration(body: unknown): Promise<Response> {
  return fetch(new URL("/api/register", BASE_URL), {
    method: "POST",
    headers: {
      origin: ORIGIN,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

async function postRetiredSurveyApi(pathname: string): Promise<Response> {
  return fetch(new URL(pathname, BASE_URL), {
    method: "POST",
    headers: {
      origin: ORIGIN,
      "content-type": "application/json",
    },
    body: "{}",
  });
}

async function main(): Promise<void> {
  if (!BASE_URL) {
    console.log("SKIP survey registration API checks; set TEST_BASE_URL for an isolated test server.");
    return;
  }
  try {
    await fetch(new URL("/api/health", BASE_URL));
  } catch {
    throw new Error(`Cannot reach ${BASE_URL}; start the app before test:survey.`);
  }

  const database = new Database(databasePath, { readonly: true });
  try {
    const oldExplanation = await postRetiredSurveyApi("/api/survey/explain");
    const oldPhrasing = await postRetiredSurveyApi("/api/survey/phrasing");
    report(
      "retired survey LLM APIs reject requests instead of producing medical text",
      oldExplanation.status === 410 && oldPhrasing.status === 410,
    );

    const thresholdAnswers = answers();
    const thresholdRequest = crypto.randomUUID();
    const thresholdResponse = await postRegistration(
      registration(thresholdRequest, thresholdAnswers),
    );
    const thresholdRecord = database.prepare(
      `SELECT p.age, i.priority, i.meta_json, i.red_flags_json
       FROM patients p JOIN intakes i ON i.patient_id = p.id
       WHERE p.request_id = ?`,
    ).get(thresholdRequest) as {
      age: number | null;
      priority: string | null;
      meta_json: string | null;
      red_flags_json: string | null;
    } | undefined;
    const thresholdMeta = thresholdRecord?.meta_json
      ? JSON.parse(thresholdRecord.meta_json) as {
          survey?: { tool?: string; total?: number; screeningResult?: string };
        }
      : {};
    const thresholdFlags = thresholdRecord?.red_flags_json
      ? JSON.parse(thresholdRecord.red_flags_json) as { flags?: string[] }
      : {};
    report(
      "registration stores a server-recomputed AUSDRISK screening result",
      thresholdResponse.ok && thresholdRecord?.age === 45 &&
        thresholdMeta.survey?.tool === "ausdrisk_ar_v1" &&
        thresholdMeta.survey.total === 13 &&
        thresholdMeta.survey.screeningResult === "diabetes_cutoff",
    );
    report(
      "AUSDRISK never sets ER flags or automatic urgent priority",
      thresholdRecord?.priority !== "urgent" &&
        thresholdFlags.flags?.every((flag) => !flag.startsWith("survey_")) === true,
    );

    const incompleteAnswers = answers({ high_glucose: null });
    const incompleteRequest = crypto.randomUUID();
    const incompleteResponse = await postRegistration(
      registration(incompleteRequest, incompleteAnswers),
    );
    const incompleteRecord = database.prepare(
      `SELECT i.meta_json, i.priority
       FROM patients p JOIN intakes i ON i.patient_id = p.id
       WHERE p.request_id = ?`,
    ).get(incompleteRequest) as {
      meta_json: string | null;
      priority: string | null;
    } | undefined;
    const incompleteMeta = incompleteRecord?.meta_json
      ? JSON.parse(incompleteRecord.meta_json) as {
          survey?: {
            screeningResult?: string;
            answers?: { high_glucose?: boolean | null };
          };
        }
      : {};
    report(
      "unanswered answers stay null and make screening result incomplete",
      incompleteResponse.ok &&
        incompleteMeta.survey?.answers?.high_glucose === null &&
        incompleteMeta.survey.screeningResult === "incomplete",
    );
    report(
      "incomplete screening is not turned into ER priority",
      incompleteRecord?.priority !== "urgent",
    );
  } finally {
    database.close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
