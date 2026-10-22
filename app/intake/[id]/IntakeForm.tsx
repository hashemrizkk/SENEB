"use client";

import { useEffect, useRef, useState } from "react";
import { ar } from "@/lib/strings.ar";
import { followupQuestions } from "@/lib/questions";
import VoiceInput from "@/components/VoiceInput";
import { appendTranscript, deriveInputMethod } from "@/lib/voice-utils";

// Toggle: tap same button again → clear back to null
function toggle<T>(current: T | null, value: T): T | null {
  return current === value ? null : value;
}

export default function IntakeForm({
  patientId,
  patientName,
}: {
  patientId: number;
  patientName: string;
}) {
  // Tap answers (null = unanswered)
  const [missedDoses, setMissedDoses] = useState<boolean | null>(null);
  const [hypoEpisodes, setHypoEpisodes] = useState<number | null>(null);
  const [footProblem, setFootProblem] = useState<boolean | null>(null);
  const [visionChange, setVisionChange] = useState<boolean | null>(null);
  const [freeText, setFreeText] = useState("");
  const [voiceTranscript, setVoiceTranscript] = useState("");
  const [voicePieces, setVoicePieces] = useState<string[]>([]);
  const [voiceTextEdited, setVoiceTextEdited] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const inFlight = useRef(false);

  const maxChars = 500;

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  if (submitted) {
    return (
      <main dir="rtl" lang="ar" style={pageStyle}>
        <p
          style={{
            fontSize: "1.4rem",
            textAlign: "center",
            marginTop: "3rem",
            color: "#16a34a",
          }}
        >
          ✅ {ar.thankYou}
        </p>
        <p style={noteStyle}>{ar.clinicReviewNote}</p>
        <p style={emergencyStyle}>{ar.emergencyNotice}</p>
      </main>
    );
  }

  async function handleSubmit() {
    if (inFlight.current) return;
    inFlight.current = true;
    setSubmitting(true);
    setError(null);

    const hasFreeText = freeText.trim().length > 0;
    const inputMethod = deriveInputMethod({
      texts: [freeText],
      transcriptPieces: [voicePieces],
      editedAfterAppend: [voiceTextEdited],
      maxChars: [maxChars],
    });

    const body = {
      patient_id: patientId,
      tap_missed_doses: missedDoses,
      tap_hypo_episodes: hypoEpisodes,
      tap_foot_problem: footProblem,
      tap_vision_change: visionChange,
      free_text: hasFreeText ? freeText.trim().slice(0, maxChars) : null,
      input_method: inputMethod,
    };

    try {
      const res = await fetch("/api/intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const result: unknown = await res.json().catch(() => null);
      const ok =
        result !== null &&
        typeof result === "object" &&
        "ok" in result &&
        result.ok === true;
      if (res.ok && ok) {
        setSubmitted(true);
      } else {
        setError(
          result !== null &&
            typeof result === "object" &&
            "error" in result &&
            result.error === "patient_not_found"
            ? ar.errorPatientNotFound
            : ar.errorGeneric,
        );
      }
    } catch {
      setError(ar.errorGeneric);
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  return (
    <main dir="rtl" lang="ar" style={pageStyle}>
      <h1 style={{ fontSize: "1.4rem", marginBottom: "0.5rem" }}>
        {ar.intakeTitle}
      </h1>
      <p style={{ fontSize: "1rem", color: "#555", marginBottom: "1rem" }}>
        {patientName}
      </p>

      {/* Emergency notice - always visible */}
      <div style={emergencyStyle}>{ar.emergencyNotice}</div>

      {/* Clinic review note - always visible */}
      <p style={noteStyle}>{ar.clinicReviewNote}</p>

      {/* Consent note - always visible */}
      <p style={noteStyle}>{ar.consentNote}</p>

      <fieldset style={questionStyle}>
        <legend style={labelStyle}>{followupQuestions[0].label}</legend>
        <div style={btnRow}>
          <button
            type="button"
            aria-pressed={missedDoses === true}
            style={btnStyle(missedDoses === true)}
            onClick={() => setMissedDoses(toggle(missedDoses, true))}
          >
            {ar.yes}
          </button>
          <button
            type="button"
            aria-pressed={missedDoses === false}
            style={btnStyle(missedDoses === false)}
            onClick={() => setMissedDoses(toggle(missedDoses, false))}
          >
            {ar.no}
          </button>
        </div>
      </fieldset>

      <fieldset style={questionStyle}>
        <legend style={labelStyle}>{followupQuestions[1].label}</legend>
        <div style={btnRow}>
          {[
            { label: ar.zero, value: 0 },
            { label: ar.one, value: 1 },
            { label: ar.two, value: 2 },
            { label: ar.threeOrMore, value: 3 },
          ].map((opt) => (
            <button
              key={opt.value}
              type="button"
              aria-pressed={hypoEpisodes === opt.value}
              style={btnStyle(hypoEpisodes === opt.value)}
              onClick={() =>
                setHypoEpisodes(toggle(hypoEpisodes, opt.value))
              }
            >
              {opt.label}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset style={questionStyle}>
        <legend style={labelStyle}>{followupQuestions[2].label}</legend>
        <div style={btnRow}>
          <button
            type="button"
            aria-pressed={footProblem === true}
            style={btnStyle(footProblem === true)}
            onClick={() => setFootProblem(toggle(footProblem, true))}
          >
            {ar.yes}
          </button>
          <button
            type="button"
            aria-pressed={footProblem === false}
            style={btnStyle(footProblem === false)}
            onClick={() => setFootProblem(toggle(footProblem, false))}
          >
            {ar.no}
          </button>
        </div>
      </fieldset>

      <fieldset style={questionStyle}>
        <legend style={labelStyle}>{followupQuestions[3].label}</legend>
        <div style={btnRow}>
          <button
            type="button"
            aria-pressed={visionChange === true}
            style={btnStyle(visionChange === true)}
            onClick={() => setVisionChange(toggle(visionChange, true))}
          >
            {ar.yes}
          </button>
          <button
            type="button"
            aria-pressed={visionChange === false}
            style={btnStyle(visionChange === false)}
            onClick={() => setVisionChange(toggle(visionChange, false))}
          >
            {ar.no}
          </button>
        </div>
      </fieldset>

      <div style={questionStyle}>
        <label htmlFor="free_text" style={labelStyle}>{followupQuestions[4].label}</label>
        <textarea
          id="free_text"
          dir="rtl"
          lang="ar"
          value={freeText}
          maxLength={maxChars}
          aria-describedby="free_text-counter"
          onChange={(e) => {
            if (e.target.value.length <= maxChars) {
              if (voicePieces.length) setVoiceTextEdited(true);
              setFreeText(e.target.value);
            }
          }}
          placeholder={ar.freeTextPlaceholder}
          style={{
            width: "100%",
            minHeight: "80px",
            fontSize: "1.1rem",
            padding: "0.75rem",
            borderRadius: "8px",
            border: "1px solid #ccc",
            resize: "vertical",
            fontFamily: "inherit",
            boxSizing: "border-box",
          }}
        />
        <VoiceInput
          id="followup-voice"
          label={followupQuestions[4].label}
          maxChars={maxChars}
          transcript={voiceTranscript}
          onTranscriptChange={setVoiceTranscript}
          onAppend={(value, speechPieces) => {
            setVoicePieces((current) => [...current, ...speechPieces]);
            setFreeText((current) => appendTranscript(current, value, maxChars));
          }}
        />
        <p
          id="free_text-counter"
          style={{
            fontSize: "0.85rem",
            color: freeText.length >= maxChars ? "#dc2626" : "#888",
            textAlign: "left",
            marginTop: "0.25rem",
          }}
        >
          {ar.charCounter(freeText.length, maxChars)}
        </p>
      </div>

      {/* Error message */}
      {error && (
        <p
          ref={errorRef}
          tabIndex={-1}
          role="alert"
          style={{
            color: "#dc2626",
            fontSize: "1.1rem",
            textAlign: "center",
            marginBottom: "1rem",
          }}
        >
          {error}
        </p>
      )}

      {/* Submit button */}
      <button
        type="button"
        disabled={submitting}
        onClick={handleSubmit}
        style={{
          width: "100%",
          padding: "1rem",
          fontSize: "1.3rem",
          borderRadius: "12px",
          border: "none",
          background: submitting ? "#9ca3af" : "#2563eb",
          color: "#fff",
          cursor: submitting ? "not-allowed" : "pointer",
          minHeight: "52px",
          fontFamily: "inherit",
        }}
      >
        {submitting ? ar.submitting : ar.submitButton}
      </button>
    </main>
  );
}

// ----- Styles -----

const pageStyle: React.CSSProperties = {
  maxWidth: "480px",
  margin: "0 auto",
  padding: "1.5rem",
  fontFamily: "system-ui, sans-serif",
};

const emergencyStyle: React.CSSProperties = {
  background: "#fee2e2",
  padding: "0.75rem",
  borderRadius: "8px",
  marginBottom: "0.75rem",
  fontSize: "1.1rem",
  textAlign: "center",
};

const noteStyle: React.CSSProperties = {
  fontSize: "0.9rem",
  color: "#666",
  marginBottom: "0.5rem",
};

const questionStyle: React.CSSProperties = {
  marginBottom: "1.5rem",
  border: 0,
  padding: 0,
};

const labelStyle: React.CSSProperties = {
  fontSize: "1.15rem",
  marginBottom: "0.5rem",
  fontWeight: 500,
};

const btnRow: React.CSSProperties = {
  display: "flex",
  gap: "0.5rem",
  flexWrap: "wrap",
};

function btnStyle(selected: boolean): React.CSSProperties {
  return {
    flex: "1 1 0",
    minWidth: "80px",
    minHeight: "48px",
    fontSize: "1.1rem",
    padding: "0.6rem 0.5rem",
    borderRadius: "10px",
    border: selected ? "2px solid #2563eb" : "2px solid #ddd",
    background: selected ? "#dbeafe" : "#fff",
    color: "#1a1a1a",
    cursor: "pointer",
    fontFamily: "inherit",
    fontWeight: selected ? 600 : 400,
  };
}
