"use client";

import { ar } from "@/lib/strings.ar";

export type TapAnswersState = Record<string, boolean | null>;

export type TapQuestion = {
  key: string;
  label: string;
};

/** Tap the selected answer again → back to null (unanswered). */
export function toggle<T>(current: T | null, value: T): T | null {
  return current === value ? null : value;
}

export default function TapQuestions({
  questions,
  answers,
  onChange,
  yesLabel = ar.register.yes,
  noLabel = ar.register.no,
}: {
  questions: TapQuestion[];
  answers: TapAnswersState;
  onChange: (key: string, value: boolean | null) => void;
  yesLabel?: string;
  noLabel?: string;
}) {
  return (
    <div className="tap-questions">
      {questions.map((question) => (
        <fieldset key={question.key} className="tap-question">
          <legend className="tap-legend">{question.label}</legend>
          <div className="tap-row">
            {[true, false].map((value) => (
              <button
                key={String(value)}
                type="button"
                aria-pressed={answers[question.key] === value}
                className={
                  answers[question.key] === value
                    ? "tap-btn tap-btn-on"
                    : "tap-btn"
                }
                onClick={() =>
                  onChange(question.key, toggle(answers[question.key], value))
                }
              >
                {value ? yesLabel : noLabel}
              </button>
            ))}
          </div>
        </fieldset>
      ))}
    </div>
  );
}