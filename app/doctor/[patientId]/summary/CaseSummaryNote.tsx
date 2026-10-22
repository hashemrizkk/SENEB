"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { IntakeFields } from "@/lib/intake";
import type { ReviewPriority, ReviewStatus } from "@/lib/doctor-review";

type CaseSummaryNoteProps = {
  patient: {
    name: string;
    phone: string | null;
    email: string | null;
    self_description: string | null;
  };
  intake: {
    id: number;
    version: number;
    fields: IntakeFields;
    raw_text: string | null;
    priority: ReviewPriority;
    status: ReviewStatus;
  };
};

export default function CaseSummaryNote({
  patient,
  intake,
}: CaseSummaryNoteProps) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function saveNote(): Promise<void> {
    if (saving || !note.trim()) return;
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch(`/api/doctor/intakes/${intake.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          version: intake.version,
          patient: {
            name: patient.name,
            phone: patient.phone ?? "",
            email: patient.email ?? "",
            self_description: patient.self_description ?? "",
          },
          fields: intake.fields,
          raw_text: intake.raw_text,
          priority: intake.priority,
          status: intake.status,
          note,
          reason: "Added from the case summary.",
        }),
      });
      if (response.ok) {
        setNote("");
        setMessage("Note saved as a new clinician revision.");
        router.refresh();
      } else if (response.status === 409) {
        setMessage("This intake changed before the note was saved. Your note remains here; refresh and try again.");
      } else {
        setMessage("The note could not be saved. Your text remains here; try again.");
      }
    } catch {
      setMessage("The request failed. Your note remains here; try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section style={sectionStyle}>
      <h2>Clinician note</h2>
      <label htmlFor="summary-clinician-note">Add a note (optional)</label>
      <textarea
        id="summary-clinician-note"
        value={note}
        onChange={(event) => setNote(event.target.value)}
        maxLength={4_000}
        style={textareaStyle}
      />
      <button type="button" onClick={() => void saveNote()} disabled={saving || !note.trim()}>
        {saving ? "Saving…" : "Save note"}
      </button>
      {message ? <p role="status" aria-live="polite">{message}</p> : null}
    </section>
  );
}

const sectionStyle: React.CSSProperties = {
  border: "1px solid var(--card-border)",
  borderRadius: 12,
  marginBlock: 16,
  padding: 16,
};

const textareaStyle: React.CSSProperties = {
  display: "block",
  boxSizing: "border-box",
  width: "100%",
  minHeight: 120,
  marginBlock: "0.5rem",
  padding: "0.65rem",
  font: "inherit",
  fontSize: 18,
};
