import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { getPatientRecord, type PatientIntakeRecord } from "@/lib/db";
import { requireDoctorSession } from "@/lib/doctor-review";
import { formatCairoDateTime } from "@/lib/date-time";
import { flagLabel, followupQuestions, questionLabel } from "@/lib/questions";
import { intakeFieldsSchema } from "@/lib/intake";
import NewFollowupForm from "./NewFollowupForm";
import ReviewEditForm from "./ReviewEditForm";

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

function displayAnswer(value: boolean | number | null): string {
  if (value === null) return "Not answered";
  if (typeof value === "number") return String(value);
  return value ? "Yes" : "No";
}

function displayFieldValue(value: boolean | number | string | null): string {
  if (typeof value === "string") return value || "Not recorded";
  return displayAnswer(value);
}

function displayTime(value: string | null): string {
  return value ? formatCairoDateTime(value) : "Unknown";
}

const revisionSnapshotSchema = z.object({
  patient: z.object({ name: z.string() }),
  intake: z.object({
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
  searchParams: Promise<{ intakeId?: string }>;
}) {
  await requireDoctorSession();
  const [{ patientId: rawPatientId }, { intakeId }] = await Promise.all([params, searchParams]);
  const patientId = Number(rawPatientId);
  if (!Number.isSafeInteger(patientId) || patientId < 1) notFound();
  const record = getPatientRecord(patientId);
  if (!record) notFound();
  const intake = selectedIntake(record.intakes, intakeId);

  return (
    <main style={{ maxWidth: 1000, margin: "0 auto", padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <p><Link href="/doctor">← Review queue</Link></p>
      <header>
        <h1>Review: {record.patient.name}</h1>
        <p>Reference: {record.patient.reference_code ?? "Not available"}</p>
        {intake ? (
          <>
            <p>Selected record submitted {displayTime(intake.created_at)}</p>
            <p>Status: {intake.status} · Staff priority: {intake.priority ?? "Not assigned"} · Version: {intake.version}</p>
          </>
        ) : <p>This patient does not have an intake yet.</p>}
        <p>Age: {record.patient.age ?? "Not recorded"} · Diabetes: {record.patient.diabetes_type ?? "Not recorded"}</p>
        <p><Link href={`/doctor/${patientId}/summary`}>Open case summary</Link></p>
      </header>
      <section id="intake-history">
        <h2>Follow-up record history</h2>
        {record.intakes.length ? (
          <ol>
            {record.intakes.map((item, index) => {
              const initialRevision = item.revisions.find((revision) => revision.revision === 1);
              const label = initialRevision?.source === "clinician"
                ? "Clinic follow-up"
                : index === record.intakes.length - 1
                  ? "Initial registration record"
                  : "Patient-submitted follow-up";
              return (
                <li key={item.id} aria-current={item.id === intake?.id ? "page" : undefined}>
                  <Link href={`/doctor/${patientId}?intakeId=${item.id}`}>
                    {label} · {displayTime(item.created_at)}
                  </Link>
                  {item.id === intake?.id ? " (currently selected)" : null}
                </li>
              );
            })}
          </ol>
        ) : <p>No follow-up records yet.</p>}
      </section>
      {intake ? (
        <>
          {intake.meta?.needs_review ? (
            <p role="status" style={{ background: "#fff7d6", padding: 12 }}>Extraction needs clinician review.</p>
          ) : null}
          {intake.meta?.contradiction ? (
            <p role="status" style={{ background: "#fff7d6", padding: 12 }}>Potentially conflicting information was detected.</p>
          ) : null}
          <section>
            <h2>Patient answers</h2>
            <dl>
              {followupQuestions.slice(0, 4).map((question) => (
                <div key={question.id}>
                  <dt>{question.label}</dt>
                  <dd>{displayAnswer(answerForField(intake, question.structuredField))}</dd>
                </div>
              ))}
              <dt>{questionLabel("hypoglycemia_symptoms")}</dt>
              <dd>{displayAnswer(intake.fields.hypoglycemia_symptoms)}</dd>
              <dt>{questionLabel("emergency_symptoms_mentioned")}</dt>
              <dd>{displayAnswer(intake.fields.emergency_symptoms_mentioned)}</dd>
              <dt>{questionLabel("symptoms_text")}</dt>
              <dd>{intake.fields.symptoms_text ?? "Not recorded"}</dd>
            </dl>
            {intake.input_method === "typed" && intake.fields.hypoglycemia_episodes !== null ? (
              <p>
                Some older registration submissions converted a yes/no low-sugar answer to 1/0.
                This record does not identify that source, so the stored value is shown as
                recorded and its original yes/no meaning cannot be recovered.
              </p>
            ) : null}
            <h3>Flags to review</h3>
            {intake.flags.flags.length ? (
              <ul>{intake.flags.flags.map((flag) => <li key={flag}>{flagLabel(flag)}</li>)}</ul>
            ) : <p>No rule flags.</p>}
            {intake.unansweredCount ? <p>{intake.unansweredCount} unanswered questions.</p> : null}
            <h3>Submitted patient text</h3>
            <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{intake.raw_text ?? "No text submitted"}</pre>
          </section>
          <ReviewEditForm key={`${intake.id}:${intake.version}`} intake={intake} patient={record.patient} />
          <section>
            <h2>Revision history for this record</h2>
            <ol>
              {intake.revisions.map((revision) => {
                const snapshot = revisionSnapshot(revision.snapshot_json);
                const changedFields = z.array(z.string()).parse(
                  JSON.parse(revision.changed_fields_json) as unknown,
                );
                return (
                  <li key={revision.id}>
                    <strong>Revision {revision.revision}</strong> · {revision.source} · {displayTime(revision.edited_at)} · {revision.edited_by ?? "Patient"}
                    {revision.reason ? <p>Reason: {revision.reason}</p> : null}
                    {revision.is_backfill ? (
                      <p>This is a reconstructed current-state snapshot; it is not the original submission.</p>
                    ) : null}
                    <details>
                      <summary>View saved record values</summary>
                      <p>Patient name: {snapshot.patient.name}</p>
                      <p>Queue status: {snapshot.intake.status} · Priority: {snapshot.intake.priority ?? "Not assigned"}</p>
                      <h4>Saved answers</h4>
                      {snapshot.fields ? (
                        <dl>
                          {Object.entries(snapshot.fields).map(([field, value]) => (
                            <div key={field}><dt>{questionLabel(field)}</dt><dd>{displayFieldValue(value)}</dd></div>
                          ))}
                        </dl>
                      ) : <p>Structured answers were not recorded in this revision.</p>}
                      <h4>Saved free text</h4>
                      <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{snapshot.intake.raw_text ?? "No text submitted"}</pre>
                    </details>
                    {revision.revision > 1 ? <p>Changed fields: {changedFields.join(", ") || "No field changes recorded"}</p> : null}
                  </li>
                );
              })}
            </ol>
          </section>
          {intake.doctorNotes.length ? (
            <section>
              <h2>Clinician notes</h2>
              <ul>
                {intake.doctorNotes.map((note) => (
                  <li key={note.id}>{note.note_text} — {note.edited_by} · {displayTime(note.created_at)}</li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      ) : null}
      <NewFollowupForm patientId={patientId} />
    </main>
  );
}
