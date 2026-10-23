"use client";

import type { TapQuestion } from "@/components/TapQuestions";
import { ar } from "@/lib/strings.ar";
import { registrationTextQuestions } from "@/lib/questions";

export type ReviewForm = {
  full_name: string;
  phone: string;
  email: string;
  self_description: string;
  notes: string;
  answers: Record<string, boolean | null>;
};

function Row({
  label,
  value,
  step,
  onEdit,
  editLabel,
}: {
  label: string;
  value: string;
  step: number;
  onEdit: (step: number) => void;
  editLabel: string;
}) {
  return (
    <div className="reg-review-row">
      <span className="reg-review-label">{label}</span>
      <span className="reg-review-value">{value}</span>
      <button
        type="button"
        className="reg-link"
        onClick={() => onEdit(step)}
        aria-label={`${editLabel} — ${label}`}
      >
        {editLabel}
      </button>
    </div>
  );
}

export default function ReviewList({
  form,
  questions,
  onEdit,
  locale,
}: {
  form: ReviewForm;
  questions: TapQuestion[];
  onEdit: (step: number) => void;
  locale: "ar" | "en";
}) {
  const copy = locale === "ar" ? ar.register : ar.register.en;
  const unanswered = questions.filter((question) => form.answers[question.key] == null);

  return (
    <div className="reg-review">
      <Row label={copy.fullName} value={form.full_name} step={1} onEdit={onEdit} editLabel={copy.reviewEdit} />
      <Row label={copy.phone} value={form.phone} step={1} onEdit={onEdit} editLabel={copy.reviewEdit} />
      {form.email ? (
        <Row label={copy.email} value={form.email} step={1} onEdit={onEdit} editLabel={copy.reviewEdit} />
      ) : null}

      {questions.map((question) => (
        <Row
          key={question.key}
          label={question.label}
          value={
            form.answers[question.key] == null
              ? copy.unanswered
              : form.answers[question.key]
                ? copy.yes
                : copy.no
          }
          step={2}
          onEdit={onEdit}
          editLabel={copy.reviewEdit}
        />
      ))}

      {form.self_description ? (
        <Row
          label={locale === "ar" ? registrationTextQuestions.selfDescription.label : registrationTextQuestions.selfDescription.labelEn ?? registrationTextQuestions.selfDescription.label}
          value={form.self_description}
          step={3}
          onEdit={onEdit}
          editLabel={copy.reviewEdit}
        />
      ) : null}

      {form.notes ? (
        <Row label={locale === "ar" ? registrationTextQuestions.notes.label : registrationTextQuestions.notes.labelEn ?? registrationTextQuestions.notes.label} value={form.notes} step={3} onEdit={onEdit} editLabel={copy.reviewEdit} />
      ) : null}

      {unanswered.length > 0 ? (
        <p className="reg-nudge">{copy.unansweredNudge}</p>
      ) : null}
    </div>
  );
}
