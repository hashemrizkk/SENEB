"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import DoctorDictation from "@/components/DoctorDictation";
import EncounterClose from "./EncounterClose";
import type { PatientContact, PatientIntakeRecord } from "@/lib/db";
import { intakeFieldsSchema, type IntakeFields } from "@/lib/intake";
import { followupQuestions, questionLabel } from "@/lib/questions";
import RatingCircle from "@/components/RatingCircle";

type NoteRatingDisplay = {
  rating: "green" | "yellow" | "red";
  details: string[];
  mode: "llm" | "mock" | "fallback";
  note: string;
};

type EditableField = "missed_doses" | "hypoglycemia_episodes" | "foot_problem" | "vision_change";
type LatestRecordPreview = {
  version: number;
  status: "new" | "triaged" | "seen";
  priority: "urgent" | "important" | "normal" | null;
  fields: IntakeFields;
  raw_text: string | null;
};

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

function displayAnswer(value: boolean | number | string | null): string {
  if (value === null) return "Not answered";
  if (typeof value === "string") return value || "Not recorded";
  if (typeof value === "number") return String(value);
  return value ? "Yes" : "No";
}

function isStatus(value: string): value is PatientIntakeRecord["status"] {
  return value === "new" || value === "triaged" || value === "seen";
}

export default function ReviewEditForm({
  intake,
  patient,
  followupDraftAvailable,
  initialNoteRating,
}: {
  intake: PatientIntakeRecord;
  patient: PatientContact;
  followupDraftAvailable: boolean;
  initialNoteRating: NoteRatingDisplay | null;
}) {
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
  const [draftReady, setDraftReady] = useState(followupDraftAvailable);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [conflictVersion, setConflictVersion] = useState<number | null>(null);
  const [latestRecord, setLatestRecord] = useState<LatestRecordPreview | null>(null);

  async function save() {
    if (saving) return;
    setSaving(true);
    setMessage(null);
    setConflictVersion(null);
    setLatestRecord(null);
    try {
      const response = await fetch(`/api/doctor/intakes/${intake.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          version: intake.version,
          patient: { name, phone, email, self_description: selfDescription },
          fields,
          raw_text: rawText || null,
          priority: priority || null,
          status,
          note,
          reason,
        }),
      });
      const result: unknown = await response.json();
      if (response.ok) {
        setMessage("Changes saved and added to revision history.");
        if (
          result !== null &&
          typeof result === "object" &&
          "noteChanged" in result &&
          result.noteChanged === true
        ) {
          setDraftReady(true);
        }
        setReason("");
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
        setMessage("Another clinician saved this intake first. Your unsaved edits are preserved, and the latest record is shown below.");
      } else {
        setMessage(responseMessage(result) ?? "The changes could not be saved.");
      }
    } catch {
      setMessage("The request failed. Your edits remain in this form; try again.");
    } finally {
      setSaving(false);
    }
  }

  function updateField(key: EditableField, value: boolean | number) {
    setFields((current) => ({ ...current, [key]: value }));
  }

  return (
    <section style={{ borderTop: "1px solid #ccc", marginTop: 24, paddingTop: 16 }}>
      <h2>Edit intake and patient information</h2>
      <p>Saving creates a revision. Staff priority is a decision, not an automatic diagnosis.</p>
      <label>Patient name<input value={name} onChange={(event) => setName(event.target.value)} maxLength={100} /></label>
      <label>Phone<input value={phone} onChange={(event) => setPhone(event.target.value)} maxLength={30} /></label>
      <label>Email<input value={email} onChange={(event) => setEmail(event.target.value)} maxLength={254} /></label>
      <label>Patient description<textarea value={selfDescription} onChange={(event) => setSelfDescription(event.target.value)} maxLength={300} /></label>
      <fieldset>
        <legend>Questionnaire answers</legend>
        {followupQuestions.slice(0, 4).map((question) => {
          const field = question.structuredField;
          if (!isEditableField(field)) return null;
          const current = fieldValue(fields, field);
          return (
            <fieldset key={question.id}>
              <legend>{question.label}</legend>
              {question.options.map((option) => (
                <button
                  key={String(option.value)}
                  type="button"
                  aria-pressed={current === option.value}
                  onClick={() => updateField(field, option.value)}
                  style={{ fontWeight: current === option.value ? "bold" : "normal", marginInlineEnd: 8 }}
                >
                  {option.label}
                </button>
              ))}
              {current !== null ? (
                <button
                  type="button"
                  onClick={() => setFields((value) => ({ ...value, [field]: null }))}
                >
                  Clear answer
                </button>
              ) : null}
            </fieldset>
          );
        })}
      </fieldset>
      <label>{followupQuestions[4].label}<textarea value={rawText} onChange={(event) => setRawText(event.target.value)} maxLength={1000} /></label>
      <label>
        Queue state
        <select value={status} onChange={(event) => {
          if (isStatus(event.target.value)) setStatus(event.target.value);
        }}>
          <option value="new">New</option><option value="triaged">Triaged</option><option value="seen">Seen</option>
        </select>
      </label>
      <label>
        Clinician priority
        <select value={priority} onChange={(event) => setPriority(event.target.value)}>
          <option value="">Not assigned</option><option value="urgent">Urgent</option><option value="important">Important</option><option value="normal">Normal</option>
        </select>
      </label>
      <label htmlFor="clinician-note">Clinician note (optional)</label>
      <textarea
        id="clinician-note"
        ref={noteRef}
        value={note}
        onChange={(event) => setNote(event.target.value)}
        maxLength={4000}
      />
      {initialNoteRating && initialNoteRating.note === note ? (
        <RatingCircle
          rating={initialNoteRating.rating}
          label="Note completeness"
          details={initialNoteRating.details}
          mode={initialNoteRating.mode}
        />
      ) : null}
      <DoctorDictation value={note} onChange={setNote} textareaRef={noteRef} />
      <label>Reason for changes (optional)<textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} /></label>
      <p>
        Low-sugar symptoms: {fields.hypoglycemia_symptoms === null ? "not recorded" : fields.hypoglycemia_symptoms ? "reported" : "not reported"}
        {" · "}Emergency symptoms: {fields.emergency_symptoms_mentioned === null ? "not recorded" : fields.emergency_symptoms_mentioned ? "mentioned" : "not mentioned"}
      </p>
      <button type="button" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save changes"}</button>
      <EncounterClose
        intakeId={intake.id}
        version={intake.version}
        note={note}
        existingDate={patient.next_visit_date}
        followupDraftAvailable={draftReady || followupDraftAvailable}
      />
      {message ? <p role="status">{message}</p> : null}
      {conflictVersion !== null ? <p>Latest server version: {conflictVersion}.</p> : null}
      {latestRecord ? (
        <aside aria-label="Latest saved record">
          <h3>Latest saved server record (read-only)</h3>
          <p>Version {latestRecord.version} · {latestRecord.status} · {latestRecord.priority ?? "No priority assigned"}</p>
          <dl>
            {Object.entries(latestRecord.fields).map(([field, value]) => (
              <div key={field}><dt>{questionLabel(field)}</dt><dd>{displayAnswer(value)}</dd></div>
            ))}
          </dl>
          <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{latestRecord.raw_text ?? "No text submitted"}</pre>
        </aside>
      ) : null}
    </section>
  );
}
