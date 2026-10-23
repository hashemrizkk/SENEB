import Link from "next/link";
import { requireDoctorSession } from "@/lib/doctor-review";
import db, { getDemoWeekMetrics, latestAfterWorkRating, listQueue, type QueueFilter } from "@/lib/db";
import { flagLabel } from "@/lib/questions";
import DoctorQueueRefresh from "./DoctorQueueRefresh";
import { ar } from "@/lib/strings.ar";
import RatingCircle from "@/components/RatingCircle";
import { afterWorkRatingSchema } from "@/lib/summary-types";
import { surveyEmailReady } from "@/lib/survey-email";

export const dynamic = "force-dynamic";

function selectedFilter(value: string | undefined): QueueFilter {
  return value === "new" || value === "triaged" ? value : "all";
}

export default async function DoctorPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; lang?: string }>;
}) {
  const session = await requireDoctorSession();
  const { filter: rawFilter, lang: rawLocale } = await searchParams;
  const locale = rawLocale === "en" ? "en" : "ar";
  const isArabic = locale === "ar";
  const copy = isArabic ? ar.doctor : ar.doctor.en;
  const filter = selectedFilter(rawFilter);
  const records = listQueue(filter);
  const anyRecords = filter === "all" ? records.length > 0 : listQueue("all").length > 0;
  const metrics = getDemoWeekMetrics();
  const configuredLlm = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY
    ? "Gemini" : process.env.GROQ_API_KEY && process.env.GROQ_MODEL ? "Groq" : "mock";
  const groups = [
    ["urgent", copy.urgent, "▲"], ["important", copy.important, "●"],
    ["normal", copy.normal, "○"], ["unknown", copy.unknownPriority, "○"],
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
    <><a className="skip-link" href="#doctor-content">{copy.skip}</a><main dir={isArabic ? "rtl" : "ltr"} lang={locale} className="doctor-shell" id="doctor-content" tabIndex={-1}>
      <header className="doctor-header">
        <div>
          <h1>{copy.title}</h1>
          <p>{copy.signedIn(session.name)}</p>
        </div>
        <form action="/api/doctor/logout" method="post">
          <button type="submit">{copy.signOut}</button>
        </form>
      </header>
      <DoctorQueueRefresh locale={locale} />
      <p className="demo-metric">{copy.metrics(metrics.autoStructured, metrics.notesAutoRated)}</p>
      <nav className="doctor-queue-tools" aria-label={copy.queueViews}>
        <div className="doctor-filter-group" aria-label={copy.filterIntakes}>
          {(["new", "triaged", "all"] as const).map((value) => (
            <Link
              className="doctor-filter-link"
              key={value}
              href={`/doctor?filter=${value}&lang=${locale}`}
              aria-current={filter === value ? "page" : undefined}
            >
              {value === "new" ? copy.new : value === "triaged" ? copy.triaged : copy.all}
            </Link>
          ))}
        </div>
        <div className="doctor-recent-links" aria-label={copy.recentRecords}>
          <Link href={`/admin/intakes?lang=${locale}`}>{copy.recentIntakes} <span aria-hidden="true">→</span></Link>
          <Link href={`/admin/notes?lang=${locale}`}>{copy.recentNotes} <span aria-hidden="true">→</span></Link>
        </div>
      </nav>
      {records.length === 0 ? <p>{anyRecords ? copy.emptyFiltered : <>{copy.empty} <Link href={`/register?lang=${locale}`}>/{copy.register.toLowerCase()}</Link>.</>}</p> : null}
      <section className="doctor-queue" aria-label={copy.caption}>
        <p className="doctor-queue-caption">{copy.caption}</p>
        <div className="doctor-queue-groups">
            {groups.map(([priority, title, icon]) => {
              const groupRecords = records.filter((record) => (record.priority ?? "unknown") === priority);
              if (!groupRecords.length) return null;
              return <section className={`doctor-priority-group doctor-priority-${priority}`} key={priority} aria-labelledby={`priority-${priority}`}>
                <h2 id={`priority-${priority}`} className="doctor-priority-heading"><span aria-hidden="true">{icon}</span> {title} <span className="doctor-priority-count">{groupRecords.length}</span></h2>
                <div className="doctor-record-list">{groupRecords.map((record) => {
              const profileRating = profileRatings.get(record.patient_id);
              return (
              <article className="doctor-record-card" key={record.id}>
                <div className="doctor-record-top">
                  <div className="doctor-record-identity">
                    <h3>{record.patient_name}</h3>
                    <small>{record.reference_code ?? copy.referenceMissing}</small>
                  </div>
                  <span className={`doctor-status-pill doctor-status-${record.status}`}>{record.status === "new" ? copy.new : record.status === "triaged" ? copy.triaged : record.status}</span>
                </div>
                {record.meta?.llm_mode === "mock" ? <p className="doctor-mock-notice"><strong>{copy.mock}</strong></p> : null}
                <div className="doctor-record-meta">
                  <div><span>{copy.submitted}</span><strong>{copy.timeAgo(record.created_at)}</strong><small>{record.created_at ? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(record.created_at)) : copy.unknownDate}</small></div>
                  <div><span>{copy.inputMethod}</span><strong>{copy.inputMethods[record.input_method as keyof typeof copy.inputMethods] ?? copy.inputMethods.unknown}</strong>{record.input_method === "voice" || record.input_method === "mixed" ? <small>{copy.voiceNote}</small> : null}</div>
                  <div><span>{copy.missingAnswers}</span><strong>{record.unansweredCount}</strong></div>
                </div>
                <div className="doctor-record-review">
                  <div className="doctor-review-flags"><span>{copy.flags}</span><strong>{record.flags.flags.length ? record.flags.flags.map((flag) => copy.riskFlags[flag as keyof typeof copy.riskFlags] ?? flagLabel(flag)).join(isArabic ? "، " : ", ") : copy.noFlags}</strong>{record.edited ? <small>{copy.editedBy(record.edited_by ?? "")}</small> : null}</div>
                  <div className="doctor-record-priority"><span>{copy.priority}</span><strong>{icon} {title}</strong></div>
                </div>
                {record.meta?.survey ? (
                  <p className="doctor-survey-detail">
                    {"tool" in record.meta.survey
                      ? record.meta.survey.screeningResult === "incomplete"
                        ? `AUSDRISK · ${isArabic ? ar.survey.incomplete : "Incomplete"} (${record.meta.survey.total}/34)`
                        : `AUSDRISK · ${record.meta.survey.total}/34 · ${
                          isArabic ? ar.survey[record.meta.survey.riskBand] : record.meta.survey.riskBand
                        } · ${
                          isArabic ? ar.survey[record.meta.survey.screeningResult === "below_cutoff"
                            ? "belowCutoff"
                            : record.meta.survey.screeningResult === "abnormal_glycemia_cutoff"
                              ? "abnormalGlycemiaCutoff"
                                : "diabetesCutoff"] : record.meta.survey.screeningResult.replaceAll("_", " ")
                        }`
                      : `Legacy FINDRISC · ${record.meta.survey.band}`}
                  </p>
                ) : null}
                {profileRating ? (
                  <RatingCircle
                    rating={profileRating.rating}
                    label={copy.profileCompleteness}
                    details={profileRating.details}
                    mode={profileRating.mode}
                  />
                ) : null}
                <div className="doctor-record-actions">
                  <Link className="doctor-action-primary" href={`/doctor/${record.patient_id}?intakeId=${record.id}&lang=${locale}`}>{copy.review} <span aria-hidden="true">→</span></Link>
                  <Link className="doctor-action-secondary" href={`/doctor/${record.patient_id}/summary?lang=${locale}`}>{copy.caseSummary}</Link>
                </div>
              </article>
              );
            })}</div>
              </section>;
            })}
        </div>
      </section>
      <footer className="demo-health">{copy.demo}: {copy.databaseOk} · {copy.llmProvider} {configuredLlm} · {surveyEmailReady() ? copy.emailReady : copy.emailNotConfigured}</footer>
    </main></>
  );
}
