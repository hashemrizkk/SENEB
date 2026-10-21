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
}: {
  label: string;
  value: string;
  step: number;
  onEdit: (step: number) => void;
}) {
  return (
    <div className="reg-review-row">
      <span className="reg-review-label">{label}</span>
      <span className="reg-review-value">{value}</span>
      <button
        type="button"
        className="reg-link"
        onClick={() => onEdit(step)}
        aria-label={`${ar.register.reviewEdit} — ${label}`}
      >
        {ar.register.reviewEdit}
      </button>
    </div>
  );
}

export default function ReviewList({
  form,
  questions,
  onEdit,
}: {
  form: ReviewForm;
  questions: TapQuestion[];
  onEdit: (step: number) => void;
}) {
  const unanswered = questions.filter((question) => form.answers[question.key] == null);

  return (
    <div className="reg-review">
      <Row label={ar.register.fullName} value={form.full_name} step={1} onEdit={onEdit} />
      <Row label={ar.register.phone} value={form.phone} step={1} onEdit={onEdit} />
      {form.email ? (
        <Row label={ar.register.email} value={form.email} step={1} onEdit={onEdit} />
      ) : null}

      {questions.map((question) => (
        <Row
          key={question.key}
          label={question.label}
          value={
            form.answers[question.key] == null
              ? ar.register.unanswered
              : form.answers[question.key]
                ? ar.register.yes
                : ar.register.no
          }
          step={2}
          onEdit={onEdit}
        />
      ))}

      {form.self_description ? (
        <Row
          label={registrationTextQuestions.selfDescription.label}
          value={form.self_description}
          step={3}
          onEdit={onEdit}
        />
      ) : null}

      {form.notes ? (
        <Row label={registrationTextQuestions.notes.label} value={form.notes} step={3} onEdit={onEdit} />
      ) : null}

      {unanswered.length > 0 ? (
        <p className="reg-nudge">{ar.register.unansweredNudge}</p>
      ) : null}
    </div>
  );
}