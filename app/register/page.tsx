"use client";

import { useRef, useState } from "react";
import TapQuestions, {
  type TapAnswersState,
  type TapQuestion,
} from "@/components/TapQuestions";
import RegisterProgress from "@/components/register/RegisterProgress";
import ReviewList from "@/components/register/ReviewList";
import SuccessScreen from "@/components/register/SuccessScreen";
import {
  consentSchema,
  emailSchema,
  fullNameSchema,
  phoneSchema,
  registrationSchema,
} from "@/lib/registration";
import { ar } from "@/lib/strings.ar";
import {
  registrationQuestions,
  registrationTextQuestions,
} from "@/lib/questions";

const TOTAL_STEPS = 4;
const FIELD_ORDER = ["full_name", "phone", "email"];

const QUESTIONS: TapQuestion[] = registrationQuestions.map((question) => ({
  key: question.key,
  label: question.label,
}));

function emptyAnswers(): TapAnswersState {
  return {
    missed_doses: null,
    hypo_episodes: null,
    foot_problem: null,
    vision_change: null,
  };
}

/** crypto.randomUUID needs a secure context; fall back for plain-HTTP LAN demos. */
function newRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    const value = char === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

type ServerReply = {
  ok?: boolean;
  reference_code?: string;
  error?: string;
};

function readReply(raw: unknown): ServerReply {
  if (!raw || typeof raw !== "object") return {};
  const obj = raw as {
    ok?: unknown;
    reference_code?: unknown;
    error?: unknown;
  };
  return {
    ok: obj.ok === true,
    reference_code:
      typeof obj.reference_code === "string" ? obj.reference_code : undefined,
    error: typeof obj.error === "string" ? obj.error : undefined,
  };
}

