import { requireNurseSession } from "@/lib/nurse-auth";
import { listSurveyDecisionHistory, listSurveySubmissions } from "@/lib/db";
import { ausdriskAnswersSchema, type AusdriskItem } from "@/lib/survey/ausdrisk";
import {
  surveyEmailFailureMessageFromStoredValue,
  surveyEmailReady,
} from "@/lib/survey-email";
import { nurseSurveyDecisionLabels, type NurseSurveyDecision } from "@/lib/survey/nurse-actions";
import { ar } from "@/lib/strings.ar";
import NurseQueueRefresh from "./NurseQueueRefresh";
import NurseSurveyDecisionForm from "./NurseSurveyDecisionForm";

export const dynamic = "force-dynamic";

const SURVEY_ITEMS: readonly AusdriskItem[] = [
  "age",
  "sex",
  "family_history",
  "high_glucose",
  "antihypertensive",
  "daily_smoking",
  "daily_fruit_veg",
  "activity_150_minutes",
  "waist_cm",
];

function readAnswers(json: string) {
  const parsed = ausdriskAnswersSchema.safeParse(JSON.parse(json));
  if (!parsed.success) throw new Error("Stored nurse survey answers are invalid.");
  return parsed.data;
}

function answerLabel(item: AusdriskItem): string {
  return ar.survey.questions.find((question) => question.item === item)?.question ?? item;
}

function displayAnswer(item: AusdriskItem, value: boolean | number | string | null): string {
  if (value === null) return ar.survey.dontKnow;
  if (item === "sex") return value === "male" ? ar.survey.male : ar.survey.female;
  if (item === "waist_cm") return `${value} cm`;
  if (typeof value === "boolean") return value ? ar.survey.yes : ar.survey.no;
  return String(value);
}

export default async function NursePage() {
  const session = await requireNurseSession();
  const submissions = listSurveySubmissions();
  const decisionHistory = listSurveyDecisionHistory();
  const historyBySubmission = new Map<number, typeof decisionHistory>();
  for (const entry of decisionHistory) {
    const entries = historyBySubmission.get(entry.submission_id) ?? [];
    entries.push(entry);
    historyBySubmission.set(entry.submission_id, entries);
  }
  const emailReady = surveyEmailReady();

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: 24, fontFamily: "inherit" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
        <div>
          <h1>Nurse survey review queue</h1>
          <p>Signed in as {session.name}. These are patient-submitted screening answers, not an ER triage score.</p>
        </div>
        <form action="/api/nurse/logout" method="post">
          <button type="submit">Sign out</button>
        </form>
      </header>
      <p style={{ padding: 12, border: "1px solid #d99191", background: "#fff0f0" }}>
        AUSDRISK screens diabetes risk and contains no acute-symptom assessment. Do not use these answers alone to decide ER need.
        The prototype supplies no emergency protocol. Record an action only after a separate assessment using your clinic’s approved process.
        “No ER referral” does not rule out an emergency.
      </p>
      {!emailReady ? (
        <p role="status">
          Email sending is disabled until the Resend API key and sender address are configured.
        </p>
      ) : null}
      <NurseQueueRefresh />
      {submissions.length === 0 ? <p>No survey submissions yet.</p> : null}
      <div style={{ display: "grid", gap: 16 }}>
        {submissions.map((submission) => {
          const answers = readAnswers(submission.answers_json);
          const decision: NurseSurveyDecision | null = submission.nurse_decision;
          return (
            <article key={submission.id} style={{ border: "1px solid var(--card-border)", borderRadius: 12, padding: 16 }}>
              <h2>{submission.full_name}</h2>
              <p>Submitted: {submission.created_at}</p>
              <p>Email (consented): <bdi dir="ltr">{submission.email ?? "Not collected"}</bdi></p>
              <p>Email consent recorded: {submission.email_consent_at ?? "Not recorded"}</p>
              <h3>AUSDRISK answers — not an emergency decision tool</h3>
              <dl>
                {SURVEY_ITEMS.map((item) => (
                  <div key={item} style={{ marginBlock: 8 }}>
                    <dt><strong>{answerLabel(item)}</strong></dt>
                    <dd>{displayAnswer(item, answers[item])}</dd>
                  </div>
                ))}
              </dl>
              {decision ? (
                <p>
                  Last decision: {nurseSurveyDecisionLabels[decision]} by {submission.nurse_name} at {submission.nurse_decided_at}.
                </p>
              ) : <p>No nurse decision recorded yet.</p>}
              {historyBySubmission.get(submission.id)?.length ? (
                <details>
                  <summary>Decision history</summary>
                  <ul>
                    {historyBySubmission.get(submission.id)?.map((entry) => (
                      <li key={entry.id}>
                        {nurseSurveyDecisionLabels[entry.decision]} — {entry.nurse_name} — {entry.decided_at}
                        {entry.assessment_confirmed_at
                          ? ` (separate assessment confirmed at ${entry.assessment_confirmed_at})`
                          : " (separate assessment confirmation not recorded)"}
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
              <p>Email status: {submission.email_status}</p>
              {submission.email_error ? (
                <p role="status">
                  Last email issue: {surveyEmailFailureMessageFromStoredValue(submission.email_error)}
                </p>
              ) : null}
              <NurseSurveyDecisionForm
                submissionId={submission.id}
                initialDecision={decision}
                initialStatus={submission.email_status}
                emailReady={emailReady && submission.email !== null}
              />
            </article>
          );
        })}
      </div>
    </main>
  );
}
