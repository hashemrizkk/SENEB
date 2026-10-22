"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import DoctorDictation from "@/components/DoctorDictation";
import { ar } from "@/lib/strings.ar";
import type { FollowupPlan } from "@/lib/followup-plan";
import { composeRecapBody } from "@/lib/recap-content";
import { requestEncounterDraft } from "@/lib/encounter-draft-request";

type Draft = {
  plan: FollowupPlan;
  recap: string;
  preview: string;
  mode: "mock" | "llm";
  recapEligible: boolean;
};

function isDraft(value: unknown): value is Draft {
  if (value === null || typeof value !== "object") return false;
  return "plan" in value && "recap" in value && typeof value.recap === "string" &&
    "mode" in value && (value.mode === "mock" || value.mode === "llm") &&
    "recapEligible" in value && typeof value.recapEligible === "boolean";
}

function DictatedTextarea({
  label,
  value,
  onChange,
  maxLength,
  rows = 3,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  maxLength?: number;
  rows?: number;
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  return (
    <>
      <label>
        {label}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          maxLength={maxLength}
          rows={rows}
        />
      </label>
      <DoctorDictation
        value={value}
        onChange={onChange}
        textareaRef={textareaRef}
        enableKeyboardShortcut={false}
      />
    </>
  );
}

export default function EncounterClose({
  intakeId,
  version,
  note,
  existingDate,
  followupDraftAvailable,
}: {
  intakeId: number;
  version: number;
  note: string;
  existingDate: string | null;
  followupDraftAvailable: boolean;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [draftError, setDraftError] = useState(false);
  const [cancelId, setCancelId] = useState<number | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = window.setTimeout(() => setSecondsLeft((seconds) => seconds - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [secondsLeft]);

  async function send(body: unknown): Promise<{ response: Response; result: unknown }> {
    const response = await fetch(`/api/doctor/encounters/${intakeId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return { response, result: await response.json() as unknown };
  }

  async function createDraft() {
    if (!note.trim() || busy) return;
    setBusy(true);
    setMessage("");
    setDraftError(false);
    try {
      const result = await requestEncounterDraft(
        fetch,
        `/api/doctor/encounters/${intakeId}`,
        { action: "draft", version, note },
      );
      if (!isDraft(result)) throw new Error("Draft request failed.");
      setDraft(result);
    } catch {
      setDraftError(true);
      setMessage(ar.encounterDraftError);
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!draft || busy) return;
    setBusy(true);
    setMessage("");
    try {
      const { response, result } = await send({
        action: "confirm",
        version,
        note,
        plan: draft.plan,
        recap: draft.recap,
      });
      if (!response.ok || result === null || typeof result !== "object" || !("ok" in result) || result.ok !== true) {
        throw new Error("Confirmation failed.");
      }
      const messageId = "recapMessageId" in result && typeof result.recapMessageId === "number"
        ? result.recapMessageId : null;
      setDraft(null);
      setMessage("Encounter closed. Priority and queue status were left unchanged.");
      router.refresh();
      if (messageId !== null) {
        setCancelId(messageId);
        setSecondsLeft(30);
      }
    } catch {
      setMessage("The encounter could not be closed. Your note remains available; refresh and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function cancelRecap() {
    if (cancelId === null || secondsLeft <= 0) return;
    setBusy(true);
    try {
      const { response } = await send({ action: "cancel-recap", messageId: cancelId });
      if (!response.ok) throw new Error("Cancel failed.");
      setMessage("The queued recap was canceled.");
      setCancelId(null);
      setSecondsLeft(0);
    } catch {
      setMessage("The recap could not be canceled. Check the Messages outbox.");
    } finally {
      setBusy(false);
    }
  }

  function updatePlan<K extends keyof FollowupPlan>(key: K, value: FollowupPlan[K]) {
    setDraft((current) => current ? { ...current, plan: { ...current.plan, [key]: value } } : current);
  }

  return (
    <section aria-label="Close encounter" style={{ marginTop: 16 }}>
      {followupDraftAvailable ? (
        <div role="status">
          <strong>Follow-up draft ready — review</strong>
          <p>This draft is not saved as a follow-up plan until you confirm it.</p>
        </div>
      ) : null}
      <button type="button" onClick={createDraft} disabled={!note.trim() || busy}>
        {busy
            ? "Generating draft…"
            : draftError
              ? "Retry draft / إعادة المحاولة"
            : followupDraftAvailable
              ? "Review follow-up draft"
              : "Draft follow-up & close encounter"}
      </button>
      {draft ? (
        <div role="dialog" aria-modal="true" aria-labelledby="close-encounter-title" style={{ border: "1px solid #777", padding: 16, marginTop: 12 }}>
          <h3 id="close-encounter-title">Review before closing</h3>
          <p>{draft.mode === "mock" ? "MOCK draft — no LLM provider is configured." : "LLM draft — review and confirm every field."}</p>
          <label>
            Follow-up interval (weeks)
            <input type="number" min="1" max="104" value={draft.plan.followup_interval_weeks ?? ""} onChange={(event) => updatePlan("followup_interval_weeks", event.target.value ? Number(event.target.value) : null)} />
          </label>
          <label>
            Next visit date
            <input type="date" value={draft.plan.next_visit_date ?? ""} onChange={(event) => updatePlan("next_visit_date", event.target.value || null)} />
          </label>
          <DictatedTextarea
            label="Care-gap reminders (one per line)"
            value={draft.plan.care_gap_reminders.join("\n")}
            onChange={(value) => updatePlan("care_gap_reminders", value.split("\n").filter(Boolean))}
            maxLength={1_600}
          />
          <h4>Monitoring checklist</h4>
          <ul>
            {draft.plan.monitoring_checklist.map((item, index) => (
              <li key={`${item.source}-${item.item}-${index}`} style={{
                color: item.due_in_days !== null && item.due_in_days <= 0 ? "#b91c1c" : undefined,
                fontWeight: item.due_in_days !== null && item.due_in_days <= 0 ? 700 : undefined,
              }}>
                {item.due_in_days !== null && item.due_in_days <= 0 ? "Overdue · " : ""}
                {item.source === "guideline" ? "Guideline" : "Doctor"}
                <DictatedTextarea
                  label={`${item.item} — due in days (negative means overdue)`}
                  value={item.item}
                  onChange={(value) => updatePlan("monitoring_checklist", draft.plan.monitoring_checklist.map((current, currentIndex) => currentIndex === index ? { ...current, item: value } : current))}
                  maxLength={160}
                  rows={2}
                />
                <label>
                  Due in days
                  <input
                    type="number"
                    value={item.due_in_days ?? ""}
                    onChange={(event) => updatePlan(
                      "monitoring_checklist",
                      draft.plan.monitoring_checklist.map((current, currentIndex) =>
                        currentIndex === index
                          ? { ...current, due_in_days: event.target.value ? Number(event.target.value) : null }
                          : current,
                      ),
                    )}
                  />
                </label>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => updatePlan("monitoring_checklist", [
              ...draft.plan.monitoring_checklist,
              { item: "", due_in_days: null, source: "doctor" },
            ])}
          >
            Add doctor monitoring item
          </button>
          <h4>Medication changes</h4>
          {draft.plan.medication_changes.map((change, index) => (
            <fieldset key={`medication-${index}`}>
              <legend>Medication change {index + 1}</legend>
              <DictatedTextarea
                label="Drug"
                value={change.drug ?? ""}
                onChange={(value) => updatePlan("medication_changes", draft.plan.medication_changes.map((current, currentIndex) => currentIndex === index ? { ...current, drug: value || null } : current))}
                maxLength={100}
                rows={2}
              />
              <DictatedTextarea
                label="Change"
                value={change.change}
                onChange={(value) => updatePlan("medication_changes", draft.plan.medication_changes.map((current, currentIndex) => currentIndex === index ? { ...current, change: value } : current))}
                maxLength={200}
                rows={2}
              />
              <button
                type="button"
                onClick={() => updatePlan(
                  "medication_changes",
                  draft.plan.medication_changes.filter((_, currentIndex) => currentIndex !== index),
                )}
              >
                Remove medication change
              </button>
            </fieldset>
          ))}
          <button
            type="button"
            onClick={() => updatePlan("medication_changes", [
              ...draft.plan.medication_changes,
              { drug: null, change: "" },
            ])}
          >
            Add medication change
          </button>
          <h4 style={{ color: "#b91c1c" }}>Return precautions</h4>
          <DictatedTextarea
            label="Return precautions"
            value={draft.plan.return_precautions ?? ""}
            onChange={(value) => updatePlan("return_precautions", value || null)}
            maxLength={220}
          />
          <DictatedTextarea
            label="Home self-monitoring"
            value={draft.plan.self_monitoring ?? ""}
            onChange={(value) => updatePlan("self_monitoring", value || null)}
            maxLength={300}
          />
          <DictatedTextarea
            label="Patient instructions"
            value={draft.plan.patient_instructions ?? ""}
            onChange={(value) => updatePlan("patient_instructions", value || null)}
            maxLength={400}
          />
          <DictatedTextarea
            label="Rationale summary"
            value={draft.plan.rationale_summary ?? ""}
            onChange={(value) => updatePlan("rationale_summary", value || null)}
            maxLength={240}
          />
          <h4>Patient recap preview {draft.recapEligible ? "" : "(not queued: consent or phone is missing)"}</h4>
          <DictatedTextarea
            label="Editable recap text"
            value={draft.recap}
            onChange={(value) => setDraft((current) => current ? { ...current, recap: value } : current)}
            maxLength={440}
          />
          <p style={{ whiteSpace: "pre-wrap" }}>{composeRecapBody({
            recap: draft.recap,
            returnPrecautions: draft.plan.return_precautions,
            nextVisitDate: draft.plan.next_visit_date ?? existingDate,
            patientInstructions: draft.plan.patient_instructions,
          })}</p>
          <p>The recap stays queued for 30 seconds after confirmation so it can be canceled.</p>
          <button type="button" onClick={confirm} disabled={busy}>Confirm &amp; close encounter</button>
          <button type="button" onClick={() => setDraft(null)} disabled={busy}>Decline draft</button>
        </div>
      ) : null}
      {cancelId !== null && secondsLeft > 0 ? (
        <button type="button" onClick={cancelRecap} disabled={busy}>
          Cancel queued recap ({secondsLeft}s)
        </button>
      ) : null}
      {message ? <p role={draftError ? "alert" : "status"}>{message}</p> : null}
      {existingDate ? <p>Current next visit date: {existingDate}</p> : null}
    </section>
  );
}
