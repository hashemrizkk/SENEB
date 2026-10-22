import Link from "next/link";
import { z } from "zod";
import { requireDoctorSession } from "@/lib/doctor-review";
import {
  caseSummaryHistory,
  getIntakeById,
  getPatientRecord,
  getVisitNotes,
  latestCaseSummary,
  default as db,
} from "@/lib/db";
import { caseFactsSchema, buildFacts } from "@/lib/case-facts";
import { intakeFieldsSchema, intakeMetaSchema, type IntakeFields } from "@/lib/intake";
import { assessIntake } from "@/lib/case-assessment";
import { cairoDate, formatCairoDateTime } from "@/lib/date-time";
import { findAllOccurrences, highlightSegments } from "@/lib/text-normalize";
import SummaryGenerateButton from "../SummaryGenerateButton";
import CaseSummaryNote from "./CaseSummaryNote";
import VisitNoteSection from "@/components/VisitNoteSection";
import SessionSummarySection from "@/components/SessionSummarySection";

export const dynamic = "force-dynamic";

const lexiconMatchSchema = z.object({
  id: z.string(),
  tier: z.enum(["critical", "warning"]),
  category: z.string(),
  term: z.string(),
  start: z.number().int(),
  end: z.number().int(),
  negation_nearby: z.boolean(),
});
const aiFlagSchema = z.object({
  quote: z.string(),
  category: z.string(),
});
const valueSchema = z.object({
  quote: z.string(),
  meaning: z.string(),
});
const inconsistencySchema = z.object({
  description: z.string(),
  quotes: z.array(z.string()),
});
const reasonSchema = z.object({
  rule_id: z.string(),
  text: z.string(),
});
const prioritySchema = z.enum(["urgent", "important", "normal"]).nullable();

function parseStored<T>(
  value: string | null,
  schema: z.ZodType<T>,
  label: string,
  fallback: T,
): T {
  if (value === null) return fallback;
  let decoded: unknown;
  try {
    decoded = JSON.parse(value) as unknown;
  } catch {
    throw new Error(`Stored ${label} is not valid JSON.`);
  }
  const parsed = schema.safeParse(decoded);
  if (!parsed.success) throw new Error(`Stored ${label} is invalid.`);
  return parsed.data;
}

function priorityDetails(priority: string | null): {
  icon: string;
  label: string;
} {
  if (priority === "urgent") return { icon: "▲", label: "Urgent" };
  if (priority === "important") return { icon: "●", label: "Important" };
  if (priority === "normal") return { icon: "○", label: "Normal" };
  return { icon: "?", label: "Not enough information, staff must decide" };
}

function dateValue(value: string | null): string {
  return value ?? "no date on file";
}

function answerFields(fields: IntakeFields) {
  return {
    missed_doses: fields.missed_doses,
    hypoglycemia_episodes: fields.hypoglycemia_episodes,
    hypoglycemia_symptoms: fields.hypoglycemia_symptoms,
    foot_problem: fields.foot_problem,
    vision_change: fields.vision_change,
  };
}

