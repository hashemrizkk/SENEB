"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import VoiceInput from "@/components/VoiceInput";
import { formatCairoDateTime } from "@/lib/date-time";
import type { StoredVisitNote } from "@/lib/db";

type ChecklistResult = {
  id: string; label: string; status: "documented" | "declined_or_deferred" | "not_documented" | "unclear";
  severity_if_missing: "red" | "yellow"; reason: string; evidence_quote: string | null;
};
type Light = "green" | "yellow" | "red" | null;
const LIGHT_LABELS: Record<string, string> = {
  green: "✓ Checklist complete",
  yellow: "! Something is missing",
  red: "✕ Something important is missing",
  grey: "? Could not verify automatically",
};
const LIGHT_STYLES: Record<string, React.CSSProperties> = {
  green: { color: "#166534", background: "#DCFCE7", border: "2px solid #166534" },
  yellow: { color: "#854D0E", background: "#FEF9C3", border: "2px solid #854D0E" },
  red: { color: "#991B1B", background: "#FEE2E2", border: "2px solid #991B1B" },
  grey: { color: "#334155", background: "#F1F5F9", border: "2px solid #334155" },
};

function resultsFromJson(value: string | null): ChecklistResult[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || !("results" in parsed) || !Array.isArray(parsed.results)) return [];
    return parsed.results.filter((item): item is ChecklistResult => {
      if (!item || typeof item !== "object") return false;
      const row = item as Record<string, unknown>;
      return typeof row.id === "string" && typeof row.label === "string" &&
        typeof row.reason === "string" &&
        ["documented", "declined_or_deferred", "not_documented", "unclear"].includes(String(row.status)) &&
        ["red", "yellow"].includes(String(row.severity_if_missing)) &&
        (typeof row.evidence_quote === "string" || row.evidence_quote === null);
    });
  } catch {
    return [];
  }
}

function displayDate(value: string | null): string {
  if (!value) return "Unknown time";
  const iso = /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(value) ? `${value.replace(" ", "T")}Z` : value;
  return formatCairoDateTime(iso);
}

function modeLabel(note: StoredVisitNote): string {
  if (note.check_mode === "llm") return "AI check";
  if (note.check_mode === "mock") return "MOCK: not real AI";
  return "AI check unavailable: keyword check only";
}

function fallbackReasonLabel(code: string | null): string {
  const labels: Record<string, string> = {
    not_configured: "The provider is not configured.", auth_failed: "The provider rejected authentication.",
    model_not_found: "The configured model was not found.", rate_limited: "The provider rate limit was reached.",
    timeout: "The provider request timed out.", network_error: "The provider could not be reached.",
    truncated_output: "The provider response was incomplete.", invalid_json: "The provider response was not valid structured output.",
    schema_mismatch: "The provider response did not match the required checklist format.", internal_error: "The automatic check could not be completed.",
  };
  return code ? labels[code] ?? "The automatic check could not be completed." : "No provider failure was recorded.";
}

