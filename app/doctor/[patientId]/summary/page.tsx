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
import { ar } from "@/lib/strings.ar";

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

function priorityDetails(priority: string | null, copy: typeof ar.doctorCaseSummary | typeof ar.doctorCaseSummary.en): {
  icon: string;
  label: string;
} {
  if (priority === "urgent") return { icon: "▲", label: copy.urgent };
  if (priority === "important") return { icon: "●", label: copy.important };
  if (priority === "normal") return { icon: "○", label: copy.normal };
  return { icon: "?", label: copy.staffDecides };
}

function dateValue(value: string | null, copy: typeof ar.doctorCaseSummary | typeof ar.doctorCaseSummary.en): string {
  return value ?? copy.noDate;
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
  searchParams,
}: {
  params: Promise<{ patientId: string }>;
  searchParams: Promise<{ lang?: string | string[] }>;
}) {
  await requireDoctorSession();
  const [{ patientId: rawPatientId }, query] = await Promise.all([params, searchParams]);
  const locale = query.lang === "en" ? "en" : "ar";
  const isArabic = locale === "ar";
  const copy = isArabic ? ar.doctorCaseSummary : ar.doctorCaseSummary.en;
  const patientId = Number(rawPatientId);
  if (!Number.isSafeInteger(patientId) || patientId < 1) {
    return <main lang={locale} dir={isArabic ? "rtl" : "ltr"}><p>{copy.patientNotFound}</p></main>;
  }

  const doctorRecord = getPatientRecord(patientId);
  if (!doctorRecord) return <main lang={locale} dir={isArabic ? "rtl" : "ltr"}><p>{copy.patientNotFound}</p></main>;
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
  const priority = priorityDetails(suggestedPriority, copy);
  const factsAnswers: [string, string][] = [
    [copy.missedDoses, facts.answers.missed_doses],
    [copy.lowSugarEpisodes, facts.answers.hypoglycemia_episodes],
    [copy.lowSugarSymptoms, facts.answers.hypoglycemia_symptoms],
    [copy.footProblem, facts.answers.foot_problem],
    [copy.visionChange, facts.answers.vision_change],
  ];
  const careGaps = [
    ["HbA1c", facts.care_gaps.hba1c],
    [copy.footExam, facts.care_gaps.foot_exam],
    [copy.bloodPressure, facts.care_gaps.blood_pressure],
  ] as const;
  const currentInconsistencies = summary
    ? storedInconsistencies
    : liveAssessment.inconsistencies;
  const timeGenerated = summary
    ? formatCairoDateTime(summary.created_at)
    : null;

  return (
    <main lang={locale} dir={isArabic ? "rtl" : "ltr"} style={{ maxWidth: 1000, margin: "0 auto", padding: 24, fontFamily: "inherit" }}>
      <header>
        <p><Link href={`/doctor/${patient.id}?lang=${locale}`}>← {copy.back}</Link> · <Link href={`/doctor?lang=${locale}`}>{copy.queue}</Link> · <Link href="#visit-note">{copy.visitNote}</Link> · <Link href="#session-summary">{copy.sessionSummary}</Link></p>
        <h1>{copy.title}: {patient.name}</h1>
        <p><Link href={`/doctor/${patient.id}/session?lang=${locale}`} style={{ display: "inline-block", padding: "12px 16px", borderRadius: 8, background: "var(--primary-strong)", color: "white" }}>{copy.beginSession}</Link></p>
        <p>
          {copy.age}: {patient.age ?? copy.notRecorded} · {copy.diabetes}:{" "}
          {patient.diabetes_type ?? copy.notRecorded}
        </p>
        {summary ? (
          <>
            <p>
              <span style={modeBadgeStyle}>
                {copy.mode}:{" "}
                <strong>
                  {summary.generation_mode === "llm"
                    ? copy.aiGenerated
                    : summary.generation_mode === "mock"
                      ? copy.mock
                      : copy.unavailable}
                </strong>
              </span>
            </p>
            <p>{copy.generated}: {timeGenerated}</p>
          </>
        ) : (
          <p>{copy.noSummary}</p>
        )}
      </header>

      {stale ? (
        <p role="status" style={{ background: "var(--important-bg)", padding: 12 }}>
          {copy.stale}
        </p>
      ) : null}

      <SessionSummarySection patientId={patientId} locale={locale} />

      <section style={sectionStyle}>
        <h2>{copy.priority}</h2>
        <p style={{ fontSize: "1.25rem", fontWeight: 700 }}>
          {priority.icon} {priority.label}
        </p>
        {reasons.length ? (
          <ul>{reasons.map((reason, index) => <li key={`${reason.rule_id}-${index}`}>{reason.text}</li>)}</ul>
        ) : <p>{copy.staffDecides}</p>}
        <p>{copy.priorityDisclaimer} {summary?.rules_version ?? "v1-placeholder"} ({copy.placeholderRules}).</p>
      </section>

      <section style={sectionStyle}>
        <h2>{copy.keyFacts}</h2>
        <h3>{copy.intakeAnswers}</h3>
        <ul>{factsAnswers.map(([label, value]) => <li key={label}>{label}: {value}</li>)}</ul>
        <h3>{copy.careGaps}</h3>
        <ul>
          {careGaps.map(([label, gap]) => (
            <li key={label}>
              {gap.days_since === null
                ? `${label}: ${copy.noDate}`
                : `${label}: ${dateValue(gap.date, copy)} — ${gap.days_since} ${copy.daysSince}; ${gap.overdue ? copy.overdue : copy.notOverdue} (${copy.placeholderThreshold} ${gap.threshold_days})`}
            </li>
          ))}
          <li>
            {copy.nextVisit}: {dateValue(facts.care_gaps.next_visit.date, copy)}
            {facts.care_gaps.next_visit.days_overdue === null
              ? ""
              : ` — ${facts.care_gaps.next_visit.days_overdue} ${copy.daysOverdue}`}
          </li>
        </ul>
      </section>

      <section style={sectionStyle}>
        <h2>{copy.flaggedKeywords}</h2>
        <h3>{copy.ruleMatched}</h3>
        {ruleMatches.length ? (
          <ul>
            {ruleMatches.map((match, index) => (
              <li key={`${match.id}-${match.start}-${index}`}>
                <strong>{displayedText.slice(match.start, match.end)}</strong>
                {" — "}{match.tier}, {match.category}
                {match.negation_nearby
                  ? ` — ${copy.negationNearby}`
                  : ""}
              </li>
            ))}
          </ul>
        ) : <p>{copy.noRuleMatches}</p>}
        <h3>{copy.verifiedHighlights}</h3>
        {aiFlags.length ? (
          <p>{aiFlags.map((flag, index) => (
            <span key={`${flag.quote}-${index}`} style={chipStyle}>
              {flag.quote} ({flag.category})
            </span>
          ))}</p>
          ) : <p>{copy.noHighlights}</p>}
      </section>

      <section style={sectionStyle}>
        <h2>{copy.mentionedValues}</h2>
        {values.length ? (
          <ul>{values.map((value, index) => <li key={`${value.quote}-${index}`}><q>{value.quote}</q> — {value.meaning}</li>)}</ul>
        ) : <p>{copy.noValues}</p>}
      </section>

      <section style={sectionStyle}>
        <h2>{copy.inconsistencies}</h2>
        {currentInconsistencies.length ? (
          <ul>{currentInconsistencies.map((item, index) => (
            <li key={`${item.description}-${index}`}>
              {item.description}
              {item.quotes.length ? <ul>{item.quotes.map((quote, quoteIndex) => <li key={`${quote}-${quoteIndex}`}><q>{quote}</q></li>)}</ul> : null}
            </li>
          ))}</ul>
        ) : <p>{copy.noInconsistencies}</p>}
      </section>

      <section style={sectionStyle}>
        <h2>{copy.originalText}</h2>
        <p><mark className="rule-highlight">{copy.ruleHighlighted}</mark>{" "}<mark className="ai-highlight">{copy.aiHighlighted}</mark></p>
        {displayedText.includes("[غير واضح]") ? <p role="status">{copy.unclear}</p> : null}
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
        ) : <p>{copy.noFreeText}</p>}
      </section>

      <section style={sectionStyle}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <h2 style={{ marginBlock: "0.5rem" }}>{copy.aiSummary}</h2>
          <SummaryGenerateButton patientId={patient.id} hasIntake={Boolean(intake)} hasSummary={Boolean(summary)} locale={locale} />
        </div>
        {summary?.generation_mode === "fallback" ? (
          <p>{copy.summaryUnavailable}</p>
        ) : summary?.summary_text ? (
          <p>{summary.summary_text}</p>
        ) : summary?.generation_mode === "mock" ? (
          <p>{summary.summary_text ?? "MOCK summary unavailable."}</p>
        ) : (
          <p>{copy.generateNarrative}</p>
        )}
      </section>

      {intake ? (
      <CaseSummaryNote patient={doctorRecord.patient} intake={intake} locale={locale} />
      ) : null}

      <VisitNoteSection
        key={`${patientId}:${visitNotes[0]?.id ?? "empty"}`}
        patientId={patientId}
        locale={locale}
        initialNotes={visitNotes}
        geminiAvailable={Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY)}
        queueContext={intake ? { status: intake.status, priority: intake.priority } : null}
      />

      <section style={sectionStyle}>
        <h2>{copy.summaryHistory}</h2>
        {history.length ? (
          <ul>{history.map((item) => (
            <li key={item.id}>
              {formatCairoDateTime(item.created_at)} — {item.generation_mode} —{" "}
              {priorityDetails(item.suggested_priority, copy).label}
            </li>
          ))}</ul>
        ) : <p>{copy.noHistory}</p>}
      </section>

      <footer style={sectionStyle}>
        {copy.staffOnly}
      </footer>
      {/* TODO: Add a read-only suggestion panel to /triage/[patientId] only if that route is introduced. */}
    </main>
  );
}

const sectionStyle = {
  border: "1px solid var(--card-border)",
  borderRadius: "var(--radius-card)",
  marginBlock: 16,
  padding: 16,
};
const chipStyle = {
  display: "inline-block",
  border: "1px solid var(--control-border)",
  borderRadius: "var(--radius-pill)",
  margin: 4,
  padding: "4px 10px",
};
const modeBadgeStyle = {
  display: "inline-block",
  border: "1px solid var(--primary)",
  borderRadius: "var(--radius-pill)",
  padding: "6px 12px",
};
