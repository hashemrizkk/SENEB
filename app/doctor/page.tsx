import Link from "next/link";
import { Fragment } from "react";
import { requireDoctorSession } from "@/lib/doctor-review";
import db, { getDemoWeekMetrics, latestAfterWorkRating, listQueue, type QueueFilter } from "@/lib/db";
import { flagLabel } from "@/lib/questions";
import { inputMethodLabel, inputMethodNote } from "@/lib/voice-utils";
import DoctorQueueRefresh from "./DoctorQueueRefresh";
import { ar } from "@/lib/strings.ar";
import RatingCircle from "@/components/RatingCircle";
import { afterWorkRatingSchema } from "@/lib/summary-types";
import { surveyEmailReady } from "@/lib/survey-email";
import { formatTimeSinceSubmission } from "@/lib/date-time";

export const dynamic = "force-dynamic";

function selectedFilter(value: string | undefined): QueueFilter {
  return value === "new" || value === "triaged" ? value : "all";
}

export default async function DoctorPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const session = await requireDoctorSession();
  const { filter: rawFilter } = await searchParams;
  const filter = selectedFilter(rawFilter);
  const records = listQueue(filter);
  const anyRecords = filter === "all" ? records.length > 0 : listQueue("all").length > 0;
  const metrics = getDemoWeekMetrics();
  const configuredLlm = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY
    ? "Gemini" : process.env.GROQ_API_KEY && process.env.GROQ_MODEL ? "Groq" : "mock";
  const groups = [
    ["urgent", "Urgent", "▲"], ["important", "Important", "●"],
    ["normal", "Normal", "○"], ["unknown", "Not enough information", "○"],
  ] as const;
  const profileRatings = new Map(records.map((record) => {
    const stored = latestAfterWorkRating(db, record.patient_id);
    const rating = stored
      ? afterWorkRatingSchema.parse(JSON.parse(stored.payload_json))
      : null;
    return [record.patient_id, stored && rating
      ? {
          rating: rating.profile_rating,
          mode: stored.mode,
          details: rating.profile_gaps.map(
            (gap) => `${gap.field} (${gap.importance}): ${gap.reason}`,
          ),
        }
      : null] as const;
  }));
  return (
    <><a className="skip-link" href="#doctor-content">Skip to content</a><main className="doctor-shell" id="doctor-content" tabIndex={-1}>
      <header className="doctor-header">
        <div>
          <h1>Doctor review queue</h1>
          <p>Signed in as {session.name}. Review flags are decision support, not a diagnosis.</p>
        </div>
        <form action="/api/doctor/logout" method="post">
          <button type="submit">Sign out</button>
        </form>
      </header>
      <DoctorQueueRefresh />
      <p className="demo-metric">Demo metrics (last 7 days): {metrics.autoStructured} intakes auto-structured · {metrics.notesAutoRated} notes auto-rated</p>
      <nav className="doctor-nav" aria-label="Queue filters">
        {(["new", "triaged", "all"] as const).map((value) => (
          <Link
            key={value}
            href={`/doctor?filter=${value}`}
            aria-current={filter === value ? "page" : undefined}
          >
            {value === "new" ? "New" : value === "triaged" ? "Triaged" : "All"}
          </Link>
        ))}
        <Link href="/admin/intakes">Recent intake details</Link>
      </nav>
      {records.length === 0 ? <p>{anyRecords ? "No intakes match this filter." : <>No intakes yet — share the registration link <Link href="/register">/register</Link>.</>}</p> : null}
      <div style={{ overflowX: "auto" }}>
        <table>
          <caption>Patient intakes awaiting clinic review, grouped by staff priority</caption>
          <thead>
            <tr>
              <th scope="col">Patient / reference</th>
              <th scope="col">Submitted</th>
              <th scope="col">Input method</th>
              <th scope="col">Queue state</th>
              <th scope="col">Priority</th>
              <th scope="col">Review flags</th>
              <th scope="col">Answers missing</th>
              <th scope="col">Record</th>
            </tr>
          </thead>
          <tbody>
            {groups.map(([priority, title, icon]) => {
              const groupRecords = records.filter((record) => (record.priority ?? "unknown") === priority);
              if (!groupRecords.length) return null;
              return <Fragment key={priority}><tr><th colSpan={8} scope="rowgroup">{icon} {title} ({groupRecords.length})</th></tr>{groupRecords.map((record) => {
              const profileRating = profileRatings.get(record.patient_id);
              return (
              <tr key={record.id}>
                <td>
                  <strong>{record.patient_name}</strong>
                  {record.meta?.llm_mode === "mock" ? <p><strong>MOCK extraction — synthetic demo data.</strong></p> : null}
                  <br />
                  <small>{record.reference_code ?? "No reference code"}</small>
                  {record.meta?.survey ? (
                    <p>
                      {"tool" in record.meta.survey
                        ? record.meta.survey.screeningResult === "incomplete"
                          ? `AUSDRISK Arabic · ${ar.survey.incomplete} (${record.meta.survey.total}/34)`
                          : `AUSDRISK Arabic · ${record.meta.survey.total}/34 · ${
                            ar.survey[record.meta.survey.riskBand]
                          } · ${
                            ar.survey[record.meta.survey.screeningResult === "below_cutoff"
                              ? "belowCutoff"
                              : record.meta.survey.screeningResult === "abnormal_glycemia_cutoff"
                                ? "abnormalGlycemiaCutoff"
                                : "diabetesCutoff"]
                          }`
                        : `Legacy FINDRISC · ${record.meta.survey.band}`}
                    </p>
                  ) : null}
                  {profileRating ? (
                    <RatingCircle
                      rating={profileRating.rating}
                      label="Profile completeness (record-based)"
                      details={profileRating.details}
                      mode={profileRating.mode}
                    />
                  ) : null}
                </td>
                <td>{record.created_at ?? "Unknown"}<br/><small>{formatTimeSinceSubmission(record.created_at)}</small></td>
                <td>
                  {inputMethodLabel(record.input_method)}
                  {inputMethodNote(record.input_method) ? (
                    <p>{inputMethodNote(record.input_method)}</p>
                  ) : null}
                </td>
                <td>{record.status}</td>
                <td>{icon} {title}</td>
                <td>
                  {record.flags.flags.length
                    ? record.flags.flags.map(flagLabel).join(", ")
                    : "None"}
                  {record.edited ? <p>Edited by {record.edited_by}</p> : null}
                </td>
                <td>{record.unansweredCount}</td>
                <td>
                  <Link href={`/doctor/${record.patient_id}?intakeId=${record.id}`}>Review intake</Link>
                  <br />
                  <Link href={`/doctor/${record.patient_id}/summary`}>Case summary</Link>
                </td>
              </tr>
              );
            })}</Fragment>;
            })}
          </tbody>
        </table>
      </div>
      <footer className="demo-health">Status: DB ok · LLM provider {configuredLlm} · Email {surveyEmailReady() ? "ready" : "not configured"}</footer>
    </main></>
  );
}
