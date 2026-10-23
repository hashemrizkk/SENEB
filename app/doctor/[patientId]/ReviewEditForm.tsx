"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import VoiceInput from "@/components/VoiceInput";
import type { PatientContact, PatientIntakeRecord } from "@/lib/db";
import { intakeFieldsSchema, type IntakeFields } from "@/lib/intake";
import { followupQuestions, questionLabel } from "@/lib/questions";
import { appendTranscript } from "@/lib/voice-utils";
import RatingCircle from "@/components/RatingCircle";
import { ar } from "@/lib/strings.ar";

type NoteRatingDisplay = {
  rating: "green" | "yellow" | "red";
  details: string[];
  mode: "llm" | "mock" | "fallback";
  note: string;
  prompt?: string | null;
};

type EditableField = "missed_doses" | "hypoglycemia_episodes" | "foot_problem" | "vision_change";
type LatestRecordPreview = {
  version: number;
  status: "new" | "triaged" | "seen";
  priority: "urgent" | "important" | "normal" | null;
  fields: IntakeFields;
  raw_text: string | null;
};
type LatestPatientPreview = { name: string; phone: string | null; email: string | null; self_description: string | null };

function isEditableField(value: string | null): value is EditableField {
  return value === "missed_doses" ||
    value === "hypoglycemia_episodes" ||
    value === "foot_problem" ||
    value === "vision_change";
}

function fieldValue(fields: IntakeFields, key: EditableField): boolean | number | null {
  return fields[key];
}

function responseMessage(result: unknown): string | null {
  if (result !== null && typeof result === "object" && "error" in result && typeof result.error === "string") {
    return result.error;
  }
  return null;
}

function latestRecordFromResponse(result: unknown): LatestRecordPreview | null {
  if (
    result === null ||
    typeof result !== "object" ||
    !("latestRecord" in result) ||
    result.latestRecord === null ||
    typeof result.latestRecord !== "object"
  ) {
    return null;
  }
  const value = result.latestRecord;
  if (
    !("version" in value) ||
    typeof value.version !== "number" ||
    !Number.isSafeInteger(value.version) ||
    !("status" in value) ||
    (value.status !== "new" && value.status !== "triaged" && value.status !== "seen") ||
    !("priority" in value) ||
    (value.priority !== null &&
      value.priority !== "urgent" &&
      value.priority !== "important" &&
      value.priority !== "normal") ||
    !("raw_text" in value) ||
    (value.raw_text !== null && typeof value.raw_text !== "string") ||
    !("fields" in value)
  ) {
    return null;
  }
  const fields = intakeFieldsSchema.safeParse(value.fields);
  if (!fields.success) return null;
  return {
    version: value.version,
    status: value.status,
    priority: value.priority,
    fields: fields.data,
    raw_text: value.raw_text,
  };
}

function displayAnswer(value: boolean | number | string | null, copy: typeof ar.doctorReviewForm | typeof ar.doctorReviewForm.en): string {
  if (value === null) return copy.notAnswered;
  if (typeof value === "string") return value || copy.notRecorded;
  if (typeof value === "number") return String(value);
  return value ? copy.yes : copy.no;
}

function isStatus(value: string): value is PatientIntakeRecord["status"] {
  return value === "new" || value === "triaged" || value === "seen";
}

