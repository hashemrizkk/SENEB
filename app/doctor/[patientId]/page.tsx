import Link from "next/link";
import { after } from "next/server";
import { notFound } from "next/navigation";
import { z } from "zod";
import {
  default as db,
  getAfterWorkRatingForNote,
  getPatientRecord,
  type PatientIntakeRecord,
} from "@/lib/db";
import { requireDoctorSession } from "@/lib/doctor-review";
import { flagLabel, followupQuestions, questionLabel } from "@/lib/questions";
import { intakeFieldsSchema } from "@/lib/intake";
import { priorityForIntake } from "@/lib/intake-priority";
import RecordFollowupForm from "./RecordFollowupForm";
import ReviewEditForm from "./ReviewEditForm";
import { generateSummarySafely, summaryIsMissingOrStale } from "@/lib/summary-background";
import { indexedKey } from "@/lib/react-keys";
import {
  AUSDRISK_ABNORMAL_GLYCEMIA_CUTOFF,
  AUSDRISK_DIABETES_CUTOFF,
  AUSDRISK_MAX_SCORE,
  type AusdriskItem,
} from "@/lib/survey/ausdrisk";
import { afterWorkRatingSchema } from "@/lib/summary-types";
import { ar } from "@/lib/strings.ar";

export const dynamic = "force-dynamic";

function selectedIntake(
  records: PatientIntakeRecord[],
  value: string | undefined,
): PatientIntakeRecord | null {
  const id = Number(value);
  return records.find((record) => Number.isSafeInteger(id) && record.id === id) ?? records[0] ?? null;
}

function answerForField(
  intake: PatientIntakeRecord,
  key: string | null,
): boolean | number | null {
  if (
    key === "missed_doses" ||
    key === "hypoglycemia_episodes" ||
    key === "foot_problem" ||
    key === "vision_change"
  ) {
    return intake.fields[key];
  }
  return null;
}

function displayAnswer(value: boolean | number | null, copy: typeof ar.doctorIntake | typeof ar.doctorIntake.en): string {
  if (value === null) return copy.notAnswered;
  if (typeof value === "number") return String(value);
  return value ? copy.yes : copy.no;
}

function displayFieldValue(value: boolean | number | string | null, copy: typeof ar.doctorIntake | typeof ar.doctorIntake.en): string {
  if (typeof value === "string") return value || copy.notRecorded;
  return displayAnswer(value, copy);
}

function ausdriskItemLabel(item: AusdriskItem, copy: typeof ar.doctorIntake | typeof ar.doctorIntake.en): string {
  return copy.surveyItems[item];
}

function ausdriskResultLabel(result: string, copy: typeof ar.doctorIntake | typeof ar.doctorIntake.en): string {
  if (result === "below_cutoff") return copy.belowCutoff;
  if (result === "abnormal_glycemia_cutoff") return copy.abnormalCutoff;
  if (result === "diabetes_cutoff") return copy.diabetesCutoff;
  return copy.incomplete;
}

function displayTime(value: string | null, locale: "ar" | "en"): string {
  return value
    ? new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Cairo" }).format(new Date(value))
    : locale === "ar" ? "غير معروف" : "Unknown";
}

const revisionSnapshotSchema = z.object({
  patient: z.object({ name: z.string() }),
  intake: z.object({
    input_method: z.enum(["tap", "typed", "voice", "mixed", "assisted"]).nullable(),
    raw_text: z.string().nullable(),
    priority: z.enum(["urgent", "important", "normal"]).nullable(),
    status: z.enum(["new", "triaged", "seen"]),
    structured_json: z.string().nullable(),
  }),
});

function revisionSnapshot(value: string) {
  let decoded: unknown;
  try {
    decoded = JSON.parse(value) as unknown;
  } catch {
    throw new Error("Stored intake revision is not valid JSON.");
  }
  const parsed = revisionSnapshotSchema.safeParse(decoded);
  if (!parsed.success) throw new Error("Stored intake revision is invalid.");
  const fields = parsed.data.intake.structured_json
    ? intakeFieldsSchema.safeParse(JSON.parse(parsed.data.intake.structured_json))
    : null;
  if (fields && !fields.success) throw new Error("Stored revision answers are invalid.");
  return { ...parsed.data, fields: fields?.data ?? null };
}

