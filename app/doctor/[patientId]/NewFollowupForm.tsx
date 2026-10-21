"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import type { IntakeFields } from "@/lib/intake";
import { followupQuestions } from "@/lib/questions";

type AnswerKey =
  | "missed_doses"
  | "hypoglycemia_episodes"
  | "foot_problem"
  | "vision_change";

type FollowupAnswers = Pick<IntakeFields, AnswerKey>;

const EMPTY_ANSWERS: FollowupAnswers = {
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

function isSavedResponse(value: unknown): value is { ok: true; intake_id: number } {
  return value !== null &&
    typeof value === "object" &&
    "ok" in value &&
    value.ok === true &&
    "intake_id" in value &&
    typeof value.intake_id === "number" &&
    Number.isSafeInteger(value.intake_id) &&
    value.intake_id > 0;
}

export default function NewFollowupForm({ patientId }: { patientId: number }) {
  const router = useRouter();
  const [answers, setAnswers] = useState<FollowupAnswers>(EMPTY_ANSWERS);
  const [freeText, setFreeText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedIntakeId, setSavedIntakeId] = useState<number | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const [confirmedHistoryCheck, setConfirmedHistoryCheck] = useState(false);

  function updateAnswer(field: AnswerKey, value: boolean | number) {
    setAnswers((current) => ({
      ...current,
      [field]: current[field] === value ? null : value,
    }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || (uncertain && !confirmedHistoryCheck)) return;

    setSaving(true);
    setError(null);
    setUncertain(false);
    setConfirmedHistoryCheck(false);

    try {
      const response = await fetch(`/api/doctor/patients/${patientId}/intakes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patient_id: patientId,
          tap_missed_doses: answers.missed_doses,
          tap_hypo_episodes: answers.hypoglycemia_episodes,
          tap_foot_problem: answers.foot_problem,
          tap_vision_change: answers.vision_change,
          free_text: freeText.trim() || null,
          input_method: freeText.trim() ? "typed" : "tap",
        }),
      });
      const result: unknown = await response.json().catch(() => null);

      if (response.ok && isSavedResponse(result)) {
        setSavedIntakeId(result.intake_id);
        router.refresh();
        return;
      }

      if (response.status === 400) {
        setError("Some answers could not be accepted. Check the selected answers and try again.");
      } else if (response.status === 401 || response.status === 403) {
        setError("Your staff session may have expired. Sign in again before saving this follow-up.");
      } else if (response.status === 404) {
        setError("This patient record could not be found. Return to the review queue and open the patient again.");
      } else if (response.status === 429) {
        setError("There have been several requests. Wait a little before trying again.");
      } else {
        setUncertain(true);
        setError("The save was not confirmed. It may already be in the record history; check there before deciding whether to retry.");
      }
    } catch {
      setUncertain(true);
      setError("The connection ended before the save was confirmed. It may already be in the record history; check there before deciding whether to retry.");
    } finally {
      setSaving(false);
    }
  }

  function startAnother() {
    setAnswers(EMPTY_ANSWERS);
    setFreeText("");
    setSavedIntakeId(null);
    setError(null);
    setUncertain(false);
    setConfirmedHistoryCheck(false);
  }

  return (
    <section
      aria-busy={saving}
      style={{
        border: "1px solid #cbd5e1",
        borderRadius: 12,
        marginTop: 24,
        padding: 20,
      }}
    >
      <h2>Record a new clinic follow-up</h2>
      <p>This creates a separate record and does not replace registration or earlier follow-ups.</p>

      {savedIntakeId !== null ? (
        <div role="status" aria-live="polite">
          <p>Follow-up saved successfully.</p>
          <p><Link href={`/doctor/${patientId}?intakeId=${savedIntakeId}`}>View the saved follow-up</Link></p>
          <button type="button" onClick={startAnother}>Record another follow-up</button>
        </div>
      ) : (
        <form onSubmit={submit}>
          {followupQuestions.slice(0, 4).map((question) => {
            const field = question.structuredField;
            if (!isAnswerKey(field)) return null;
            const selected = answers[field];
            return (
              <fieldset key={question.id} dir="rtl" style={{ border: 0, margin: "0 0 16px", padding: 0 }}>
                <legend style={{ fontWeight: 600, marginBottom: 8 }}>{question.label}</legend>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {question.options.map((option) => (
                    <button
                      aria-pressed={selected === option.value}
                      key={String(option.value)}
                      onClick={() => updateAnswer(field, option.value)}
                      style={{
                        background: selected === option.value ? "#dbeafe" : "#fff",
                        border: selected === option.value ? "2px solid #1d4ed8" : "1px solid #64748b",
                        borderRadius: 8,
                        color: "#172033",
                        cursor: "pointer",
                        minHeight: 44,
                        minWidth: 72,
                        padding: "8px 14px",
                      }}
                      type="button"
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </fieldset>
            );
          })}

          <label htmlFor="followup-free-text">ملاحظات إضافية (اختياري)</label>
          <textarea
            dir="rtl"
            id="followup-free-text"
            maxLength={500}
            onChange={(event) => setFreeText(event.target.value)}
            style={{ boxSizing: "border-box", display: "block", margin: "8px 0", maxWidth: "100%", minHeight: 100, padding: 10, width: "100%" }}
            value={freeText}
          />
          <p>{freeText.length}/500</p>

          {error ? (
            <div role="alert" aria-live="assertive" style={{ background: "#fef2f2", border: "1px solid #b91c1c", borderRadius: 8, color: "#7f1d1d", margin: "12px 0", padding: 12 }}>
              <p>{error}</p>
              {uncertain ? (
                <label>
                  <input
                    checked={confirmedHistoryCheck}
                    onChange={(event) => setConfirmedHistoryCheck(event.target.checked)}
                    type="checkbox"
                  />{" "}
                  I checked the follow-up history and confirmed no matching record was saved.
                </label>
              ) : null}
            </div>
          ) : null}

          <button
            disabled={saving || (uncertain && !confirmedHistoryCheck)}
            style={{ cursor: saving || (uncertain && !confirmedHistoryCheck) ? "not-allowed" : "pointer", minHeight: 44, padding: "10px 16px" }}
            type="submit"
          >
            {saving ? "Saving follow-up…" : uncertain && !confirmedHistoryCheck ? "Check history before retrying" : "Save follow-up"}
          </button>
        </form>
      )}
    </section>
  );
}
