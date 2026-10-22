"use client";

import { useState } from "react";
import {
  nurseSurveyDecisionLabels,
  nurseSurveyDecisionSchema,
  type NurseSurveyDecision,
} from "@/lib/survey/nurse-actions";

export default function NurseSurveyDecisionForm({
  submissionId,
  initialDecision,
  initialStatus,
  emailReady,
}: {
  submissionId: number;
  initialDecision: NurseSurveyDecision | null;
  initialStatus: "not_sent" | "sending" | "accepted" | "failed";
  emailReady: boolean;
}) {
  const [decision, setDecision] = useState<NurseSurveyDecision | "">(initialDecision ?? "");
  const [assessmentConfirmed, setAssessmentConfirmed] = useState(false);
  const [status, setStatus] = useState(initialStatus);
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(sendEmail: boolean): Promise<void> {
    if (!decision || !assessmentConfirmed || busy) return;
    setBusy(true);
    setFeedback("");
    try {
      const response = await fetch("/api/nurse/survey-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          submission_id: submissionId,
          decision,
          assessment_confirmed: assessmentConfirmed,
          send_email: sendEmail,
        }),
      });
      const result: unknown = await response.json();
      if (
        !response.ok ||
        result === null ||
        typeof result !== "object" ||
        !("ok" in result) ||
        result.ok !== true
      ) {
        const message = result !== null && typeof result === "object" &&
          "error" in result && typeof result.error === "string"
          ? result.error
          : "The action could not be saved. Try again.";
        if (sendEmail && response.status >= 500) setStatus("failed");
        setFeedback(message);
        return;
      }
      if ("email" in result && result.email === "accepted") {
        setStatus("accepted");
        setFeedback("Decision saved. The email provider accepted the request; delivery is not confirmed.");
      } else if ("email" in result && result.email === "not_configured") {
        setStatus("not_sent");
        setFeedback("Decision saved. Configure the email provider before sending.");
      } else if (sendEmail) {
        setStatus("sending");
        setFeedback("Decision saved. Email status could not be confirmed.");
      } else {
        setStatus("not_sent");
        setFeedback("Nurse decision saved. No email has been sent.");
      }
    } catch {
      setFeedback("The request failed. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <label style={{ display: "grid", gap: 6, marginBlock: 12 }}>
        Nurse action
        <select
          required
          disabled={busy || status === "accepted"}
          value={decision}
          onChange={(event) => {
            const value = event.target.value;
            setDecision(value === "" ? "" : nurseSurveyDecisionSchema.parse(value));
          }}
          style={{ minHeight: 48, padding: 8, font: "inherit" }}
        >
          <option value="">Choose a documented action</option>
          {Object.entries(nurseSurveyDecisionLabels).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </label>
      <label style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBlock: 12 }}>
        <input
          type="checkbox"
          required
          checked={assessmentConfirmed}
          disabled={busy || status === "accepted"}
          onChange={(event) => setAssessmentConfirmed(event.target.checked)}
          style={{ width: 24, height: 24, flex: "0 0 24px" }}
        />
        <span>
          I assessed the patient separately using the clinic’s approved process. AUSDRISK answers alone do not determine emergency need.
        </span>
      </label>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" disabled={!decision || !assessmentConfirmed || busy || status === "accepted"} onClick={() => void save(false)}>
          Save decision
        </button>
        <button
          type="button"
          disabled={!decision || !assessmentConfirmed || busy || !emailReady || status === "accepted"}
          onClick={() => void save(true)}
        >
          {busy ? "Saving…" : "Save and email patient"}
        </button>
      </div>
      {status === "accepted" ? <p role="status">Email accepted by the provider; delivery is not confirmed.</p> : null}
      {status === "failed" ? <p role="status">The last email send failed. You can retry after checking configuration.</p> : null}
      {feedback ? <p role="status">{feedback}</p> : null}
    </div>
  );
}