export default function RegisterPage() {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    full_name: "",
    phone: "",
    email: "",
    self_description: "",
    notes: "",
  });
  const [answers, setAnswers] = useState<TapAnswersState>(emptyAnswers);
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [liveMessage, setLiveMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [referenceCode, setReferenceCode] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [requestId, setRequestId] = useState("");
  const submitInFlight = useRef(false);

  // Honeypot: a real input bots will fill; humans never see it.
  const [website, setWebsite] = useState("");

  const refs = useRef<Record<string, HTMLInputElement | null>>({});

  function announce(messages: Record<string, string>): void {
    const first = FIELD_ORDER.concat("consent").find((key) => messages[key]);
    setLiveMessage(first ? messages[first] : "");
  }

  function focusFirst(messages: Record<string, string>): void {
    const first = FIELD_ORDER.concat("consent").find((key) => messages[key]);
    if (!first) return;
    if (first === "consent") {
      document.getElementById("consent")?.focus();
      return;
    }
    refs.current[first]?.focus();
  }

  function validateStep1(): Record<string, string> {
    const found: Record<string, string> = {};

    const name = fullNameSchema.safeParse(form.full_name);
    if (!name.success) found.full_name = name.error.issues[0].message;

    const phone = phoneSchema.safeParse(form.phone);
    if (!phone.success) {
      found.phone = phone.error.issues[0].message;
    } else if (phone.data !== form.phone) {
      setForm((current) => ({ ...current, phone: phone.data }));
    }

    if (form.email.trim() !== "") {
      const email = emailSchema.safeParse(form.email);
      if (!email.success) found.email = email.error.issues[0].message;
    }

    return found;
  }

  function goNext(): void {
    if (step === 1) {
      const found = validateStep1();
      setErrors(found);
      announce(found);
      if (Object.keys(found).length > 0) {
        focusFirst(found);
        return;
      }
    }
    if (step >= TOTAL_STEPS) return;
    setErrors({});
    setLiveMessage("");
    setStep((current) => current + 1);
  }

  function goBack(): void {
    setErrors({});
    setLiveMessage("");
    setStep((current) => Math.max(1, current - 1));
  }

  async function handleSubmit(): Promise<void> {
    if (submitInFlight.current) return;
    const consentCheck = consentSchema.safeParse(consent);
    if (!consentCheck.success) {
      const found = { consent: consentCheck.error.issues[0].message };
      setErrors(found);
      announce(found);
      focusFirst(found);
      return;
    }
    setErrors({});
    setLiveMessage("");

    const activeRequestId = requestId || newRequestId();
    if (!requestId) setRequestId(activeRequestId);

    const payload = {
      full_name: form.full_name,
      phone: form.phone,
      email: form.email,
      self_description: form.self_description,
      answers,
      notes: form.notes,
      consent,
      website,
      request_id: activeRequestId,
    };

    const parsed = registrationSchema.safeParse(payload);
    if (!parsed.success) {
      setSubmitError(parsed.error.issues[0]?.message ?? ar.register.errorGeneric);
      return;
    }

    submitInFlight.current = true;
    setSending(true);
    setSubmitError("");

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 38_000);

    try {
      const response = await fetch("/api/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(parsed.data),
        signal: controller.signal,
      });

      const reply = readReply(await response.json().catch(() => null));

      if (!response.ok || !reply.ok) {
        setSubmitError(
          reply.error === "rate_limited"
            ? ar.register.errorRateLimited
            : reply.error === "server_error"
              ? ar.register.errorServer
              : ar.register.errorGeneric,
        );
        return;
      }

      setReferenceCode(reply.reference_code ?? null);
      setDone(true);

      // Everything was in React state only — clear it now.
      setForm({ full_name: "", phone: "", email: "", self_description: "", notes: "" });
      setAnswers(emptyAnswers());
      setConsent(false);
      setWebsite("");
    } catch {
      const offline = typeof navigator !== "undefined" && !navigator.onLine;
      setSubmitError(
        controller.signal.aborted
          ? ar.register.errorSlow
          : offline
            ? ar.register.errorOffline
            : ar.register.errorGeneric,
      );
    } finally {
      submitInFlight.current = false;
      clearTimeout(timer);
      setSending(false);
    }
  }

  if (done) return <SuccessScreen referenceCode={referenceCode} />;

  const canSubmit = !sending;

  return (
    <main dir="rtl" lang="ar" className="reg-page">
      <style>{`
        .reg-page {
          max-width: 32rem; margin: 0 auto; padding: 1rem 1rem 2.5rem;
          font-size: 18px; line-height: 1.7; color: #16202b;
          background: #ffffff; min-height: 100vh;
        }
        .reg-sr-only {
          position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
          overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0;
        }
        .reg-banner {
          background: #fff4d6; border: 1px solid #e8c76a; color: #5c4400;
          border-radius: 12px; padding: 0.65rem 0.9rem; font-size: 16px;
          font-weight: 600; margin: 0 0 1rem;
        }
        .reg-emergency {
          background: #fff0f0; border: 1px solid #d99191; color: #7f1d1d;
          border-radius: 12px; padding: 0.65rem 0.9rem; font-weight: 700;
          margin: 0 0 0.65rem;
        }
        .reg-clinic-note { margin: 0 0 1rem; color: #3b4a59; }
        .reg-progress { margin-bottom: 1.25rem; }
        .reg-progress-label { margin: 0 0 0.4rem; font-size: 16px; color: #4a5a6a; }
        .reg-progress-track {
          height: 8px; background: #e7edf3; border-radius: 999px; overflow: hidden;
        }
        .reg-progress-fill {
          height: 100%; background: #0f6f5c; border-radius: 999px;
          transition: width 200ms ease;
        }
        .reg-h1 { font-size: 1.35rem; margin: 0 0 1rem; }
        .reg-field { margin-bottom: 1.15rem; }
        .reg-label { display: block; font-weight: 600; margin-bottom: 0.35rem; }
        .reg-input, .reg-textarea {
          width: 100%; box-sizing: border-box; font: inherit; font-size: 18px;
          padding: 0.7rem 0.85rem; border: 1.5px solid #b9c6d2; border-radius: 12px;
          background: #fff; color: #16202b; min-height: 48px;
        }
        .reg-input[dir="ltr"] { text-align: right; }
        .reg-textarea { min-height: 96px; resize: vertical; }
        .reg-input:focus-visible, .reg-textarea:focus-visible,
        .reg-btn:focus-visible, .reg-link:focus-visible, .tap-btn:focus-visible,
        .reg-consent input:focus-visible {
          outline: 3px solid #0f6f5c; outline-offset: 2px;
        }
        .reg-input[aria-invalid="true"], .reg-textarea[aria-invalid="true"] {
          border-color: #b3261e;
        }
        .reg-error { color: #b3261e; font-size: 16px; margin: 0.35rem 0 0; }
        .reg-counter { color: #5b6b7b; font-size: 15px; margin: 0.25rem 0 0; text-align: left; }
        .reg-actions { display: flex; gap: 0.75rem; margin-top: 1.5rem; }
        .reg-btn {
          font: inherit; font-size: 18px; min-height: 48px; padding: 0.7rem 1.4rem;
          border-radius: 12px; border: 1.5px solid #0f6f5c; cursor: pointer;
          background: #0f6f5c; color: #fff; font-weight: 600; flex: 1;
        }
        .reg-btn:disabled { opacity: 0.55; cursor: not-allowed; }
        .reg-btn-secondary { background: #fff; color: #0f6f5c; }
        .reg-arrow { font-size: 20px; }
        .tap-question { border: 0; padding: 0; margin: 0 0 1.1rem; }
        .tap-legend { font-weight: 600; padding: 0; margin-bottom: 0.45rem; }
        .tap-row { display: flex; gap: 0.6rem; }
        .tap-btn {
          font: inherit; font-size: 18px; min-height: 48px; min-width: 96px;
          padding: 0.6rem 1.2rem; border-radius: 12px;
          border: 1.5px solid #b9c6d2; background: #fff; color: #16202b; cursor: pointer;
        }
        .tap-btn-on { background: #0f6f5c; border-color: #0f6f5c; color: #fff; font-weight: 600; }
        .reg-review-row {
          display: grid; grid-template-columns: 1fr auto; gap: 0.15rem 0.75rem;
          padding: 0.7rem 0; border-bottom: 1px solid #e7edf3;
        }
        .reg-review-label { color: #4a5a6a; font-size: 16px; grid-column: 1 / -1; }
        .reg-review-value { font-weight: 600; overflow-wrap: anywhere; }
        .reg-link {
          font: inherit; font-size: 16px; background: none; border: 0;
          padding: 0.4rem; min-height: 48px; color: #0f6f5c;
          text-decoration: underline; cursor: pointer;
        }
        .reg-nudge {
          background: #eef6f4; border-radius: 12px; padding: 0.7rem 0.9rem; font-size: 16px;
        }
        .reg-consent { display: flex; gap: 0.6rem; align-items: flex-start; margin: 1.4rem 0; }
        .reg-consent input { width: 24px; height: 24px; margin-top: 0.25rem; }
        .reg-success {
          max-width: 32rem; margin: 0 auto; padding: 2rem 1rem;
          text-align: center; font-size: 18px; color: #16202b;
        }
        .reg-success-title { font-size: 1.4rem; }
        .reg-success-label { color: #4a5a6a; margin-bottom: 0.2rem; }
        .reg-success-code {
          font-size: 2.6rem; letter-spacing: 0.2em; font-weight: 700;
          color: #0f6f5c; margin: 0.2rem 0 1.5rem; direction: ltr;
        }
        .reg-success-note { color: #3b4a59; }
        .reg-success-emergency { font-weight: 700; color: #b3261e; }
        @media (prefers-reduced-motion: reduce) {
          .reg-progress-fill { transition: none; }
        }
      `}</style>

      <p className="reg-sr-only" aria-live="polite">
        {liveMessage}
      </p>

      <p className="reg-banner" role="note">
        {ar.demoWarning}
      </p>
      <p className="reg-emergency" role="note">{ar.emergencyNotice}</p>
      <p className="reg-clinic-note" role="note">{ar.clinicReviewNote}</p>

      {/* Honeypot: off-screen, not focusable, not read by screen readers. */}
      <input
        type="text"
        name="website"
        value={website}
        onChange={(event) => setWebsite(event.target.value)}
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="reg-sr-only"
      />

      <RegisterProgress step={step} total={TOTAL_STEPS} />

      {step === 1 ? (
        <section>
          <h1 className="reg-h1">{ar.register.step1Title}</h1>

          <div className="reg-field">
            <label className="reg-label" htmlFor="full_name">
              {ar.register.fullName}
            </label>
            <input
              id="full_name"
              ref={(element) => {
                refs.current.full_name = element;
              }}
              className="reg-input"
              type="text"
              autoComplete="name"
              placeholder={ar.register.fullNamePlaceholder}
              value={form.full_name}
              aria-invalid={Boolean(errors.full_name)}
              aria-describedby={errors.full_name ? "full_name-error" : undefined}
              onChange={(event) =>
                setForm((current) => ({ ...current, full_name: event.target.value }))
              }
            />
            {errors.full_name ? (
              <p className="reg-error" id="full_name-error">
                {errors.full_name}
              </p>
            ) : null}
          </div>

          <div className="reg-field">
            <label className="reg-label" htmlFor="phone">
              {ar.register.phone}
            </label>
            <input
              id="phone"
              ref={(element) => {
                refs.current.phone = element;
              }}
              className="reg-input"
              dir="ltr"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder={ar.register.phonePlaceholder}
              value={form.phone}
              aria-invalid={Boolean(errors.phone)}
              aria-describedby={errors.phone ? "phone-error" : undefined}
              onChange={(event) =>
                setForm((current) => ({ ...current, phone: event.target.value }))
              }
            />
            {errors.phone ? (
              <p className="reg-error" id="phone-error">
                {errors.phone}
              </p>
            ) : null}
          </div>

          <div className="reg-field">
            <label className="reg-label" htmlFor="email">
              {ar.register.email}
            </label>
            <input
              id="email"
              ref={(element) => {
                refs.current.email = element;
              }}
              className="reg-input"
              dir="ltr"
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder={ar.register.emailPlaceholder}
              value={form.email}
              aria-invalid={Boolean(errors.email)}
              aria-describedby={errors.email ? "email-error" : undefined}
              onChange={(event) =>
                setForm((current) => ({ ...current, email: event.target.value }))
              }
            />
            {errors.email ? (
              <p className="reg-error" id="email-error">
                {errors.email}
              </p>
            ) : null}
          </div>
        </section>
      ) : null}

      {step === 2 ? (
        <section>
          <h1 className="reg-h1">{ar.register.step2Title}</h1>
          <TapQuestions
            questions={QUESTIONS}
            answers={answers}
            onChange={(key, value) =>
              setAnswers((current) => ({ ...current, [key]: value }))
            }
          />
        </section>
      ) : null}

      {step === 3 ? (
        <section>
          <h1 className="reg-h1">{ar.register.step3Title}</h1>

          <div className="reg-field">
            <label className="reg-label" htmlFor="self_description">
              {registrationTextQuestions.selfDescription.label}
            </label>
            <textarea
              id="self_description"
              className="reg-textarea"
              maxLength={300}
              value={form.self_description}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  self_description: event.target.value,
                }))
              }
            />
            <p className="reg-counter">
              {ar.register.charCount(form.self_description.length, 300)}
            </p>
          </div>

          <div className="reg-field">
            <label className="reg-label" htmlFor="notes">
              {registrationTextQuestions.notes.label}
            </label>
            <textarea
              id="notes"
              className="reg-textarea"
              maxLength={500}
              value={form.notes}
              onChange={(event) =>
                setForm((current) => ({ ...current, notes: event.target.value }))
              }
            />
            <p className="reg-counter">
              {ar.register.charCount(form.notes.length, 500)}
            </p>
          </div>
        </section>
      ) : null}

      {step === 4 ? (
        <section>
          <h1 className="reg-h1">{ar.register.step4Title}</h1>

          <ReviewList
            form={{ ...form, answers }}
            questions={QUESTIONS}
            onEdit={(target) => setStep(target)}
          />

          <label className="reg-consent" htmlFor="consent">
            <input
              id="consent"
              type="checkbox"
              checked={consent}
              aria-invalid={Boolean(errors.consent)}
              aria-describedby={errors.consent ? "consent-error" : undefined}
              onChange={(event) => setConsent(event.target.checked)}
            />
            <span>{ar.register.consent}</span>
          </label>
          {errors.consent ? (
            <p className="reg-error" id="consent-error">
              {errors.consent}
            </p>
          ) : null}

          {submitError ? (
            <p className="reg-error" role="alert">
              {submitError}
            </p>
          ) : null}
        </section>
      ) : null}

      <div className="reg-actions">
        {step > 1 ? (
          <button
            type="button"
            className="reg-btn reg-btn-secondary"
            onClick={goBack}
            disabled={sending}
          >
            <span aria-hidden="true" className="reg-arrow">
              →
            </span>{" "}
            {ar.register.back}
          </button>
        ) : null}

        {step < TOTAL_STEPS ? (
          <button type="button" className="reg-btn" onClick={goNext}>
            {ar.register.next}{" "}
            <span aria-hidden="true" className="reg-arrow">
              ←
            </span>
          </button>
        ) : (
          <button
            type="button"
            className="reg-btn"
            onClick={handleSubmit}
            disabled={!canSubmit}
          >
            {sending ? ar.register.sending : ar.register.submit}
          </button>
        )}
      </div>
    </main>
  );
}