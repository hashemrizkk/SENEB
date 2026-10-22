"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { PatientContact } from "@/lib/db";
import {
  createFollowupPlanSchema,
  type FollowupPlan,
} from "@/lib/followup-plan";
import { intakeFieldsSchema, type IntakeFields } from "@/lib/intake";
import { followupQuestions } from "@/lib/questions";
import { ar } from "@/lib/strings.ar";

type AnswerKey = "missed_doses" | "hypoglycemia_episodes" | "foot_problem" | "vision_change";
type Taps = Pick<IntakeFields, AnswerKey>;
type PlanDraft = {
  fields: IntakeFields;
  plan: FollowupPlan;
  recap: string;
  preview: string;
  mode: "mock" | "llm";
  recapEligible: boolean;
};

const EMPTY_TAPS: Taps = {
  missed_doses: null,
  hypoglycemia_episodes: null,
  foot_problem: null,
  vision_change: null,
};

function isAnswerKey(value: string | null): value is AnswerKey {
  return value === "missed_doses" ||
    value === "hypoglycemia_episodes" ||
    value === "foot_problem" ||
    value === "vision_change";
}

function isPlanDraft(value: unknown, note: string, existingDate: string | null): value is PlanDraft {
  if (value === null || typeof value !== "object") return false;
  if (!("fields" in value) || !intakeFieldsSchema.safeParse(value.fields).success) return false;
  if (!("plan" in value)) return false;
  if (!createFollowupPlanSchema(note, existingDate).safeParse(value.plan).success) return false;
  return "recap" in value && typeof value.recap === "string" &&
    "preview" in value && typeof value.preview === "string" &&
    "mode" in value && (value.mode === "mock" || value.mode === "llm") &&
    "recapEligible" in value && typeof value.recapEligible === "boolean";
}

function isSaved(value: unknown): value is {
  ok: true;
  intake_id: number;
  duplicate: boolean;
} {
  return value !== null && typeof value === "object" &&
    "ok" in value && value.ok === true &&
    "intake_id" in value && typeof value.intake_id === "number" &&
    Number.isSafeInteger(value.intake_id) && value.intake_id > 0 &&
    "duplicate" in value && typeof value.duplicate === "boolean";
}