export default async function DoctorCasePage({
  params,
}: {
  params: Promise<{ patientId: string }>;
}) {
  await requireDoctorSession();
  const { patientId: rawPatientId } = await params;
  const patientId = Number(rawPatientId);
  if (!Number.isSafeInteger(patientId) || patientId < 1) {
    return <main><p>patient not found</p></main>;
  }

  const doctorRecord = getPatientRecord(patientId);
  if (!doctorRecord) return <main><p>patient not found</p></main>;
  const patient = doctorRecord.patient;
  const intake = doctorRecord.latestIntake;
  const visitNotes = getVisitNotes(db, patientId, 5);
  const summary = latestCaseSummary(patientId);
  const summaryIntake = summary ? getIntakeById(summary.intake_id) : undefined;
  const parsedFields = intake
    ? intakeFieldsSchema.safeParse(
        intake.structured_json ? JSON.parse(intake.structured_json) : null,
      )
    : null;
  const fields =
    parsedFields?.success
      ? parsedFields.data
      : {
          missed_doses: null,
          hypoglycemia_episodes: null,
          hypoglycemia_symptoms: null,
          foot_problem: null,
          vision_change: null,
          emergency_symptoms_mentioned: null,
          symptoms_text: null,
        };
  let needsReview = true;
  if (intake?.meta_json) {
    const parsedMeta = intakeMetaSchema.safeParse(JSON.parse(intake.meta_json));
    needsReview = !parsedMeta.success || parsedMeta.data.needs_review;
  }
  const liveAssessment = assessIntake({
    fields,
    rawText: intake?.raw_text ?? null,
    hasIntake: Boolean(intake),
    needsReview,
  });
  const now = new Date(`${cairoDate(new Date())}T00:00:00.000Z`);
  const liveFacts = buildFacts(patient, answerFields(fields), now);

  const history = caseSummaryHistory(patientId, 5);
  const stale = Boolean(
    summary && intake && intake.id > summary.intake_id,
  );
  const facts = summary
    ? parseStored(summary.facts_json, caseFactsSchema, "summary facts", liveFacts)
    : liveFacts;
  const ruleMatches = summary
    ? parseStored(
        summary.rule_flags_json,
        z.array(lexiconMatchSchema),
        "rule-matched keywords",
        [],
      )
    : liveAssessment.lexiconMatches;
  const aiFlags = parseStored(
    summary?.ai_flags_json ?? null,
    z.array(aiFlagSchema),
    "AI highlights",
    [],
  );
  const values = parseStored(
    summary?.values_json ?? null,
    z.array(valueSchema),
    "mentioned values",
    [],
  );
  const storedInconsistencies = parseStored(
    summary?.inconsistencies_json ?? null,
    z.array(inconsistencySchema),
    "inconsistencies",
    [],
  );
  const reasons = summary
    ? parseStored(
        summary.priority_reasons_json,
        z.array(reasonSchema),
        "priority reasons",
        [],
      )
    : liveAssessment.suggestion.reasons;
  const suggestedPriority = summary
    ? prioritySchema.parse(summary.suggested_priority)
    : liveAssessment.suggestion.priority;
  const displayedText = summary
    ? summaryIntake?.raw_text ?? ""
    : intake?.raw_text ?? "";
  const textMatches = [
    ...ruleMatches.map((match) => ({
      start: match.start,
      end: match.end,
      kind: "rule",
    })),
    ...aiFlags.flatMap((flag) =>
      findAllOccurrences(displayedText, flag.quote).map((match) => ({
        ...match,
        kind: "ai",
      })),
    ),
  ];
  const segments = highlightSegments(displayedText, textMatches);
  const priority = priorityDetails(suggestedPriority);
  const factsAnswers: [string, string][] = [
    ["Missed medication doses", facts.answers.missed_doses],
    ["Low-sugar episodes", facts.answers.hypoglycemia_episodes],
    ["Low-sugar symptoms", facts.answers.hypoglycemia_symptoms],
    ["Foot problem", facts.answers.foot_problem],
    ["Vision change", facts.answers.vision_change],
  ];
  const careGaps = [
    ["HbA1c", facts.care_gaps.hba1c],
    ["Foot exam", facts.care_gaps.foot_exam],
    ["Blood pressure", facts.care_gaps.blood_pressure],
  ] as const;
  const currentInconsistencies = summary
    ? storedInconsistencies
    : liveAssessment.inconsistencies;
  const timeGenerated = summary
    ? formatCairoDateTime(summary.created_at)
    : null;

  return (
    <main style={{ maxWidth: 1000, margin: "0 auto", padding: 24, fontFamily: "inherit" }}>
      <header>
        <p><Link href={`/doctor/${patient.id}`}>← Intake review</Link> · <Link href="/doctor">Queue</Link> · <Link href="#visit-note">Visit note</Link> · <Link href="#session-summary">Session summary</Link></p>
        <h1>Case summary: {patient.name}</h1>
        <p><Link href={`/doctor/${patient.id}/session`} style={{ display: "inline-block", padding: "12px 16px", borderRadius: 8, background: "var(--primary-strong)", color: "white" }}>Begin session</Link></p>
        <p>
          Age: {patient.age ?? "Not recorded"} · Diabetes type:{" "}
          {patient.diabetes_type ?? "Not recorded"}
        </p>
        {summary ? (
          <>
            <p>
              <span style={modeBadgeStyle}>
                Mode:{" "}
                <strong>
                  {summary.generation_mode === "llm"
                    ? "AI-generated"
                    : summary.generation_mode === "mock"
                      ? "MOCK: not real AI"
                      : "AI unavailable: code-only facts"}
                </strong>
              </span>
            </p>
            <p>Generated: {timeGenerated}</p>
          </>
        ) : (
          <p>No case summary generated yet.</p>
        )}
        <SummaryGenerateButton
          patientId={patient.id}
          hasIntake={Boolean(intake)}
          hasSummary={Boolean(summary)}
        />
      </header>

      {stale ? (
        <p role="status" style={{ background: "var(--important-bg)", padding: 12 }}>
          A newer intake exists. Regenerate.
        </p>
      ) : null}

      <SessionSummarySection patientId={patientId} />

      <section style={sectionStyle}>
        <h2>Suggested priority (fixed rules, not a medical decision)</h2>
        <p style={{ fontSize: "1.25rem", fontWeight: 700 }}>
          {priority.icon} {priority.label}
        </p>
        {reasons.length ? (
          <ul>{reasons.map((reason, index) => <li key={`${reason.rule_id}-${index}`}>{reason.text}</li>)}</ul>
        ) : <p>Not enough information, staff must decide.</p>}
        <p>Staff decide the priority. Rules version: {summary?.rules_version ?? "v1-placeholder"} (placeholder rules).</p>
      </section>

      <section style={sectionStyle}>
        <h2>Key facts</h2>
        <h3>Intake answers</h3>
        <ul>{factsAnswers.map(([label, value]) => <li key={label}>{label}: {value}</li>)}</ul>
        <h3>Care gaps</h3>
        <ul>
          {careGaps.map(([label, gap]) => (
            <li key={label}>
              {gap.days_since === null
                ? `${label}: no date on file`
                : `${label}: ${dateValue(gap.date)} — ${gap.days_since} day(s) since; ${gap.overdue ? "overdue" : "not overdue"} (placeholder threshold ${gap.threshold_days} days)`}
            </li>
          ))}
          <li>
            Next visit: {dateValue(facts.care_gaps.next_visit.date)}
            {facts.care_gaps.next_visit.days_overdue === null
              ? ""
              : ` — ${facts.care_gaps.next_visit.days_overdue} day(s) overdue`}
          </li>
        </ul>
      </section>

      <section style={sectionStyle}>
        <h2>Flagged keywords</h2>
        <h3>Rule-matched (used for the suggestion)</h3>
        {ruleMatches.length ? (
          <ul>
            {ruleMatches.map((match, index) => (
              <li key={`${match.id}-${match.start}-${index}`}>
                <strong>{displayedText.slice(match.start, match.end)}</strong>
                {" — "}{match.tier}, {match.category}
                {match.negation_nearby
                  ? " — negation word nearby: read the original text"
                  : ""}
              </li>
            ))}
          </ul>
        ) : <p>No rule-matched keywords.</p>}
        <h3>Verified highlights (display only, not used for priority)</h3>
        {aiFlags.length ? (
          <p>{aiFlags.map((flag, index) => (
            <span key={`${flag.quote}-${index}`} style={chipStyle}>
              {flag.quote} ({flag.category})
            </span>
          ))}</p>
        ) : <p>No verified highlights.</p>}
      </section>

      <section style={sectionStyle}>
        <h2>Values mentioned in the patient&apos;s text</h2>
        {values.length ? (
          <ul>{values.map((value, index) => <li key={`${value.quote}-${index}`}><q>{value.quote}</q> — {value.meaning}</li>)}</ul>
        ) : <p>No verified values mentioned.</p>}
      </section>

      <section style={sectionStyle}>
        <h2>Possible inconsistencies</h2>
        {currentInconsistencies.length ? (
          <ul>{currentInconsistencies.map((item, index) => (
            <li key={`${item.description}-${index}`}>
              {item.description}
              {item.quotes.length ? <ul>{item.quotes.map((quote, quoteIndex) => <li key={`${quote}-${quoteIndex}`}><q>{quote}</q></li>)}</ul> : null}
            </li>
          ))}</ul>
        ) : <p>No possible inconsistencies detected.</p>}
      </section>

      <section style={sectionStyle}>
        <h2>Patient&apos;s original text</h2>
        <p><mark className="rule-highlight">Rule-matched</mark>{" "}<mark className="ai-highlight">AI-highlighted</mark></p>
        {displayedText.includes("[غير واضح]") ? <p role="status"><strong>Possibly misheard:</strong> the transcript contains [غير واضح]. Check the original audio with the patient before relying on that part.</p> : null}
        {displayedText ? (
          <pre dir="auto" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
            {segments.map((segment, index) =>
              segment.highlighted ? (
                <mark
                  key={index}
                  className={[
                    segment.kinds.includes("rule") ? "rule-highlight" : "",
                    segment.kinds.includes("ai") ? "ai-highlight" : "",
                  ].filter(Boolean).join(" ")}
                >
                  {segment.text}
                </mark>
              ) : <span key={index}>{segment.text}</span>,
            )}
          </pre>
        ) : <p>No free text</p>}
      </section>

      <section style={sectionStyle}>
        <h2>AI summary: verify against the patient&apos;s original text</h2>
        {summary?.generation_mode === "fallback" ? (
          <p>AI summary unavailable</p>
        ) : summary?.summary_text ? (
          <p>{summary.summary_text}</p>
        ) : summary?.generation_mode === "mock" ? (
          <p>{summary.summary_text ?? "MOCK summary unavailable."}</p>
        ) : (
          <p>Generate a summary to see the narrative.</p>
        )}
      </section>

      {intake ? (
        <CaseSummaryNote patient={doctorRecord.patient} intake={intake} />
      ) : null}

      <VisitNoteSection
        key={`${patientId}:${visitNotes[0]?.id ?? "empty"}`}
        patientId={patientId}
        initialNotes={visitNotes}
        geminiAvailable={Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY)}
        queueContext={intake ? { status: intake.status, priority: intake.priority } : null}
      />

      <section style={sectionStyle}>
        <h2>Summary history</h2>
        {history.length ? (
          <ul>{history.map((item) => (
            <li key={item.id}>
              {formatCairoDateTime(item.created_at)} — {item.generation_mode} —{" "}
              {priorityDetails(item.suggested_priority).label}
            </li>
          ))}</ul>
        ) : <p>No summary history.</p>}
      </section>

      <footer style={sectionStyle}>
        Staff-only demo. Do not use with real patient data.
      </footer>
      {/* TODO: Add a read-only suggestion panel to /triage/[patientId] only if that route is introduced. */}
    </main>
  );
}

const sectionStyle = {
  border: "1px solid var(--card-border)",
  borderRadius: 12,
  marginBlock: 16,
  padding: 16,
};
const chipStyle = {
  display: "inline-block",
  border: "1px solid #9ca3af",
  borderRadius: 999,
  margin: 4,
  padding: "4px 10px",
};
const modeBadgeStyle = {
  display: "inline-block",
  border: "1px solid #6b7280",
  borderRadius: 999,
  padding: "6px 12px",
};
