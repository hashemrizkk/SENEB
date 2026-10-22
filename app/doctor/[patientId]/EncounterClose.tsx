"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ar } from "@/lib/strings.ar";
import type { FollowupPlan } from "@/lib/followup-plan";

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

export default function EncounterClose({
  intakeId,
  version,
  note,
  existingDate,
}: {
  intakeId: number;
  version: number;
  note: string;
  existingDate: string | null;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
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
    try {
      const { response, result } = await send({ action: "draft", version, note });
      if (!response.ok || !isDraft(result)) throw new Error("Draft request failed.");
      setDraft(result);
    } catch {
      setMessage("A draft could not be created. The note remains unchanged; try again.");
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
      <button type="button" onClick={createDraft} disabled={!note.trim() || busy}>
        {busy ? "Working…" : "Draft follow-up & close encounter"}
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
          <label>
            Care-gap reminders (one per line)
            <textarea value={draft.plan.care_gap_reminders.join("\n")} onChange={(event) => updatePlan("care_gap_reminders", event.target.value.split("\n").filter(Boolean))} />
          </label>
          <label>
            Patient instructions
            <textarea value={draft.plan.patient_instructions ?? ""} onChange={(event) => updatePlan("patient_instructions", event.target.value || null)} maxLength={400} />
          </label>
          <p>Rationale: {draft.plan.rationale_summary ?? "None drafted."}</p>
          <h4>Patient recap preview {draft.recapEligible ? "" : "(not queued: consent or phone is missing)"}</h4>
          <label>
            Editable recap text
            <textarea value={draft.recap} onChange={(event) => setDraft((current) => current ? { ...current, recap: event.target.value } : current)} maxLength={440} />
          </label>
          <p style={{ whiteSpace: "pre-wrap" }}>{`${ar.visitRecapPrefix} ${draft.recap}\n${ar.emergencyNotice}\n${ar.clinicReviewNote}`}</p>
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
      {message ? <p role="status">{message}</p> : null}
      {existingDate ? <p>Current next visit date: {existingDate}</p> : null}
    </section>
  );
}
