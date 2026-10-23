import Link from "next/link";
import { getSessionRecordList } from "@/lib/db";
import { formatCairoDateTime } from "@/lib/date-time";
import SessionTranscriptToggle from "@/components/SessionTranscriptToggle";
import { ar } from "@/lib/strings.ar";
type Point = { text: string; origin?: string; category?: string; speaker_role?: string; assertion?: string; quotes?: string[] };
const assertionLabels: Record<string, string> = { present: "Present", negated: "Denied", uncertain: "Uncertain", hypothetical: "Hypothetical", history: "Past", other_person: "Someone else's", other: "Other" };
export default function SessionSummarySection({ patientId, locale }: { patientId: number; locale: "ar" | "en" }) {
  const copy = locale === "ar" ? ar.doctorCaseSummary : ar.doctorCaseSummary.en;
  const records = getSessionRecordList(patientId);
  const approved = records.filter((row) => row.summary_status === "approved");
  const drafts = records.filter((row) => ["recording","review_roles","summarizing","draft"].includes(String(row.status)));
  const history = records.filter((row) => row.summary_status === "superseded");
  const resumeHref = drafts[0] ? `/doctor/${patientId}/session?resume=${drafts[0].id}&lang=${locale}` : `/doctor/${patientId}/session?lang=${locale}`;
  return <section id="session-summary" lang={locale} dir={locale === "ar" ? "rtl" : "ltr"} style={{ border: "1px solid var(--card-border)", borderRadius: "var(--radius-card)", marginBlock: 16, padding: 16, background: "var(--surface)", boxShadow: "var(--shadow-soft)" }}>
    <h2>{copy.sessionSummary}</h2>
    <p><Link href={resumeHref} style={{ display: "inline-block", padding: "12px 16px", borderRadius: "var(--radius-control)", background: "var(--primary-strong)", color: "white" }}>{copy.resumeSession}</Link></p>
    {drafts.length > 0 && <section aria-label={copy.drafts}><h3>{copy.drafts}</h3>{drafts.map((row) => <p key={`${row.id}-${row.summary_id}`}><span style={{ border: "1px solid var(--important-border)", background: "var(--important-bg)", color: "var(--important-text)", padding: 4, borderRadius: 6 }}>{copy.draftLabel}</span> {row.abandoned ? copy.abandoned : (copy.sessionStatuses[String(row.status) as keyof typeof copy.sessionStatuses] ?? String(row.status))} · {formatCairoDateTime(String(row.created_at))} · <Link href={`/doctor/${patientId}/session?resume=${row.id}&lang=${locale}`}>{copy.resumeSession}</Link></p>)}</section>}
    {approved.length === 0 ? <p>{copy.noApproved}</p> : approved.map((row) => {
      let points: Point[] = []; try { points = JSON.parse(String(row.final_points_json ?? "[]")) as Point[]; } catch { /* invalid stored data is not rendered */ }
      return <article key={`${row.id}-${row.summary_id}`} style={{ borderTop: "1px solid var(--card-border)", paddingBlock: 12 }}>
        <h3>{formatCairoDateTime(String(row.approved_at ?? row.created_at))}</h3>
        <p>{copy.approvedBy} {String(row.created_by_name)} · {Number(row.duration_seconds ?? 0)} {copy.seconds} · {row.input_method === "pasted" ? copy.pastedTranscript : copy.voiceRecording}</p>
        <ul>{points.map((point, index) => <li key={index}><strong>{point.category ?? "other"} · {point.speaker_role ?? "unattributed"}</strong>: {point.text} {/[0-9٠-٩۰-۹]/.test(point.text) && <strong>number as heard: verify</strong>} <small>({point.origin ?? "ai"})</small>{point.quotes?.length ? <details><summary>Show source</summary>{point.quotes.map((quote, quoteIndex) => <blockquote key={quoteIndex} dir="auto">{quote}</blockquote>)}</details> : null}</li>)}</ul>
        {typeof row.key_terms_json === "string" && <p>Key terms: {JSON.parse(row.key_terms_json).map((item: { quote: string; assertion: string }, index: number) => <span key={index} style={{ border: "1px dotted var(--primary)", borderRadius: "var(--radius-pill)", padding: "3px 8px", marginInline: 4 }}>{item.quote} · {assertionLabels[item.assertion] ?? "Other"}</span>)}</p>}
        {typeof row.key_values_json === "string" && <p>Key values: {JSON.parse(row.key_values_json).map((item: { quote: string; parts: { number: string; unit: string | null }[] }, index: number) => <span key={index} style={{ border: "1px solid var(--control-border)", borderRadius: "var(--radius-pill)", padding: "3px 8px", marginInline: 4 }}>{item.quote} · {item.parts.map((part) => `${part.number} ${part.unit ?? "unit not stated"}`).join(", ")} · verify</span>)}</p>}
        {typeof row.unclear_json === "string" && JSON.parse(row.unclear_json).length > 0 && <p><strong>Possibly misheard:</strong> {JSON.parse(row.unclear_json).map((item: { quote: string }, index: number) => <span key={index}>{item.quote} </span>)}</p>}
        {typeof row.inconsistencies_json === "string" && JSON.parse(row.inconsistencies_json).length > 0 && <section><h4>Possible inconsistencies</h4><ul>{JSON.parse(row.inconsistencies_json).map((item: { description: string; quotes: string[] }, index: number) => <li key={index}>{item.description}{item.quotes.map((quote, quoteIndex) => <blockquote key={quoteIndex} dir="auto">{quote}</blockquote>)}</li>)}</ul></section>}
        {row.transcript_deleted_at ? <p>Transcript deleted.</p> : <SessionTranscriptToggle sessionId={Number(row.id)} canDelete />}
        {String(row.summary_status) === "superseded" && <p>Summary history version {String(row.summary_version)} (superseded).</p>}
      </article>;
    })}
    {history.length > 0 && <section><h3>{copy.sessionHistory}</h3><ul>{history.map((row) => <li key={`${row.id}-${row.summary_id}`}>{copy.version} {String(row.summary_version)} · {formatCairoDateTime(String(row.created_at))} · {copy.priorVersion}</li>)}</ul></section>}
    <p>{copy.sessionDisclaimer}</p>
  </section>;
}
