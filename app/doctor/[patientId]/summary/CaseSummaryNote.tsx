"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { IntakeFields } from "@/lib/intake";
import type { ReviewPriority, ReviewStatus } from "@/lib/doctor-review";
import { ar } from "@/lib/strings.ar";

type CaseSummaryNoteProps = {
  locale: "ar" | "en";
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
  locale,
}: CaseSummaryNoteProps) {
  const copy = locale === "ar" ? ar.doctorCaseSummaryNote : ar.doctorCaseSummaryNote.en;
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
        setMessage(copy.saved);
        router.refresh();
      } else if (response.status === 409) {
        setMessage(copy.conflict);
      } else {
        setMessage(copy.failed);
      }
    } catch {
      setMessage(copy.network);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section style={sectionStyle}>
      <h2>{copy.title}</h2>
      <label htmlFor="summary-clinician-note">{copy.prompt}</label>
      <textarea
        id="summary-clinician-note"
        value={note}
        onChange={(event) => setNote(event.target.value)}
        maxLength={4_000}
        style={textareaStyle}
      />
      <button type="button" onClick={() => void saveNote()} disabled={saving || !note.trim()}>
        {saving ? copy.saving : copy.save}
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