export default function ReviewEditForm({
  intake,
  patient,
  initialNoteRating,
  locale,
}: {
  intake: PatientIntakeRecord;
  patient: PatientContact;
  initialNoteRating: NoteRatingDisplay | null;
  locale: "ar" | "en";
}) {
  const isArabic = locale === "ar";
  const copy = isArabic ? ar.doctorReviewForm : ar.doctorReviewForm.en;
  const intakeCopy = isArabic ? ar.doctorIntake : ar.doctorIntake.en;
  const questionText = (key: string, fallback: string) => intakeCopy.questionLabels[key as keyof typeof intakeCopy.questionLabels] ?? fallback;
  const router = useRouter();
  const [name, setName] = useState(patient.name);
  const [phone, setPhone] = useState(patient.phone ?? "");
  const [email, setEmail] = useState(patient.email ?? "");
  const [selfDescription, setSelfDescription] = useState(patient.self_description ?? "");
  const [fields, setFields] = useState<IntakeFields>(intake.fields);
  const [rawText, setRawText] = useState(intake.raw_text ?? "");
  const [status, setStatus] = useState(intake.status);
  const [priority, setPriority] = useState(intake.priority ?? "");
  const [note, setNote] = useState(
    intake.doctorNotes[intake.doctorNotes.length - 1]?.note_text ?? "",
  );
  const [noteTranscript, setNoteTranscript] = useState("");
  const [reason, setReason] = useState("");
  const [reasonType, setReasonType] = useState<"transcription_error" | "patient_clarified" | "typo_correction" | "other" | "">("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [conflictVersion, setConflictVersion] = useState<number | null>(null);
  const [latestRecord, setLatestRecord] = useState<LatestRecordPreview | null>(null);
  const [latestPatient, setLatestPatient] = useState<LatestPatientPreview | null>(null);
  const [editVersion, setEditVersion] = useState(intake.version);
  const errorRef = useRef<HTMLDivElement>(null);
  const [mergeNotice, setMergeNotice] = useState("");
  const changedFields = (Object.keys(fields) as (keyof IntakeFields)[]).filter((key) => fields[key] !== intake.fields[key]);
  const dirty = changedFields.length > 0 || name !== patient.name || phone !== (patient.phone ?? "") || email !== (patient.email ?? "") || selfDescription !== (patient.self_description ?? "") || rawText !== (intake.raw_text ?? "") || status !== intake.status || priority !== (intake.priority ?? "") || note !== (intake.doctorNotes[intake.doctorNotes.length - 1]?.note_text ?? "") || reason.length > 0 || reasonType.length > 0;

  useEffect(() => { if (message && message !== copy.saved) errorRef.current?.focus(); }, [message, copy.saved]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  async function save() {
    if (saving) return;
    setSaving(true);
    setMessage(null);
    setConflictVersion(null);
    setLatestRecord(null);
    setLatestPatient(null);
    try {
      const response = await fetch(`/api/doctor/intakes/${intake.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          version: editVersion,
          patient: { name, phone, email, self_description: selfDescription },
          fields,
          raw_text: rawText || null,
          priority: priority || null,
          status,
          note,
          reason,
          reasonType: reasonType || null,
        }),
      });
      const result: unknown = await response.json();
      if (response.ok) {
        setMessage(copy.saved);
        setReason("");
        setReasonType("");
        router.refresh();
      } else if (
        response.status === 409 &&
        result !== null &&
        typeof result === "object" &&
        "latestVersion" in result &&
        typeof result.latestVersion === "number"
      ) {
        setConflictVersion(result.latestVersion);
        setLatestRecord(latestRecordFromResponse(result));
        if ("latestPatient" in result && result.latestPatient && typeof result.latestPatient === "object" && "name" in result.latestPatient && typeof result.latestPatient.name === "string") {
          const preview = result.latestPatient;
          const previewName = preview.name;
          setLatestPatient({
            name: typeof previewName === "string" ? previewName : "",
            phone: "phone" in preview && (typeof preview.phone === "string" || preview.phone === null) ? preview.phone : null,
            email: "email" in preview && (typeof preview.email === "string" || preview.email === null) ? preview.email : null,
            self_description: "self_description" in preview && (typeof preview.self_description === "string" || preview.self_description === null) ? preview.self_description : null,
          });
        }
        setMessage(copy.conflict);
      } else {
        setMessage(responseMessage(result) ?? copy.saveFailed);
      }
    } catch {
      setMessage(copy.networkFailed);
    } finally {
      setSaving(false);
    }
  }

  function updateField(key: EditableField, value: boolean | number) {
    setFields((current) => ({ ...current, [key]: value }));
  }

  function mergeOntoLatest() {
    if (!latestRecord) return;
    const next = { ...latestRecord.fields };
    for (const key of changedFields) next[key] = fields[key] as never;
    setFields(next);
    if (latestPatient) {
      if (name === patient.name) setName(latestPatient.name);
      if (phone === (patient.phone ?? "")) setPhone(latestPatient.phone ?? "");
      if (email === (patient.email ?? "")) setEmail(latestPatient.email ?? "");
      if (selfDescription === (patient.self_description ?? "")) setSelfDescription(latestPatient.self_description ?? "");
    }
    setEditVersion(latestRecord.version);
    setMergeNotice(copy.mergeNotice);
    setMessage(null);
  }

  return (
    <section className="doctor-intake-edit-card" lang={locale} dir={isArabic ? "rtl" : "ltr"}>
      <section className="doctor-clinical-note-panel" aria-labelledby="clinician-note-heading">
        <div className="doctor-clinical-note-heading">
          <h2 id="clinician-note-heading">{copy.clinicianNotes}</h2>
        </div>
        <div className="doctor-edit-note-control">
          <label htmlFor="clinician-note">{copy.clinicianNote}</label>
          <textarea
            id="clinician-note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={4000}
            placeholder={copy.notePlaceholder}
          />
          <VoiceInput
            id={`clinician-note-voice-${intake.id}`}
            label={copy.dictateNote}
            maxChars={4_000}
            transcript={noteTranscript}
            onTranscriptChange={setNoteTranscript}
            onAppend={(text) => setNote((current) => appendTranscript(current, text, 4_000))}
              autoAppend
              showTranscript={false}
            direction={isArabic ? "rtl" : "ltr"}
            locale={locale}
          />
        </div>
        <div className="doctor-edit-priority-controls">
          <label>
            <span>{copy.queueState}</span>
            <select value={status} onChange={(event) => {
              if (isStatus(event.target.value)) setStatus(event.target.value);
            }}>
              <option value="new">{copy.new}</option><option value="triaged">{copy.triaged}</option><option value="seen">{copy.seen}</option>
            </select>
          </label>
          <label>
            <span>{copy.clinicalPriority}</span>
            <select value={priority} onChange={(event) => setPriority(event.target.value)}>
              <option value="">{copy.notAssigned}</option><option value="urgent">{copy.urgent}</option><option value="important">{copy.important}</option><option value="normal">{copy.normal}</option>
            </select>
          </label>
        </div>
        {intake.doctorNotes.length > 1 ? (
          <details className="doctor-previous-notes">
            <summary>{copy.previousNotes(intake.doctorNotes.length - 1)}</summary>
            <ol>{[...intake.doctorNotes].slice(0, -1).reverse().map((savedNote) => <li key={savedNote.id}><p>{savedNote.note_text}</p><small>{savedNote.edited_by} · {savedNote.created_at ?? copy.timeUnknown}</small></li>)}</ol>
          </details>
        ) : null}
      </section>
      <div className="doctor-edit-heading">
        <div><p className="doctor-eyebrow">{copy.reviewControls}</p><h2>{copy.sectionTitle}</h2></div>
        <button className="doctor-save-top" type="button" onClick={save} disabled={saving}>{saving ? copy.saving : copy.save}</button>
      </div>
      <p className="doctor-edit-safety-note">{copy.safety}</p>
      <label>{copy.name}<input value={name} onChange={(event) => setName(event.target.value)} maxLength={100} /></label>
      <label>{copy.phone}<input dir="ltr" value={phone} onChange={(event) => setPhone(event.target.value)} maxLength={30} /></label>
      <label>{copy.email}<input dir="ltr" value={email} onChange={(event) => setEmail(event.target.value)} maxLength={254} /></label>
      <label>{copy.description}<textarea value={selfDescription} onChange={(event) => setSelfDescription(event.target.value)} maxLength={300} /></label>
      <fieldset>
        <legend>{copy.questionnaire}</legend>
        {changedFields.length ? <ul aria-label={copy.changed}>{changedFields.map((key) => <li key={key}><span>{questionText(key, questionLabel(key))}</span>: {displayAnswer(intake.fields[key] as boolean | number | null, copy)} → {displayAnswer(fields[key] as boolean | number | null, copy)}</li>)}</ul> : <p>{copy.noAnswersChanged}</p>}
        {followupQuestions.slice(0, 4).map((question) => {
          const field = question.structuredField;
          if (!isEditableField(field)) return null;
          const current = fieldValue(fields, field);
          return (
            <fieldset key={question.id}>
              <legend>{questionText(field, question.label)}</legend>
              <p>{copy.originalValue}: {displayAnswer(intake.originalFields?.[field] ?? null, copy)}</p>
              {question.options.map((option) => (
                <button
                  key={String(option.value)}
                  type="button"
                  aria-pressed={current === option.value}
                  onClick={() => updateField(field, option.value)}
                  style={{ fontWeight: current === option.value ? "bold" : "normal", marginInlineEnd: 8 }}
                >
                  {isArabic ? option.label : typeof option.value === "boolean" ? option.value ? "Yes" : "No" : option.value === 0 ? "0" : option.value === 1 ? "1 time" : option.value === 2 ? "2 times" : "3 or more"}
                </button>
              ))}
              {current !== null ? (
                <button
                  type="button"
                  onClick={() => setFields((value) => ({ ...value, [field]: null }))}
                >
                  {copy.clearAnswer}
                </button>
              ) : null}
            </fieldset>
          );
        })}
      </fieldset>
      <label>{questionText("symptoms_text", followupQuestions[4].label)}<textarea value={rawText} onChange={(event) => setRawText(event.target.value)} maxLength={1000} /></label>
      {initialNoteRating && initialNoteRating.note === note ? (
        <RatingCircle
          rating={initialNoteRating.rating}
          label={copy.noteCompleteness}
          details={initialNoteRating.details}
          mode={initialNoteRating.mode}
          prompt={initialNoteRating.prompt}
        />
      ) : null}
      <label>{copy.reason}
        <select value={reasonType} onChange={(event) => setReasonType(event.target.value as typeof reasonType)}>
          <option value="">{copy.chooseReason}</option><option value="transcription_error">{copy.reasonTypes.transcription_error}</option><option value="patient_clarified">{copy.reasonTypes.patient_clarified}</option><option value="typo_correction">{copy.reasonTypes.typo_correction}</option><option value="other">{copy.reasonTypes.other}</option>
        </select>
      </label>
      <label>{copy.detail}<textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} /></label>
      <p>
        {copy.lowSymptoms}: {fields.hypoglycemia_symptoms === null ? copy.notRecorded : fields.hypoglycemia_symptoms ? copy.reported : copy.notReported}
        {" · "}{copy.emergencySymptoms}: {fields.emergency_symptoms_mentioned === null ? copy.notRecorded : fields.emergency_symptoms_mentioned ? copy.mentioned : copy.notReported}
      </p>
      <button className="doctor-save-bottom" type="button" onClick={save} disabled={saving}>{saving ? copy.saving : copy.save}</button>
      {mergeNotice ? <p role="status">{mergeNotice}</p> : null}
      {message === copy.saved ? <p role="status" aria-live="polite">{message}</p> : null}
      {message && message !== copy.saved ? <div ref={errorRef} tabIndex={-1} role="alert" aria-live="assertive"><p>{message}</p>{conflictVersion !== null ? <div><button type="button" onClick={() => router.refresh()}>{copy.discard}</button><button type="button" onClick={mergeOntoLatest} disabled={!latestRecord}>{copy.merge}</button></div> : null}</div> : null}
      {conflictVersion !== null ? <p>{copy.latestVersion}: {conflictVersion}.</p> : null}
      {latestRecord ? (
        <aside aria-label={copy.latestRecord}>
          <h3>{copy.latestSaved}</h3>
          <p>{copy.version} {latestRecord.version} · {latestRecord.status} · {latestRecord.priority ?? copy.noPriority}</p>
          <dl>
            {Object.entries(latestRecord.fields).map(([field, value]) => (
              <div key={field}><dt>{questionText(field, questionLabel(field))}</dt><dd>{displayAnswer(value, copy)}</dd></div>
            ))}
          </dl>
          <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{latestRecord.raw_text ?? copy.noText}</pre>
        </aside>
      ) : null}
    </section>
  );
}