export default function RecordFollowupForm({
  patient,
  savedClinicianNote,
}: {
  patient: PatientContact;
  savedClinicianNote: string;
}) {
  const router = useRouter();
  const errorRef = useRef<HTMLDivElement>(null);
  const [answers, setAnswers] = useState<Taps>(EMPTY_TAPS);
  const [fields, setFields] = useState<IntakeFields | null>(null);
  const [draft, setDraft] = useState<PlanDraft | null>(null);
  const [step, setStep] = useState<1 | 2>(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [requestId, setRequestId] = useState<string | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const [confirmedHistoryCheck, setConfirmedHistoryCheck] = useState(false);
  const [savedIntakeId, setSavedIntakeId] = useState<number | null>(null);

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  function updateAnswer(key: AnswerKey, value: boolean | number) {
    setAnswers((current) => ({
      ...current,
      [key]: current[key] === value ? null : value,
    }));
  }

  async function extract() {
    if (busy || (uncertain && !confirmedHistoryCheck)) return;
    setBusy(true);
    setError(null);
    setStatus("Preparing the follow-up review…");
    setUncertain(false);
    setConfirmedHistoryCheck(false);
    try {
      const response = await fetch(`/api/doctor/patients/${patient.id}/intakes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "extract",
          patient_id: patient.id,
          tap_answers: answers,
          note: savedClinicianNote,
        }),
      });
      const result: unknown = await response.json().catch(() => null);
      if (!response.ok || !isPlanDraft(result, savedClinicianNote.trim(), patient.next_visit_date)) {
        throw new Error(
          result !== null && typeof result === "object" &&
            "error" in result && typeof result.error === "string"
            ? result.error
          : "The follow-up draft could not be prepared. The saved clinician note remains unchanged; try again.",
        );
      }
      setDraft(result);
      setFields(result.fields);
      setRequestId(crypto.randomUUID());
      setStep(2);
      setStatus(result.mode === "mock"
        ? "MOCK extraction and plan — no LLM provider was used. Review every field."
        : "LLM extraction and plan ready. Review every field before saving.");
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "The follow-up could not be prepared.");
      setStatus("");
    } finally {
      setBusy(false);
    }
  }

  function updatePlan<K extends keyof FollowupPlan>(key: K, value: FollowupPlan[K]) {
    setDraft((current) => current
      ? { ...current, plan: { ...current.plan, [key]: value } }
      : current);
  }

  async function save() {
    if (!draft || fields === null || !requestId || busy) return;
    if (uncertain && !confirmedHistoryCheck) return;
    setBusy(true);
    setError(null);
    setStatus("Saving the clinic follow-up…");
    try {
      const response = await fetch(`/api/doctor/patients/${patient.id}/intakes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "confirm",
          patient_id: patient.id,
          request_id: requestId,
          input_method: savedClinicianNote.trim() ? "typed" : "tap",
          tap_answers: answers,
          note: savedClinicianNote,
          fields,
          plan: draft.plan,
          recap: draft.recap,
        }),
      });
      const result: unknown = await response.json().catch(() => null);
      if (response.ok && isSaved(result)) {
        setSavedIntakeId(result.intake_id);
        setUncertain(false);
        setStatus(result.duplicate
          ? "This follow-up was already saved; no duplicate was created."
          : "Follow-up saved successfully.");
        router.refresh();
        return;
      }
      const message = result !== null && typeof result === "object" &&
        "error" in result && typeof result.error === "string"
        ? result.error
        : "The save could not be confirmed.";
      if (response.status >= 500) {
        setUncertain(true);
        setConfirmedHistoryCheck(false);
        setError(`${message} It may already be in the record history; check there before retrying.`);
      } else {
        setError(message);
      }
      setStatus("");
    } catch {
      setUncertain(true);
      setConfirmedHistoryCheck(false);
      setStatus("");
      setError("The connection ended before the save was confirmed. Check the follow-up history before deciding whether to retry.");
    } finally {
      setBusy(false);
    }
  }

  function startAnother() {
    setAnswers(EMPTY_TAPS);
    setFields(null);
    setDraft(null);
    setStep(1);
    setRequestId(null);
    setError(null);
    setStatus("");
    setUncertain(false);
    setConfirmedHistoryCheck(false);
    setSavedIntakeId(null);
  }

  return (
    <section
      aria-busy={busy}
      style={{ border: "1px solid #cbd5e1", borderRadius: 12, marginTop: 24, padding: 20 }}
    >
      <h2>Record a new clinic follow-up</h2>
      <p>This form uses the latest saved clinician note from the edit section, if available. Save note changes there before extracting.</p>
      {savedIntakeId !== null ? (
        <div role="status" aria-live="polite">
          <p>{status}</p>
          <p><Link href={`/doctor/${patient.id}?intakeId=${savedIntakeId}`}>View the saved follow-up</Link></p>
          <button type="button" onClick={startAnother}>Record another follow-up</button>
        </div>
      ) : (
        <>
          <p>Step {step} of 2: {step === 1 ? "Input" : "Review and save"}</p>
          {step === 1 ? (
            <div>
              {followupQuestions.slice(0, 4).map((question) => {
                const field = question.structuredField;
                if (!isAnswerKey(field)) return null;
                return (
                  <fieldset key={question.id} dir="rtl" style={{ border: 0, margin: "0 0 16px", padding: 0 }}>
                    <legend style={{ fontWeight: 600, marginBottom: 8 }}>{question.label}</legend>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {question.options.map((option) => (
                        <button
                          key={String(option.value)}
                          type="button"
                          aria-pressed={answers[field] === option.value}
                          disabled={uncertain}
                          onClick={() => updateAnswer(field, option.value)}
                          style={{
                            border: answers[field] === option.value ? "2px solid #1d4ed8" : "1px solid #64748b",
                            borderRadius: 8,
                            minHeight: 48,
                            padding: "8px 14px",
                          }}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </fieldset>
                );
              })}
              <button type="button" disabled={busy || (uncertain && !confirmedHistoryCheck)} onClick={() => void extract()}>
                {busy ? "Extracting…" : ar.doctorFollowup.extractLabel}
              </button>
            </div>
          ) : null}

          {step === 2 && draft && fields ? (
            <div>
              <p>{draft.mode === "mock" ? "MOCK draft — no LLM provider was used." : "LLM draft — review and confirm each field."}</p>
              <h3>Extracted answers</h3>
              {followupQuestions.slice(0, 4).map((question) => {
                const field = question.structuredField;
                if (!isAnswerKey(field)) return null;
                return (
                  <fieldset key={question.id} dir="rtl" style={{ border: 0, margin: "0 0 16px", padding: 0 }}>
                    <legend style={{ fontWeight: 600, marginBottom: 8 }}>{question.label}</legend>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {question.options.map((option) => (
                        <button
                          key={String(option.value)}
                          type="button"
                          aria-pressed={fields[field] === option.value}
                          disabled={uncertain}
                          onClick={() => setFields((current) => current
                            ? { ...current, [field]: current[field] === option.value ? null : option.value }
                            : current)}
                          style={{
                            border: fields[field] === option.value ? "2px solid #1d4ed8" : "1px solid #64748b",
                            borderRadius: 8,
                            minHeight: 48,
                            padding: "8px 14px",
                          }}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </fieldset>
                );
              })}

              <h3>Follow-up plan</h3>
              <label>
                Follow-up interval (weeks)
                <input
                  type="number"
                  min="1"
                  max="104"
                  disabled={uncertain}
                  value={draft.plan.followup_interval_weeks ?? ""}
                  onChange={(event) => updatePlan("followup_interval_weeks", event.target.value ? Number(event.target.value) : null)}
                />
              </label>
              <label>
                Next visit date
                <input
                  type="date"
                  disabled={uncertain}
                  value={draft.plan.next_visit_date ?? ""}
                  onChange={(event) => updatePlan("next_visit_date", event.target.value || null)}
                />
              </label>
              <label>
                Care-gap reminders (one per line)
                <textarea
                  disabled={uncertain}
                  value={draft.plan.care_gap_reminders.join("\n")}
                  onChange={(event) => updatePlan("care_gap_reminders", event.target.value.split("\n"))}
                />
              </label>
              <h4>Monitoring checklist</h4>
              {draft.plan.monitoring_checklist.map((item, index) => (
                <fieldset key={`monitor-${index}`}>
                  <legend>{item.source === "guideline" ? "Guideline item" : "Doctor item"}</legend>
                  <label>
                    Item
                    <input
                      value={item.item}
                      maxLength={160}
                      disabled={uncertain}
                      onChange={(event) => updatePlan("monitoring_checklist", draft.plan.monitoring_checklist.map((current, currentIndex) =>
                        currentIndex === index ? { ...current, item: event.target.value } : current))}
                    />
                  </label>
                  <label>
                    Due in days (negative means overdue)
                    <input
                      type="number"
                      value={item.due_in_days ?? ""}
                      disabled={uncertain}
                      onChange={(event) => updatePlan("monitoring_checklist", draft.plan.monitoring_checklist.map((current, currentIndex) =>
                        currentIndex === index ? { ...current, due_in_days: event.target.value ? Number(event.target.value) : null } : current))}
                    />
                  </label>
                  <button
                    type="button"
                    disabled={uncertain}
                    onClick={() => updatePlan("monitoring_checklist", draft.plan.monitoring_checklist.filter((_, currentIndex) => currentIndex !== index))}
                  >
                    Remove item
                  </button>
                </fieldset>
              ))}
              <button
                type="button"
                disabled={uncertain}
                onClick={() => updatePlan("monitoring_checklist", [
                  ...draft.plan.monitoring_checklist,
                  { item: "", due_in_days: null, source: "doctor" },
                ])}
              >
                Add monitoring item
              </button>
              <h4>Medication changes</h4>
              {draft.plan.medication_changes.map((change, index) => (
                <fieldset key={`medication-${index}`}>
                  <legend>Medication change {index + 1}</legend>
                  <label>
                    Drug
                    <input
                      value={change.drug ?? ""}
                      maxLength={100}
                      disabled={uncertain}
                      onChange={(event) => updatePlan("medication_changes", draft.plan.medication_changes.map((current, currentIndex) =>
                        currentIndex === index ? { ...current, drug: event.target.value || null } : current))}
                    />
                  </label>
                  <label>
                    Change
                    <input
                      value={change.change}
                      maxLength={200}
                      disabled={uncertain}
                      onChange={(event) => updatePlan("medication_changes", draft.plan.medication_changes.map((current, currentIndex) =>
                        currentIndex === index ? { ...current, change: event.target.value } : current))}
                    />
                  </label>
                  <button
                    type="button"
                    disabled={uncertain}
                    onClick={() => updatePlan("medication_changes", draft.plan.medication_changes.filter((_, currentIndex) => currentIndex !== index))}
                  >
                    Remove change
                  </button>
                </fieldset>
              ))}
              <button
                type="button"
                disabled={uncertain}
                onClick={() => updatePlan("medication_changes", [
                  ...draft.plan.medication_changes,
                  { drug: null, change: "" },
                ])}
              >
                Add medication change
              </button>
              {([
                ["return_precautions", "Return precautions"],
                ["self_monitoring", "Self-monitoring"],
                ["patient_instructions", "Patient instructions"],
                ["rationale_summary", "Rationale summary"],
              ] as const).map(([key, label]) => (
                <label key={key}>
                  {label}
                  <textarea
                    maxLength={key === "self_monitoring" ? 300 : key === "patient_instructions" ? 400 : 240}
                    disabled={uncertain}
                    value={draft.plan[key] ?? ""}
                    onChange={(event) => updatePlan(key, event.target.value || null)}
                  />
                </label>
              ))}
              <label>
                Editable recap preview
                <textarea
                  value={draft.recap}
                  maxLength={440}
                  disabled={uncertain}
                  onChange={(event) => setDraft((current) => current
                    ? { ...current, recap: event.target.value }
                    : current)}
                />
              </label>
              {!draft.recapEligible ? <p>No recap will be queued because phone or messaging consent is not recorded.</p> : null}
              <details>
                <summary>Message preview</summary>
                <p>{draft.preview}</p>
              </details>
              <button type="button" disabled={busy || (uncertain && !confirmedHistoryCheck)} onClick={() => void save()}>
                {busy ? "Saving…" : uncertain && !confirmedHistoryCheck ? "Check history before retrying" : "Save follow-up"}
              </button>
              <button type="button" disabled={busy || uncertain} onClick={() => {
                setStep(1);
                setError(null);
                setStatus("");
                setRequestId(null);
              }}>
                Back to input
              </button>
            </div>
          ) : null}

          {error ? (
            <div
              ref={errorRef}
              tabIndex={-1}
              role="alert"
              aria-live="assertive"
              style={{ background: "#fef2f2", border: "1px solid #b91c1c", borderRadius: 8, color: "#7f1d1d", margin: "12px 0", padding: 12 }}
            >
              <p>{error}</p>
              {uncertain ? (
                <label>
                  <input
                    type="checkbox"
                    checked={confirmedHistoryCheck}
                    onChange={(event) => setConfirmedHistoryCheck(event.target.checked)}
                  />{" "}
                  I checked the follow-up history and confirmed no matching record was saved.
                </label>
              ) : null}
            </div>
          ) : null}
          {status ? <p role="status" aria-live="polite">{status}</p> : null}
        </>
      )}
    </section>
  );
}