export default function VisitNoteSection({
  patientId, initialNotes, geminiAvailable, queueContext,
}: {
  patientId: number; initialNotes: StoredVisitNote[]; geminiAvailable: boolean;
  queueContext: { status: string; priority: string | null } | null;
}) {
  const router = useRouter();
  const initialNote = initialNotes[0] ?? null;
  const notes = initialNotes;
  const [currentNote] = useState<StoredVisitNote | null>(initialNote);
  const [noteText, setNoteText] = useState(initialNote?.note_text ?? "");
  const [editing, setEditing] = useState(!initialNote?.note_text);
  const [role, setRole] = useState<"nurse" | "doctor">(initialNote?.author_role === "nurse" ? "nurse" : "doctor");
  const [authorName, setAuthorName] = useState(initialNote?.author_name ?? "");
  const [typed, setTyped] = useState(initialNote ? initialNote.input_method !== "voice" : false);
  const [dictated, setDictated] = useState(initialNote?.input_method === "voice" || initialNote?.input_method === "mixed");
  const [voiceTranscript, setVoiceTranscript] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [showOverride, setShowOverride] = useState(false);
  const [overrideLight, setOverrideLight] = useState<"green" | "yellow" | "red">("yellow");
  const [overrideReason, setOverrideReason] = useState("");
  const [confirmLighter, setConfirmLighter] = useState(false);
  const [override, setOverride] = useState<{ oldLight: Light; newLight: "green" | "yellow" | "red"; reason: string; name: string } | null>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const lastSelection = useRef({ start: (initialNote?.note_text ?? "").length, end: (initialNote?.note_text ?? "").length });
  const errorRef = useRef<HTMLDivElement>(null);
  const currentLight = currentNote?.light ?? null;
  const shownLight = currentNote?.override_light ?? override?.newLight ?? currentLight ?? "grey";
  const checklist = currentNote ? resultsFromJson(currentNote.check_result_json) : [];
  const hasUnclearMarker = noteText.includes("[غير واضح]");
  const inputMethod = typed && dictated ? "mixed" : dictated ? "voice" : "typed";

  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);

  function rememberAuthor(nextRole: "nurse" | "doctor", nextName: string) {
    setRole(nextRole); setAuthorName(nextName);
  }

  function rememberCursor(textarea: HTMLTextAreaElement) {
    lastSelection.current = { start: textarea.selectionStart, end: textarea.selectionEnd };
  }

  function appendDictation(text: string) {
    const { start, end } = lastSelection.current;
    setNoteText((current) => {
      const safeStart = Math.min(start, current.length);
      const safeEnd = Math.min(Math.max(end, safeStart), current.length);
      const before = current.slice(0, safeStart);
      const after = current.slice(safeEnd);
      const separatorBefore = before && !/\s$/.test(before) ? " " : "";
      const inserted = `${separatorBefore}${text}`;
      const separatorAfter = after && !/^\s/.test(after) ? " " : "";
      const next = `${before}${inserted}${separatorAfter}${after}`;
      const cursor = safeStart + inserted.length + separatorAfter.length;
      lastSelection.current = { start: cursor, end: cursor };
      window.setTimeout(() => { noteRef.current?.focus(); noteRef.current?.setSelectionRange(cursor, cursor); }, 0);
      return next;
    });
    setDictated(true);
  }

  async function saveNote() {
    if (isSaving) return;
    setIsSaving(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/notes", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patient_id: patientId, note_text: noteText, input_method: inputMethod, author_role: role, author_name: authorName }),
      });
      const result: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const text = result && typeof result === "object" && "error" in result && typeof result.error === "string" ? result.error : "The note could not be saved. Your text remains here.";
        setError(text); return;
      }
      setEditing(false); setMessage("Visit note saved as a new revision. The check did not block saving.");
      router.refresh();
    } catch {
      setError("The request failed. Your note remains in this form; try again.");
    } finally { setIsSaving(false); }
  }

  async function submitOverride() {
    if (!currentNote || !authorName.trim() || overrideReason.trim().length < 3) { setError("Enter your name and an override reason of at least 3 characters."); return; }
    setError("");
    try {
      const response = await fetch(`/api/notes/${currentNote.id}/override`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ new_light: overrideLight, reason: overrideReason, actor_role: role, actor_name: authorName, confirm_lighter: confirmLighter }),
      });
      const result: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const text = result && typeof result === "object" && "error" in result && typeof result.error === "string" ? result.error : "The override could not be saved.";
        setError(text); return;
      }
      setOverride({ oldLight: currentNote.light, newLight: overrideLight, reason: overrideReason, name: authorName });
      setShowOverride(false); setMessage("Override saved and audit row recorded."); router.refresh();
    } catch { setError("The override request failed. Try again."); }
  }

  const lighter = currentLight === null || (currentLight === "red" ? overrideLight !== "red" : currentLight === "yellow" && overrideLight === "green");

  return (
    <section id="visit-note" className="doctor-card" aria-labelledby="visit-note-title">
      <h2 id="visit-note-title">Visit note</h2>
      <p><strong>Demo only: no login. Do not use with real patients.</strong></p>
      <p>This light checks documentation completeness against patient data. It does not judge whether care was correct or whether the patient is safe.</p>
      {queueContext ? <p>Queue context (read-only): {queueContext.priority ?? "Not enough information"} · {queueContext.status}</p> : <p>No current queue entry.</p>}
      {currentNote && !editing ? (
        <>
          <h3>Current saved note</h3>
          <pre dir="auto" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", font: "inherit" }}>{currentNote.note_text ?? "(No note text)"}</pre>
          <button type="button" onClick={() => { setNoteText(currentNote.note_text ?? ""); setEditing(true); setTyped(currentNote.input_method !== "voice"); setDictated(currentNote.input_method === "voice" || currentNote.input_method === "mixed"); setMessage(""); }}>Edit note</button>
        </>
      ) : null}
      {editing ? (
        <div>
          <label htmlFor={`visit-note-text-${patientId}`}>Clinical note</label>
          <textarea
            id={`visit-note-text-${patientId}`} ref={noteRef} dir="auto" value={noteText} maxLength={5_000}
            onSelect={(event) => rememberCursor(event.currentTarget)} onClick={(event) => rememberCursor(event.currentTarget)} onKeyUp={(event) => rememberCursor(event.currentTarget)}
            onChange={(event) => { setNoteText(event.target.value); setTyped(true); rememberCursor(event.currentTarget); }}
            style={{ display: "block", width: "100%", minHeight: 180, marginBlock: 8, padding: 12, boxSizing: "border-box", font: "inherit", fontSize: 18 }}
          />
          {dictated ? <small>Dictated text added.</small> : null}
          {hasUnclearMarker ? <p role="status">This note has unclear parts. Please fix them or confirm.</p> : null}
          <VoiceInput id={`visit-note-voice-${patientId}`} label="Dictate visit note" maxChars={5_000} transcript={voiceTranscript} onTranscriptChange={setVoiceTranscript} onAppend={(text) => appendDictation(text)} direction="rtl" context="doctor_note" geminiAvailable={geminiAvailable} autoAppend showTranscript={false} />
          {!geminiAvailable ? <p role="status">Doctor dictation is unavailable because Gemini is not configured. You can still type and save.</p> : null}
          <label htmlFor={`visit-note-role-${patientId}`}>Author role</label>
          <select id={`visit-note-role-${patientId}`} value={role} onChange={(event) => rememberAuthor(event.target.value as "nurse" | "doctor", authorName)}><option value="doctor">Doctor</option><option value="nurse">Nurse</option></select>
          <label htmlFor={`visit-note-author-${patientId}`}>Author name</label>
          <input id={`visit-note-author-${patientId}`} value={authorName} maxLength={80} onChange={(event) => rememberAuthor(role, event.target.value)} />
          <button type="button" onClick={() => void saveNote()} disabled={isSaving || !authorName.trim()}>{isSaving ? "Saving and checking…" : "Save and check"}</button>
        </div>
      ) : null}
      {currentNote ? (
        <div aria-label="Note completeness check" style={{ marginBlock: 16 }}>
          <div aria-label={LIGHT_LABELS[shownLight]} style={{ ...LIGHT_STYLES[shownLight], width: 180, height: 180, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", padding: 12, boxSizing: "border-box", fontWeight: 700 }}>{LIGHT_LABELS[shownLight]}</div>
          <p>This checks whether the note covers items from the patient&apos;s data. It is not a medical judgment.</p>
          {override || currentNote.override_light ? <p role="status">Doctor reviewed: overridden from {LIGHT_LABELS[currentNote.light ?? "grey"]} to {LIGHT_LABELS[currentNote.override_light ?? override?.newLight ?? "grey"]}. Reason: {currentNote.override_reason ?? override?.reason} · {currentNote.override_by_name ?? override?.name}</p> : null}
          <p><strong>{modeLabel(currentNote)}</strong></p>
          {currentNote.check_mode === "fallback" || currentNote.check_mode === null ? <p>{fallbackReasonLabel(currentNote.fallback_reason)}</p> : null}
          {currentNote.fallback_detail ? <details><summary>Technical details</summary><code>{currentNote.fallback_detail}</code></details> : currentNote.check_model ? <details><summary>Technical details</summary><code>{currentNote.check_model}</code></details> : null}
          {checklist.length ? <div style={{ overflowX: "auto" }}><table><caption>Documentation items checked</caption><thead><tr><th scope="col">Status</th><th scope="col">Item</th><th scope="col">Severity if missing</th><th scope="col">Why required</th><th scope="col">Evidence</th></tr></thead><tbody>{checklist.map((item) => <tr key={item.id}><td>{item.status === "documented" ? "✓ Documented" : item.status === "declined_or_deferred" ? "↪ Deferred" : item.status === "not_documented" ? "× Not found" : "? Could not verify"}</td><td>{item.label}</td><td>{item.severity_if_missing}</td><td>{item.reason}</td><td>{item.evidence_quote ?? "not found in note"}</td></tr>)}</tbody></table></div> : <p>No checklist results are stored for this older note.</p>}
          {currentNote.check_mode && !currentNote.overridden_at ? <button type="button" onClick={() => { setOverrideLight(currentNote.light ?? "yellow"); setShowOverride(true); }}>Override light</button> : null}
          {showOverride && currentNote.overridden_at === null ? <fieldset><legend>Override the displayed light</legend><label htmlFor={`override-light-${patientId}`}>New light</label><select id={`override-light-${patientId}`} value={overrideLight} onChange={(event) => { setOverrideLight(event.target.value as typeof overrideLight); setConfirmLighter(false); }}><option value="green">Green</option><option value="yellow">Yellow</option><option value="red">Red</option></select><label htmlFor={`override-reason-${patientId}`}>Reason</label><textarea id={`override-reason-${patientId}`} value={overrideReason} onChange={(event) => setOverrideReason(event.target.value)} maxLength={500} /><p>Reviewer: {role} · {authorName || "Enter author name above"}</p>{lighter ? <label><input type="checkbox" checked={confirmLighter} onChange={(event) => setConfirmLighter(event.target.checked)} /> I confirm this changes the light to a less severe state (or from could not verify).</label> : null}<button type="button" onClick={() => void submitOverride()} disabled={lighter && !confirmLighter}>Confirm override</button><button type="button" onClick={() => setShowOverride(false)}>Cancel</button></fieldset> : null}
        </div>
      ) : null}
      {error ? <div ref={errorRef} tabIndex={-1} role="alert" aria-live="assertive"><p>{error}</p></div> : null}
      {message ? <p role="status" aria-live="polite">{message}</p> : null}
      <section aria-labelledby={`note-history-title-${patientId}`}><h3 id={`note-history-title-${patientId}`}>Note revision history</h3>{notes.length ? <ol>{notes.map((note) => <li key={note.id}><strong>Note #{note.id}</strong> · {displayDate(note.created_at)} · {note.author_role ?? "legacy author"}: {note.author_name ?? note.edited_by ?? "Unknown"} · {note.input_method ?? "legacy input"} · {note.light ? LIGHT_LABELS[note.light] : "? Could not verify automatically"} · {note.overridden_at ? "Overridden" : "Not overridden"}</li>)}</ol> : <p>No visit notes have been saved.</p>}</section>
    </section>
  );
}
