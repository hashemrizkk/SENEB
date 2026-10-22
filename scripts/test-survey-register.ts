// Optional API integration checks run when TEST_BASE_URL targets an isolated app.
// Uses synthetic registrations only and checks that the anonymous survey APIs do not write rows.
import assert from "node:assert/strict";
import path from "node:path";
import Database from "better-sqlite3";

const BASE_URL = process.env.TEST_BASE_URL;
const ORIGIN = BASE_URL ? new URL(BASE_URL).origin : "";
const databasePath = process.env.HACKATHON_DB_PATH
  ? path.resolve(process.env.HACKATHON_DB_PATH)
  : path.resolve("hackathon.db");

function report(name: string, pass: boolean): void {
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}`);
  assert.equal(pass, true, name);
}

async function post(pathname: string, body: unknown): Promise<Response> {
  return fetch(new URL(pathname, BASE_URL), {
    method: "POST",
    headers: {
      origin: ORIGIN,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

function counts(database: Database.Database): { patients: number; intakes: number } {
  return {
    patients:
      database.prepare<[], { count: number }>(
        "SELECT COUNT(*) AS count FROM patients",
      ).get()?.count ?? 0,
    intakes:
      database.prepare<[], { count: number }>(
        "SELECT COUNT(*) AS count FROM intakes",
      ).get()?.count ?? 0,
  };
}

function symptoms(overrides: Record<string, boolean | null> = {}) {
  return {
    extreme_thirst: false,
    rapid_weight_loss: false,
    blurred_vision: false,
    vomiting: false,
    confusion: false,
    ...overrides,
  };
}

function survey(
  answers: Record<string, number | boolean | string | null>,
  symptomAnswers = symptoms(),
) {
  return { answers, symptoms: symptomAnswers };
}

function registration(
  requestId: string,
  surveyData: ReturnType<typeof survey>,
) {
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
    survey: surveyData,
  };
}

async function main(): Promise<void> {
  if (!BASE_URL) {
    console.log("SKIP survey-to-registration API checks; set TEST_BASE_URL for an isolated test server.");
    return;
  }
  try {
    await fetch(new URL("/api/health", BASE_URL));
  } catch {
    throw new Error(`Cannot reach ${BASE_URL}; start the app before test:survey.`);
  }

  const database = new Database(databasePath, { readonly: true });
  try {
    const before = counts(database);

    const phrases = await post("/api/survey/phrasing", {});
    const explanation = await post("/api/survey/explain", {
      band: "low",
      unknownItems: [],
      redFlagSymptoms: [],
    });
    report(
      "anonymous survey language APIs return without saving patient or intake rows",
      phrases.ok && explanation.ok &&
        JSON.stringify(counts(database)) === JSON.stringify(before),
    );

    const lowWithUrgentSymptom = registration(
      crypto.randomUUID(),
      survey({
        age: 44,
        sex: "male",
        height_cm: 170,
        weight_kg: 71.961,
        waist_cm: 90,
        activity: true,
        fruit_veg: true,
        antihypertensive: false,
        high_glucose: false,
        family_history: "none",
      }, symptoms({ extreme_thirst: true })),
    );
    const urgentResponse = await post("/api/register", lowWithUrgentSymptom);
    const urgentId = lowWithUrgentSymptom.request_id;
    const urgentRecord = database.prepare(
      `SELECT p.age, i.priority, i.meta_json, i.red_flags_json
       FROM patients p JOIN intakes i ON i.patient_id = p.id
       WHERE p.request_id = ?`,
    ).get(urgentId) as {
      age: number | null;
      priority: string | null;
      meta_json: string | null;
      red_flags_json: string | null;
    } | undefined;
    const urgentMeta = urgentRecord?.meta_json
      ? JSON.parse(urgentRecord.meta_json) as { survey?: { band?: string } }
      : {};
    const urgentFlags = urgentRecord?.red_flags_json
      ? JSON.parse(urgentRecord.red_flags_json) as { flags?: string[] }
      : {};
    report(
      "conversion creates one patient and intake with survey audit data",
      urgentResponse.ok && urgentRecord?.age === 44 &&
        urgentMeta.survey?.band === "low" &&
        urgentFlags.flags?.includes("survey_extreme_thirst") === true,
    );
    report(
      "symptom urgency overrides low FINDRISC score",
      urgentRecord?.priority === "urgent",
    );

    const highRequest = crypto.randomUUID();
    const highResponse = await post("/api/register", registration(
      highRequest,
      survey({
        age: 65,
        sex: "male",
        height_cm: 170,
        weight_kg: 86.7,
        waist_cm: 103,
        activity: false,
        fruit_veg: false,
        antihypertensive: true,
        high_glucose: false,
        family_history: "none",
      }),
    ));
    const highRecord = database.prepare(
      `SELECT i.priority, i.meta_json
       FROM patients p JOIN intakes i ON i.patient_id = p.id
       WHERE p.request_id = ?`,
    ).get(highRequest) as {
      priority: string | null;
      meta_json: string | null;
    } | undefined;
    const highMeta = highRecord?.meta_json
      ? JSON.parse(highRecord.meta_json) as { survey?: { band?: string } }
      : {};
    report(
      "high score without symptoms is tagged important",
      highResponse.ok && highMeta.survey?.band === "high" &&
        highRecord?.priority === "important",
    );

    const moderateRequest = crypto.randomUUID();
    const moderateResponse = await post("/api/register", registration(
      moderateRequest,
      survey({
        age: 55,
        sex: "male",
        height_cm: 170,
        weight_kg: 70,
        waist_cm: 103,
        activity: true,
        fruit_veg: true,
        antihypertensive: false,
        high_glucose: false,
        family_history: "first_degree",
      }),
    ));
    const moderateRecord = database.prepare(
      `SELECT i.priority, i.meta_json
       FROM patients p JOIN intakes i ON i.patient_id = p.id
       WHERE p.request_id = ?`,
    ).get(moderateRequest) as {
      priority: string | null;
      meta_json: string | null;
    } | undefined;
    const moderateMeta = moderateRecord?.meta_json
      ? JSON.parse(moderateRecord.meta_json) as { survey?: { band?: string } }
      : {};
    report(
      "moderate score keeps standard registration priority rules",
      moderateResponse.ok && moderateMeta.survey?.band === "moderate" &&
        moderateRecord?.priority === null,
    );
  } finally {
    database.close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
