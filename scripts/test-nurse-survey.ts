import assert from "node:assert/strict";
import { existsSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import {
  sendNurseSurveyDecisionEmail,
  surveyEmailFailureMessage,
  surveyEmailFailureMessageFromStoredValue,
  SurveyEmailError,
  surveyEmailReady,
} from "../lib/survey-email.ts";
import { ar } from "../lib/strings.ar.ts";

const previousPath = process.env.HACKATHON_DB_PATH;
const databasePath = join(tmpdir(), `nurse-survey-${randomUUID()}.sqlite`);
process.env.HACKATHON_DB_PATH = databasePath;
const emailKeys = ["RESEND_API_KEY", "RESEND_FROM_EMAIL"] as const;
const previousEmailValues = emailKeys.map((key) => process.env[key]);
const originalFetch = globalThis.fetch;

try {
  const legacyDatabase = new Database(databasePath);
  legacyDatabase.exec(`
    CREATE TABLE survey_submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id TEXT NOT NULL UNIQUE,
      full_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      answers_json TEXT NOT NULL,
      metadata_json TEXT NOT NULL,
      whatsapp_consent_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      nurse_decision TEXT,
      nurse_name TEXT,
      nurse_decided_at TEXT,
      whatsapp_status TEXT NOT NULL DEFAULT 'not_sent',
      whatsapp_provider_ref TEXT,
      whatsapp_error TEXT
    );
    INSERT INTO survey_submissions (
      request_id, full_name, phone, answers_json, metadata_json,
      whatsapp_consent_at, created_at
    ) VALUES (
      'legacy-record', 'Legacy Synthetic Patient', '01000000000',
      '{}', '{}', '2026-10-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z'
    );
  `);
  legacyDatabase.close();

  for (const key of emailKeys) delete process.env[key];
  assert.equal(surveyEmailReady(), false, "Email should stay disabled without provider credentials");

  process.env.RESEND_API_KEY = "re_synthetic_test_token";
  process.env.RESEND_FROM_EMAIL = "onboarding@resend.dev";
  assert.equal(surveyEmailReady(), true);

  let requestUrl = "";
  let requestHeaders: HeadersInit | undefined;
  let requestBody = "";
  globalThis.fetch = async (input, init) => {
    requestUrl = String(input);
    requestHeaders = init?.headers;
    requestBody = String(init?.body);
    return new Response(JSON.stringify({ id: "email_synthetic" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  const decidedAt = "2026-10-22T10:00:00.000Z";
  const providerRef = await sendNurseSurveyDecisionEmail({
    email: "demo@example.invalid",
    decision: "no_er_referral",
    submissionId: 12,
    decidedAt,
  });
  assert.equal(providerRef, "email_synthetic");
  assert.equal(requestUrl, "https://api.resend.com/emails");
  assert.equal(new Headers(requestHeaders).get("idempotency-key"), "survey-action-12-2026-10-22T100000000Z");
  assert.deepEqual(JSON.parse(requestBody), {
    from: "onboarding@resend.dev",
    to: ["demo@example.invalid"],
    subject: "تحديث من فريق العيادة",
    text: [
      "نتيجة مراجعة الاستبيان من فريق العيادة",
      "",
      ar.survey.patientActionMessages.no_er_referral,
      "",
      ar.emergencyNotice,
      ar.clinicReviewNote,
      "",
      "هذه الرسالة لا تستبدل التقييم الطبي. إذا لم تكن تتوقع هذه الرسالة، تواصل مع فريق العيادة.",
    ].join("\n"),
  });

  globalThis.fetch = async () => new Response(JSON.stringify({
    statusCode: 403,
    name: "validation_error",
    message: "You can only send testing emails to your own email address. real.patient@example.com",
  }), {
    status: 403,
    headers: { "Content-Type": "application/json" },
  });
  await assert.rejects(
    sendNurseSurveyDecisionEmail({
      email: "real.patient@example.com",
      decision: "no_er_referral",
      submissionId: 12,
      decidedAt,
    }),
    (error: unknown) => {
      assert.ok(error instanceof SurveyEmailError);
      assert.equal(error.code, "recipient_restricted");
      assert.match(error.message, /Verify a domain in Resend/);
      assert.doesNotMatch(error.message, /real\.patient@example\.com/);
      return true;
    },
  );
  assert.match(
    surveyEmailFailureMessage("sender_domain_unverified"),
    /exact domain/,
  );
  assert.match(
    surveyEmailFailureMessageFromStoredValue("recipient_restricted"),
    /test sender can only email your own verified account address/,
  );
  assert.doesNotMatch(
    surveyEmailFailureMessageFromStoredValue("unexpected-provider-data"),
    /unexpected-provider-data/,
  );

  const store = await import("../lib/db.ts");
  const migratedLegacy = store.getSurveySubmission(1);
  assert.equal(migratedLegacy?.full_name, "Legacy Synthetic Patient");
  assert.equal(migratedLegacy?.email, null, "legacy records should not gain an email address");
  assert.equal(migratedLegacy?.email_consent_at, null, "WhatsApp consent must not become email consent");
  assert.equal(migratedLegacy?.email_status, "not_sent");
  assert.equal(store.claimSurveyEmailSend(1), false, "legacy submissions without email consent cannot receive email");
  const submissionId = randomUUID();
  const createdAt = new Date().toISOString();
  const input = {
    request_id: submissionId,
    full_name: "Synthetic Survey Patient",
    email: "demo@example.invalid",
    answers_json: JSON.stringify({
      age: 45,
      sex: "female",
      family_history: null,
      high_glucose: false,
      antihypertensive: false,
      daily_smoking: false,
      daily_fruit_veg: true,
      activity_150_minutes: true,
      waist_cm: 88,
    }),
    metadata_json: "{}",
    email_consent_at: createdAt,
    created_at: createdAt,
  };

  assert.equal(store.insertSurveySubmission(input), true);
  assert.equal(store.insertSurveySubmission(input), false, "request retries must not duplicate submissions");
  const submission = store.listSurveySubmissions()[0];
  assert.ok(submission);
  assert.equal(submission.request_id, submissionId);
  assert.equal(submission.email_status, "not_sent");

  assert.equal(store.saveNurseSurveyDecision({
    id: submission.id,
    decision: "prompt_assessment",
    nurseName: "Synthetic Nurse",
    now: createdAt,
    assessmentConfirmedAt: createdAt,
  }), "saved");
  assert.equal(store.listSurveyDecisionHistory().length, 1);
  assert.equal(store.claimSurveyEmailSend(submission.id), true);
  assert.equal(store.claimSurveyEmailSend(submission.id), false, "concurrent sends must be blocked");
  store.markSurveyEmailFailed(submission.id, "Provider send failed.");
  assert.equal(store.getSurveySubmission(submission.id)?.email_status, "failed");
  assert.equal(store.saveNurseSurveyDecision({
    id: submission.id,
    decision: "urgent_er",
    nurseName: "Synthetic Nurse",
    now: createdAt,
    assessmentConfirmedAt: createdAt,
  }), "saved");
  assert.equal(store.listSurveyDecisionHistory().length, 2, "changed actions must remain auditable");
  assert.equal(store.claimSurveyEmailSend(submission.id), true, "failed sends can be retried");
  store.markSurveyEmailAccepted(submission.id, "email_synthetic");
  assert.equal(store.getSurveySubmission(submission.id)?.email_status, "accepted");
  assert.equal(store.saveNurseSurveyDecision({
    id: submission.id,
    decision: "prompt_assessment",
    nurseName: "Synthetic Nurse",
    now: createdAt,
    assessmentConfirmedAt: createdAt,
  }), "already_sent", "accepted results cannot be silently replaced");
  console.log("PASS  nurse survey persistence, decision audit, and mocked Resend email");
} finally {
  globalThis.fetch = originalFetch;
  emailKeys.forEach((key, index) => {
    const value = previousEmailValues[index];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  });
  if (previousPath === undefined) delete process.env.HACKATHON_DB_PATH;
  else process.env.HACKATHON_DB_PATH = previousPath;
  const store = await import("../lib/db.ts");
  store.default.close();
  for (const suffix of ["", "-wal", "-shm"]) {
    const target = `${databasePath}${suffix}`;
    if (existsSync(target)) unlinkSync(target);
  }
}
