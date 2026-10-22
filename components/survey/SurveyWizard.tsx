"use client";

import { useState } from "react";
import { ar } from "@/lib/strings.ar";
import {
  type AusdriskAnswers,
  type AusdriskItem,
} from "@/lib/survey/ausdrisk";
import { toWesternDigits } from "@/lib/registration";

const QUESTION_KEYS: readonly AusdriskItem[] = [
  "age",
  "sex",
  "family_history",
  "high_glucose",
  "antihypertensive",
  "daily_smoking",
  "daily_fruit_veg",
  "activity_150_minutes",
  "waist_cm",
];

const EMPTY_ANSWERS: AusdriskAnswers = {
  age: null,
  sex: null,
  family_history: null,
  high_glucose: null,
  antihypertensive: null,
  daily_smoking: null,
  daily_fruit_veg: null,
  activity_150_minutes: null,
  waist_cm: null,
};

function parseNumber(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(toWesternDigits(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function fieldError(key: AusdriskItem, answers: AusdriskAnswers): string | null {
  if (key === "age") {
    return Number.isInteger(answers.age) && answers.age !== null &&
      answers.age >= 18 && answers.age <= 120
      ? null
      : ar.survey.ageInvalid;
  }
  if (key === "sex") {
    return answers.sex === null ? ar.survey.required : null;
  }
  if (key === "waist_cm") {
    return answers.waist_cm !== null &&
      answers.waist_cm >= 40 && answers.waist_cm <= 200
      ? null
      : ar.survey.waistInvalid;
  }
  return null;
}

export default function SurveyWizard() {
  const [screen, setScreen] = useState<"intro" | "questions" | "result">("intro");
  const [answers, setAnswers] = useState<AusdriskAnswers>(EMPTY_ANSWERS);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [error, setError] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [emailConsent, setEmailConsent] = useState(false);
  const [requestId, setRequestId] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [website, setWebsite] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const activeQuestion = QUESTION_KEYS[questionIndex];
  const question = ar.survey.questions.find((item) => item.item === activeQuestion);
  const hasUnknownAnswers = Object.values(answers).some((answer) => answer === null);

  function updateAnswer(key: AusdriskItem, value: number | boolean | string | null): void {
    setAnswers((current) => ({ ...current, [key]: value }));
    setError("");
  }

  function nextQuestion(): void {
    if (!activeQuestion) return;
    const message = fieldError(activeQuestion, answers);
    if (message) {
      setError(message);
      return;
    }
    setError("");
    if (questionIndex === QUESTION_KEYS.length - 1) {
      setScreen("result");
      return;
    }
    setQuestionIndex((current) => current + 1);
  }

  function previousQuestion(): void {
    setError("");
    if (questionIndex > 0) {
      setQuestionIndex((current) => current - 1);
      return;
    }
    setScreen("intro");
  }

  async function submitForReview(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (submitting || submitted) return;
    if (!emailConsent) {
      setSubmitError(ar.survey.consentRequired);
      return;
    }
    setSubmitting(true);
    setSubmitError("");
    const stableRequestId = requestId || crypto.randomUUID();
    setRequestId(stableRequestId);
    try {
      const response = await fetch("/api/survey/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: fullName,
          email,
          consent: emailConsent,
          request_id: stableRequestId,
          survey: { answers },
          website,
        }),
      });
      if (!response.ok) throw new Error("Survey submission failed.");
      setSubmitted(true);
    } catch {
      setSubmitError(ar.survey.submissionError);
    } finally {
      setSubmitting(false);
    }
  }

  const currentStep =
    screen === "intro" ? 0
      : screen === "questions" ? questionIndex + 1
        : QUESTION_KEYS.length;

  return (
    <main dir="rtl" lang="ar" className="survey-page">
      <style>{`
        .survey-page {
          box-sizing: border-box; max-width: 36rem; min-height: 100vh;
          margin: 0 auto; padding: 1rem 1rem 2rem; background: #fff;
          color: #16202b; font: 18px/1.7 system-ui, sans-serif;
        }
        .survey-page *, .survey-page *::before, .survey-page *::after { box-sizing: border-box; }
        .survey-banner { padding: .7rem .85rem; border-radius: 12px; margin: 0 0 .75rem; }
        .survey-warning { background: #fff4d6; border: 1px solid #e8c76a; }
        .survey-emergency { background: #fff0f0; border: 1px solid #d99191; color: #7f1d1d; font-weight: 700; }
        .survey-disclaimer { background: #f2f6f8; border: 1px solid #d5e0e7; }
        .survey-progress { margin: 1rem 0 1.4rem; }
        .survey-progress-label { margin: 0 0 .3rem; font-size: 16px; }
        .survey-track { height: 9px; overflow: hidden; border-radius: 999px; background: #e7edf3; }
        .survey-fill { height: 100%; border-radius: inherit; background: #0f6f5c; transition: width 180ms ease; }
        .survey-title { font-size: 1.45rem; line-height: 1.4; margin: .2rem 0 1rem; }
        .survey-copy { margin: .5rem 0 1rem; }
        .survey-field { margin: 1rem 0; }
        .survey-label { display: block; font-weight: 700; margin-bottom: .4rem; }
        .survey-input {
          width: 100%; min-height: 52px; padding: .65rem .8rem; border-radius: 12px;
          border: 1.5px solid #aab9c6; background: #fff; color: #16202b;
          font: inherit; font-size: 18px;
        }
        .survey-input:focus-visible, .survey-option:focus-visible, .survey-button:focus-visible,
        .survey-link:focus-visible {
          outline: 3px solid #0f6f5c; outline-offset: 2px;
        }
        .survey-options { display: grid; gap: .65rem; grid-template-columns: repeat(auto-fit,minmax(130px,1fr)); }
        .survey-option, .survey-button {
          min-height: 50px; padding: .55rem .9rem; border: 1.5px solid #9eafbc;
          border-radius: 12px; background: white; color: #16202b; font: inherit;
          font-size: 18px; cursor: pointer;
        }
        .survey-option[aria-pressed="true"] { background: #0f6f5c; border-color: #0f6f5c; color: white; font-weight: 700; }
        .survey-actions { display: flex; gap: .7rem; margin-top: 1.5rem; }
        .survey-button { flex: 1; border-color: #0f6f5c; color: #0f6f5c; font-weight: 700; }
        .survey-primary { background: #0f6f5c; color: #fff; }
        .survey-error { color: #a11d1d; font-weight: 700; }
        .survey-result-card { padding: 1rem; border: 1px solid #cbd7df; border-radius: 16px; background: #f8fbfc; }
        .survey-small { font-size: 16px; color: #455563; }
        .survey-consent { display: flex; gap: .7rem; align-items: flex-start; margin-block: 1rem; }
        .survey-checkbox { width: 24px; height: 24px; flex: 0 0 24px; margin-top: .3rem; }
        .survey-honeypot { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
        @media (prefers-reduced-motion: reduce) { .survey-fill { transition: none; } }
      `}</style>

      <p className="survey-banner survey-warning" role="note">{ar.demoWarning}</p>
      <p className="survey-banner survey-emergency" role="note">{ar.emergencyNotice}</p>
      <p className="survey-banner survey-disclaimer" role="note">{ar.clinicReviewNote}</p>
      <p className="survey-banner survey-disclaimer" role="note">{ar.survey.disclaimer}</p>

      <div className="survey-progress" aria-label={ar.survey.progress(currentStep, QUESTION_KEYS.length)}>
        <p className="survey-progress-label">{ar.survey.progress(currentStep, QUESTION_KEYS.length)}</p>
        <div
          className="survey-track"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={QUESTION_KEYS.length}
          aria-valuenow={currentStep}
        >
          <div className="survey-fill" style={{ width: `${(currentStep / QUESTION_KEYS.length) * 100}%` }} />
        </div>
      </div>

      {screen === "intro" ? (
        <section>
          <h1 className="survey-title">{ar.survey.title}</h1>
          <p className="survey-copy">{ar.survey.intro}</p>
          <p className="survey-copy">{ar.survey.privacy}</p>
          <button
            className="survey-button survey-primary"
            type="button"
            onClick={() => setScreen("questions")}
          >
            {ar.survey.start}
          </button>
        </section>
      ) : null}

      {screen === "questions" && activeQuestion && question ? (
        <section>
          <h1 className="survey-title">{question.question}</h1>
          {activeQuestion === "age" || activeQuestion === "waist_cm" ? (
            <div className="survey-field">
              <label className="survey-label" htmlFor={`survey-${activeQuestion}`}>
                {activeQuestion === "age" ? ar.survey.age : ar.survey.waist}
              </label>
              {activeQuestion === "waist_cm" ? (
                <p className="survey-small">{ar.survey.waistHint}</p>
              ) : null}
              <input
                id={`survey-${activeQuestion}`}
                className="survey-input"
                type="number"
                inputMode={activeQuestion === "age" ? "numeric" : "decimal"}
                min={activeQuestion === "age" ? 18 : 40}
                max={activeQuestion === "age" ? 120 : 200}
                step={activeQuestion === "age" ? 1 : 0.1}
                value={answers[activeQuestion] ?? ""}
                onChange={(event) => updateAnswer(activeQuestion, parseNumber(event.target.value))}
              />
            </div>
          ) : null}

          {activeQuestion === "sex" ? (
            <div className="survey-options">
              {(["male", "female"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  className="survey-option"
                  aria-pressed={answers.sex === value}
                  onClick={() => updateAnswer("sex", value)}
                >
                  {value === "male" ? ar.survey.male : ar.survey.female}
                </button>
              ))}
            </div>
          ) : null}

          {activeQuestion !== "age" && activeQuestion !== "sex" && activeQuestion !== "waist_cm" ? (
            <div className="survey-options">
              {[true, false, null].map((value) => (
                <button
                  key={String(value)}
                  type="button"
                  className="survey-option"
                  aria-pressed={answers[activeQuestion] === value}
                  onClick={() => updateAnswer(activeQuestion, value)}
                >
                  {value === null
                    ? ar.survey.dontKnow
                    : value
                      ? ar.survey.yes
                      : ar.survey.no}
                </button>
              ))}
            </div>
          ) : null}

          {error ? <p className="survey-error" role="alert">{error}</p> : null}
          <div className="survey-actions">
            <button className="survey-button" type="button" onClick={previousQuestion}>
              {ar.survey.back}
            </button>
            <button className="survey-button survey-primary" type="button" onClick={nextQuestion}>
              {questionIndex === QUESTION_KEYS.length - 1 ? ar.survey.finish : ar.survey.next}
            </button>
          </div>
        </section>
      ) : null}

      {screen === "result" ? (
        <section>
          <h1 className="survey-title">{ar.survey.resultTitle}</h1>
          <div className="survey-result-card">
            <p>{ar.survey.resultMessage}</p>
            {hasUnknownAnswers ? (
              <p className="survey-small">{ar.survey.incompleteResult}</p>
            ) : null}
            <p className="survey-small">{ar.survey.disclaimer}</p>
          </div>
          {submitted ? (
            <p className="survey-result-card" role="status">{ar.survey.submissionSuccess}</p>
          ) : (
            <form onSubmit={submitForReview}>
              <div className="survey-honeypot" aria-hidden="true">
                <label htmlFor="survey-website">Website</label>
                <input
                  id="survey-website"
                  name="website"
                  autoComplete="off"
                  tabIndex={-1}
                  value={website}
                  onChange={(event) => setWebsite(event.target.value)}
                />
              </div>
              <h2 className="survey-title">{ar.survey.contactTitle}</h2>
              <div className="survey-field">
                <label className="survey-label" htmlFor="survey-full-name">{ar.survey.fullName}</label>
                <input
                  id="survey-full-name"
                  className="survey-input"
                  autoComplete="name"
                  required
                  minLength={2}
                  maxLength={100}
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                />
              </div>
              <div className="survey-field">
                <label className="survey-label" htmlFor="survey-email">{ar.survey.email}</label>
                <input
                  id="survey-email"
                  className="survey-input"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  dir="ltr"
                  required
                  maxLength={254}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
                <p className="survey-small">{ar.survey.emailHint}</p>
              </div>
              <label className="survey-consent">
                <input
                  className="survey-checkbox"
                  type="checkbox"
                  required
                  checked={emailConsent}
                  onChange={(event) => setEmailConsent(event.target.checked)}
                />
                <span>{ar.survey.emailConsent}</span>
              </label>
              {submitError ? <p className="survey-error" role="alert">{submitError}</p> : null}
              <button className="survey-button survey-primary" type="submit" disabled={submitting}>
                {submitting ? ar.survey.submitting : ar.survey.submitForReview}
              </button>
            </form>
          )}
          <div className="survey-actions">
            <button
              className="survey-button survey-primary"
              type="button"
              onClick={() => {
                setAnswers(EMPTY_ANSWERS);
                setQuestionIndex(0);
                setScreen("intro");
              }}
            >
              {ar.survey.restart}
            </button>
          </div>
          <a
            className="survey-link"
            href={`https://wa.me/?text=${encodeURIComponent(ar.survey.shareText)}`}
            target="_blank"
            rel="noreferrer"
          >
            {ar.survey.share}
          </a>
        </section>
      ) : null}

      <footer>
        <p className="survey-banner survey-disclaimer">{ar.survey.screeningNotice}</p>
        <p className="survey-banner survey-emergency">{ar.emergencyNotice}</p>
      </footer>
    </main>
  );
}
