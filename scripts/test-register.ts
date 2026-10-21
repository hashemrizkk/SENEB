// Usage:  npm run dev   (terminal 1)   →   npm run test:register   (terminal 2)
//
// Calls the real POST /api/register over HTTP. Node's --experimental-strip-types
// cannot resolve the "@/" tsconfig alias, so importing the route module directly
// is not possible; HTTP is the only faithful way to test it.

import Database from "better-sqlite3";

const BASE_URL = process.env.TEST_BASE_URL ?? "http://localhost:3000";
const ORIGIN = new URL(BASE_URL).origin;
const ENDPOINT = `${BASE_URL}/api/register`;

let failures = 0;

function report(name: string, pass: boolean, detail = ""): void {
  if (!pass) failures += 1;
  const suffix = detail ? `  (${detail})` : "";
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${suffix}`);
}

function base(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    full_name: "محمود أحمد",
    phone: "01012345678",
    email: "test@example.com",
    self_description: "عطشان طول الوقت وبحس بتعب",
    answers: {
      missed_doses: null,
      hypo_episodes: null,
      foot_problem: null,
      vision_change: null,
    },
    notes: "",
    consent: true,
    website: "",
    request_id: crypto.randomUUID(),
    ...overrides,
  };
}

type Payload = {
  ok?: boolean;
  reference_code?: string;
  error?: string;
  intake_id?: number;
};

type Result = { status: number; json: Payload };

function readPayload(value: unknown): Payload {
  if (value === null || typeof value !== "object") return {};
  const data = value as Record<string, unknown>;
  return {
    ok: data.ok === true,
    reference_code:
      typeof data.reference_code === "string" ? data.reference_code : undefined,
    error: typeof data.error === "string" ? data.error : undefined,
    intake_id:
      typeof data.intake_id === "number" ? data.intake_id : undefined,
  };
}

async function post(body: unknown, origin = ORIGIN): Promise<Result> {
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify(body),
  });
  const json = readPayload(await response.json().catch(() => null));
  return { status: response.status, json };
}

async function main(): Promise<void> {
  try {
    await fetch(`${BASE_URL}/api/health`);
  } catch {
    console.error(`\nCannot reach ${BASE_URL}. Start the app first:\n  npm run dev\n`);
    process.exit(1);
  }

  const ok = await post(base());
  report(
    "valid full submission",
    ok.status === 200 && ok.json?.ok === true && typeof ok.json?.reference_code === "string",
    `status ${ok.status}, code ${ok.json?.reference_code ?? "none"}`,
  );

  const arabicIndic = await post(base({ phone: "٠١٠١٢٣٤٥٦٧٨" }));
  report(
    "Arabic-Indic phone digits",
    arabicIndic.status === 200 && arabicIndic.json?.ok === true,
    `status ${arabicIndic.status}`,
  );

  const plus20 = await post(base({ phone: "+20 10 1234 5678" }));
  report(
    '"+20 10..." phone',
    plus20.status === 200 && plus20.json?.ok === true,
    `status ${plus20.status}`,
  );

  const badPhone = await post(base({ phone: "12345" }));
  report(
    "invalid phone rejected",
    badPhone.status === 400 && badPhone.json?.ok === false,
    `status ${badPhone.status}`,
  );

  const noConsent = await post(base({ consent: false }));
  report("missing consent rejected", noConsent.status === 400, `status ${noConsent.status}`);

  const noName = await post(base({ full_name: "   " }));
  report("empty name rejected", noName.status === 400, `status ${noName.status}`);

  const badEmail = await post(base({ email: "not-an-email" }));
  report("invalid email rejected", badEmail.status === 400, `status ${badEmail.status}`);

  const honeypot = await post(base({ website: "http://spam.example" }));
  report(
    "honeypot filled → silent ok, no code",
    honeypot.status === 200 && honeypot.json?.ok === true && !honeypot.json?.reference_code,
    `status ${honeypot.status}`,
  );

  const requestId = crypto.randomUUID();
  const first = await post(base({ request_id: requestId }));
  const second = await post(base({ request_id: requestId }));
  report(
    "repeated request_id returns same code",
    first.json?.reference_code != null &&
      first.json?.reference_code === second.json?.reference_code,
    `${first.json?.reference_code} vs ${second.json?.reference_code}`,
  );

  const database = new Database("hackathon.db", { readonly: true });
  const savedRegistration = database
    .prepare<[string], { count: number; patient_id: number | null }>(
      "SELECT COUNT(*) AS count, MIN(id) AS patient_id FROM patients WHERE request_id = ?",
    )
    .get(requestId);
  const savedRegistrationIntakes = savedRegistration?.patient_id
    ? database
        .prepare<[number], { count: number }>(
          "SELECT COUNT(*) AS count FROM intakes WHERE patient_id = ?",
        )
        .get(savedRegistration.patient_id)?.count
    : 0;
  report(
    "registration creates one patient and one intake",
    savedRegistration?.count === 1 && savedRegistrationIntakes === 1,
  );

  const baseIntake = {
    patient_id: 1,
    tap_missed_doses: null,
    tap_hypo_episodes: 0,
    tap_foot_problem: null,
    tap_vision_change: null,
    free_text: null,
    input_method: "tap",
    red_flags: ["client-controlled"],
    unanswered: [],
  };
  const zeroIntake = await postIntake(baseIntake);
  const zeroFields = zeroIntake.json.intake_id
    ? database
        .prepare<[number], { structured_json: string; red_flags_json: string }>(
          "SELECT structured_json, red_flags_json FROM intakes WHERE id = ?",
        )
        .get(zeroIntake.json.intake_id)
    : undefined;
  const zeroData = zeroFields
    ? JSON.parse(zeroFields.structured_json) as Record<string, unknown>
    : {};
  const zeroFlags = zeroFields
    ? JSON.parse(zeroFields.red_flags_json) as { flags?: string[]; unanswered?: string[] }
    : {};
  report(
    "unanswered values remain null and a tapped zero is retained",
    zeroIntake.status === 200 &&
      zeroData.hypoglycemia_episodes === 0 &&
      zeroData.missed_doses === null,
  );
  report(
    "red flags and unanswered values come from server rules",
    !zeroFlags.flags?.includes("client-controlled") &&
      zeroFlags.unanswered?.includes("missed_doses") === true,
  );

  const threeOrMore = await postIntake({
    ...baseIntake,
    tap_hypo_episodes: 3,
  });
  const threeFields = threeOrMore.json.intake_id
    ? database
        .prepare<[number], { structured_json: string }>(
          "SELECT structured_json FROM intakes WHERE id = ?",
        )
        .get(threeOrMore.json.intake_id)
    : undefined;
  const threeData = threeFields
    ? JSON.parse(threeFields.structured_json) as Record<string, unknown>
    : {};
  report(
    '"3 or more" is saved as 3',
    threeOrMore.status === 200 && threeData.hypoglycemia_episodes === 3,
  );

  const invalidPatient = await postIntake({ ...baseIntake, patient_id: 999_999 });
  report("unknown patient id is rejected", invalidPatient.status === 404);
  database.close();

  const longNotes = await post(base({ notes: "ا".repeat(600) }));
  report(
    "600-character notes rejected",
    longNotes.status === 400,
    `status ${longNotes.status}`,
  );

  const badOrigin = await post(base(), "http://evil.example");
  report("wrong Origin rejected", badOrigin.status === 403, `status ${badOrigin.status}`);

  console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

async function postIntake(body: unknown): Promise<Result> {
  const response = await fetch(`${BASE_URL}/api/intake`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN },
    body: JSON.stringify(body),
  });
  return {
    status: response.status,
    json: readPayload(await response.json().catch(() => null)),
  };
}

main();