export default async function DoctorIntakePage({
  params,
  searchParams,
}: {
  params: Promise<{ patientId: string }>;
  searchParams: Promise<{ intakeId?: string; lang?: string }>;
}) {
  await requireDoctorSession();
  const [{ patientId: rawPatientId }, { intakeId, lang: requestedLocale }] = await Promise.all([params, searchParams]);
  const locale = requestedLocale === "en" ? "en" : "ar";
  const isArabic = locale === "ar";
  const copy = isArabic ? ar.doctorIntake : ar.doctorIntake.en;
  const patientId = Number(rawPatientId);
  if (!Number.isSafeInteger(patientId) || patientId < 1) notFound();
  const record = getPatientRecord(patientId);
  if (!record) notFound();
  if (summaryIsMissingOrStale(patientId)) {
    after(() => generateSummarySafely(patientId));
  }
  const intake = selectedIntake(record.intakes, intakeId);
  const currentNote = intake?.doctorNotes[intake.doctorNotes.length - 1]?.note_text ?? "";
  const savedClinicianNote = record.intakes
    .flatMap((item) => item.doctorNotes)
    .filter((note) => note.note_text?.trim())
    .sort((left, right) =>
      (right.created_at ?? "").localeCompare(left.created_at ?? "") ||
      right.id - left.id
    )[0]?.note_text ?? "";
  const storedNoteRating = intake
    ? getAfterWorkRatingForNote(db, patientId, intake.id, currentNote)
    : null;
  const noteRating = storedNoteRating
    ? afterWorkRatingSchema.parse(JSON.parse(storedNoteRating.payload_json))
    : null;
  const noteRatingDisplay = noteRating && storedNoteRating
    ? {
        rating: noteRating.note_rating,
        mode: storedNoteRating.mode,
        note: currentNote,
        details: [
          ...noteRating.note_missing_required.map((item) => `${isArabic ? "مطلوب: " : "Missing required: "}${item}`),
          ...noteRating.note_missing_important.map((item) => `${isArabic ? "مهم: " : "Missing important: "}${item}`),
          ...noteRating.note_suggestions.map((item) => `${isArabic ? "اقتراح: " : "Suggestion: "}${item}`),
        ],
        prompt: (() => {
          const suggestion = noteRating.note_missing_required[0] ?? noteRating.note_suggestions[0] ?? null;
          if (noteRating.note_rating === "green" || !suggestion) return null;
          return /\b(urgent|emergency|severe|critical|risk)\b/i.test(suggestion)
            ? isArabic ? "يُرجى إضافة وصف واضح للتفصيل الناقص." : "Consider adding a clear description of the missing detail."
            : suggestion;
        })(),
      }
    : null;

  return (
    <><a className="skip-link" href="#doctor-patient-content">{copy.skip}</a><main lang={locale} dir={isArabic ? "rtl" : "ltr"} className="doctor-shell doctor-intake-shell" id="doctor-patient-content" tabIndex={-1}>
      <p className="doctor-back-link"><Link href={`/doctor?lang=${locale}`}>{isArabic ? "→" : "←"} {copy.backQueue}</Link></p>
      <header className="doctor-intake-hero">
        <div className="doctor-intake-heading">
            <p className="doctor-eyebrow">{copy.title}</p>
          <h1>{record.patient.name}</h1>
          <p>{copy.reference}: {record.patient.reference_code ?? copy.unavailable}</p>
        </div>
        {intake ? (
          <>
            <div className="doctor-intake-status-grid" aria-label={copy.recordDetails}>
              <div className="doctor-intake-status-card"><span>{copy.submitted}</span><strong>{displayTime(intake.created_at, locale)}</strong></div>
              <div className="doctor-intake-status-card"><span>{copy.revision}</span><strong>{isArabic ? `م${intake.version}` : `v${intake.version}`}</strong></div>
            </div>
            <p className="doctor-intake-input-method">{copy.inputMethod}: <strong>{copy.inputMethods[intake.input_method ?? "unknown"]}</strong></p>
            {intake.input_method === "voice" || intake.input_method === "mixed" ? (
              <p>{copy.voiceNote}</p>
            ) : null}
          </>
        ) : <p>{copy.noIntake}</p>}
        <div className="doctor-intake-demographics"><span>{copy.age}: <strong>{record.patient.age ?? copy.notRecorded}</strong></span><span>{copy.diabetes}: <strong>{record.patient.diabetes_type ?? copy.notRecorded}</strong></span><Link href={`/doctor/${patientId}/summary?lang=${locale}`}>{copy.caseSummary} <span aria-hidden="true">→</span></Link></div>
      </header>
      {intake ? (
        <div id="intake-edit">
          <ReviewEditForm
            key={`${intake.id}:${intake.version}`}
            intake={intake}
            patient={record.patient}
            initialNoteRating={noteRatingDisplay}
            locale={locale}
          />
        </div>
      ) : null}
      <section id="intake-history" lang={locale} dir={isArabic ? "rtl" : "ltr"}>
        <h2>{copy.history}</h2>
        {record.intakes.length ? (
          <ol>
            {record.intakes.map((item, index) => {
              const initialRevision = item.revisions.find((revision) => revision.revision === 1);
              const label = initialRevision?.source === "clinician"
                ? copy.clinicFollowup
                : index === record.intakes.length - 1
                  ? copy.initialRecord
                  : copy.patientFollowup;
              return (
                <li key={item.id} aria-current={item.id === intake?.id ? "page" : undefined}>
                  <Link href={`/doctor/${patientId}?intakeId=${item.id}&lang=${locale}`}>
                    {label} · {displayTime(item.created_at, locale)}
                  </Link>
                  {item.id === intake?.id ? ` ${copy.current}` : null}
                </li>
              );
            })}
          </ol>
        ) : <p>{copy.noHistory}</p>}
      </section>
      {intake ? (
        <>
          {intake.meta?.needs_review ? (
              <p role="status" style={{ background: "var(--important-bg)", padding: 12 }}>{copy.needsReview}</p>
          ) : null}
          {intake.meta?.contradiction ? (
              <p role="status" style={{ background: "var(--important-bg)", padding: 12 }}>{copy.contradiction}</p>
          ) : null}
          {intake.meta?.survey ? (
            <section aria-labelledby="survey-review-title">
              <h2 id="survey-review-title">{copy.surveyTitle}</h2>
              {"tool" in intake.meta.survey ? (
                <>
                  <p>
                    {copy.surveyScore}{intake.meta.survey.screeningResult === "incomplete" ? ` ${copy.partial}` : ""}:{" "}
                    {intake.meta.survey.total}/{AUSDRISK_MAX_SCORE} ·{" "}
                    {intake.meta.survey.screeningResult === "incomplete"
                      ? copy.riskUnavailable
                      : `${copy.riskBands[intake.meta.survey.riskBand]} ${copy.band}`} ·{" "}
                    {ausdriskResultLabel(intake.meta.survey.screeningResult, copy)}
                  </p>
                  <p>
                    {copy.screeningCutoffNote} (≥{AUSDRISK_ABNORMAL_GLYCEMIA_CUTOFF} / ≥{AUSDRISK_DIABETES_CUTOFF})
                  </p>
                  <dl>
                    {intake.meta.survey.items.map((item, index) => (
                      <div key={indexedKey(item.item, index)}>
                        <dt>{ausdriskItemLabel(item.item, copy)}</dt>
                        <dd>{displayFieldValue(item.answer, copy)} · {item.points} {copy.points}</dd>
                      </div>
                    ))}
                  </dl>
                  {intake.meta.survey.unknownItems.length ? (
                    <p>{copy.unanswered}: {intake.meta.survey.unknownItems.map((item) => ausdriskItemLabel(item, copy)).join(isArabic ? "، " : ", ")}</p>
                  ) : null}
                  <p>
                    {copy.sources}:{" "}
                    <a href="https://doi.org/10.1186/s13104-022-06200-2" target="_blank" rel="noreferrer">
                      {copy.validationStudy}
                    </a>
                    {" · "}
                    <a href="https://doi.org/10.1186/s12889-023-15819-0" target="_blank" rel="noreferrer">
                      {copy.egyptStudy}
                    </a>
                  </p>
                </>
              ) : (
                <p>{copy.legacy} · {intake.meta.survey.total} {copy.points} · {intake.meta.survey.band}</p>
              )}
            </section>
          ) : null}
          <section>
            <h2>{copy.answersTitle}</h2>
            <dl>
              {followupQuestions.slice(0, 4).map((question) => (
                <div key={question.id}>
                  <dt>{copy.questionLabels[question.key as keyof typeof copy.questionLabels] ?? question.label}</dt>
                  <dd>{displayAnswer(answerForField(intake, question.structuredField), copy)}</dd>
                </div>
              ))}
              <dt>{copy.questionLabels.hypoglycemia_symptoms}</dt>
              <dd>{displayAnswer(intake.fields.hypoglycemia_symptoms, copy)}</dd>
              <dt>{copy.questionLabels.emergency_symptoms_mentioned}</dt>
              <dd>{displayAnswer(intake.fields.emergency_symptoms_mentioned, copy)}</dd>
              <dt>{copy.questionLabels.symptoms_text}</dt>
              <dd>{intake.fields.symptoms_text ?? copy.notRecorded}</dd>
            </dl>
            {intake.input_method === "typed" && intake.fields.hypoglycemia_episodes !== null ? (
              <p>
                {copy.legacyNote}
              </p>
            ) : null}
            <h3>{copy.flagsTitle}</h3>
            {intake.flags.flags.length ? (
              <ul>{intake.flags.flags.map((flag, index) => <li key={indexedKey(flag, index)}>{isArabic ? flagLabel(flag) : ar.doctor.en.riskFlags[flag as keyof typeof ar.doctor.en.riskFlags] ?? flag}</li>)}</ul>
            ) : <p>{copy.noFlags}</p>}
            {(() => {
              const suggestion = priorityForIntake(intake.fields, intake.raw_text, intake.meta?.needs_review ?? false);
              const latestRevision = intake.revisions.find((revision) => revision.revision === intake.version);
              return <section className="doctor-suggested-priority" aria-label={copy.suggestedPriority}>
                <p><strong>{copy.suggestedPriority}:</strong> {suggestion.priority ?? (isArabic ? "غير محدد" : "Not assigned")} <span>({latestRevision?.reason?.includes("Priority source: manual") ? copy.staffPriority : copy.automaticRules})</span></p>
                {suggestion.reasons.length ? <ul>{suggestion.reasons.map((reason, index) => <li key={indexedKey(reason.rule_id, index)}>{reason.text}</li>)}</ul> : null}
              </section>;
            })()}
            {intake.unansweredCount ? <p>{intake.unansweredCount} {copy.unanswered}.</p> : null}
            <h3>{copy.submittedText}</h3>
            <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{intake.raw_text ?? copy.noText}</pre>
          </section>
          <section lang={locale} dir={isArabic ? "rtl" : "ltr"}>
            <h2>{copy.revisionHistory}</h2>
            <ol>
              {intake.revisions.map((revision) => {
                const snapshot = revisionSnapshot(revision.snapshot_json);
                const changedFields = z.array(z.string()).parse(
                  JSON.parse(revision.changed_fields_json) as unknown,
                );
                return (
                  <li key={revision.id}>
                    <strong>{copy.revisionLabel(revision.revision)}</strong> · {revision.source === "clinician" ? (isArabic ? "العيادة" : "Clinic") : (isArabic ? "المريض" : "Patient")} · {displayTime(revision.edited_at, locale)} · {revision.edited_by ?? copy.editedByPatient}
                    {revision.reason_type || revision.reason ? <p>{copy.reason}: {revision.reason_type ? copy.reasonTypes[revision.reason_type] : ""}{revision.reason ? ` · ${revision.reason}` : ""}</p> : null}
                    {revision.is_backfill ? (
                      <p>{copy.backfill}</p>
                    ) : null}
                    <details>
                      <summary>{copy.viewValues}</summary>
                      <p>{copy.patient}: {snapshot.patient.name}</p>
                      <p>{copy.inputMethod}: {copy.inputMethods[snapshot.intake.input_method ?? "unknown"]}</p>
                      {snapshot.intake.input_method === "voice" || snapshot.intake.input_method === "mixed" ? (
                        <p>{copy.voiceNote}</p>
                      ) : null}
                      <p>{copy.queueState}: {copy.queueStates[snapshot.intake.status]} · {copy.priority}: {snapshot.intake.priority ? copy.priorityNames[snapshot.intake.priority] : (isArabic ? "غير محدد" : "Not assigned")}</p>
                      <h4>{copy.savedAnswers}</h4>
                      {snapshot.fields ? (
                        <dl>
                          {Object.entries(snapshot.fields).map(([field, value]) => (
                            <div key={field}><dt>{copy.questionLabels[field as keyof typeof copy.questionLabels] ?? questionLabel(field)}</dt><dd>{displayFieldValue(value, copy)}</dd></div>
                          ))}
                        </dl>
                      ) : <p>{copy.unavailableAnswers}</p>}
                      <h4>{copy.savedText}</h4>
                      <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{snapshot.intake.raw_text ?? copy.noText}</pre>
                    </details>
                    {revision.revision > 1 ? <p>{copy.changedFields}: {changedFields.join(isArabic ? "، " : ", ") || copy.noChanges}</p> : null}
                  </li>
                );
              })}
            </ol>
          </section>
        </>
      ) : null}
      <RecordFollowupForm
        patient={record.patient}
        savedClinicianNote={savedClinicianNote}
        locale={locale}
      />
    </main></>
  );
}
