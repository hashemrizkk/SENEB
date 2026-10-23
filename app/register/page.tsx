"use client";

import { useRef, useState } from "react";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import TapQuestions, {
  type TapAnswersState,
  type TapQuestion,
} from "@/components/TapQuestions";
import RegisterProgress from "@/components/register/RegisterProgress";
import ReviewList from "@/components/register/ReviewList";
import SuccessScreen from "@/components/register/SuccessScreen";
import VoiceInput from "@/components/VoiceInput";
import {
  consentSchema,
  emailSchema,
  fullNameSchema,
  phoneSchema,
  registrationSchema,
} from "@/lib/registration";
import { ar } from "@/lib/strings.ar";
import { appendTranscript, deriveInputMethod } from "@/lib/voice-utils";
import {
  registrationQuestions,
  registrationTextQuestions,
} from "@/lib/questions";

const TOTAL_STEPS = 4;
const FIELD_ORDER = ["full_name", "phone", "email"];

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

function RegisterForm() {
  const searchParams = useSearchParams();
  const locale: "ar" | "en" = searchParams.get("lang") === "en" ? "en" : "ar";
  const copy = locale === "ar" ? ar.register : ar.register.en;
  const questions: TapQuestion[] = registrationQuestions.map((question) => ({
    key: question.key,
    label: locale === "en" ? question.labelEn ?? question.label : question.label,
  }));
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    full_name: "",
    phone: "",
    email: "",
    self_description: "",
    notes: "",
  });
  const [descriptionTranscript, setDescriptionTranscript] = useState("");
  const [notesTranscript, setNotesTranscript] = useState("");
  const [voicePieces, setVoicePieces] = useState({
    self_description: [] as string[],
    notes: [] as string[],
  });
  const [voiceTextEdited, setVoiceTextEdited] = useState({
    self_description: false,
    notes: false,
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

  function localizeValidation(message: string): string {
    const entry = Object.entries(ar.register.errors).find(([, arabic]) => arabic === message);
    return entry ? copy.errors[entry[0] as keyof typeof copy.errors] : message;
  }

  const descriptionValue = form.self_description;

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
    if (!name.success) found.full_name = localizeValidation(name.error.issues[0].message);

    const phone = phoneSchema.safeParse(form.phone);
    if (!phone.success) {
      found.phone = localizeValidation(phone.error.issues[0].message);
    } else if (phone.data !== form.phone) {
      setForm((current) => ({ ...current, phone: phone.data }));
    }

    if (form.email.trim() !== "") {
      const email = emailSchema.safeParse(form.email);
      if (!email.success) found.email = localizeValidation(email.error.issues[0].message);
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
      const found = { consent: localizeValidation(consentCheck.error.issues[0].message) };
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
      self_description: descriptionValue,
      answers,
      notes: form.notes,
      input_method: deriveInputMethod({
        texts: [descriptionValue, form.notes],
        transcriptPieces: [voicePieces.self_description, voicePieces.notes],
        editedAfterAppend: [
          voiceTextEdited.self_description,
          voiceTextEdited.notes,
        ],
        maxChars: [300, 500],
      }),
      consent,
      website,
      request_id: activeRequestId,
    };

    const parsed = registrationSchema.safeParse(payload);
    if (!parsed.success) {
      setSubmitError(localizeValidation(parsed.error.issues[0]?.message ?? copy.errorGeneric));
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
            ? copy.errorRateLimited
            : reply.error === "server_error"
              ? copy.errorServer
              : copy.errorGeneric,
        );
        return;
      }

      setReferenceCode(reply.reference_code ?? null);
      setDone(true);

      // Everything was in React state only — clear it now.
      setForm({ full_name: "", phone: "", email: "", self_description: "", notes: "" });
      setDescriptionTranscript("");
      setNotesTranscript("");
      setVoicePieces({ self_description: [], notes: [] });
      setVoiceTextEdited({ self_description: false, notes: false });
      setAnswers(emptyAnswers());
      setConsent(false);
      setWebsite("");
    } catch {
      const offline = typeof navigator !== "undefined" && !navigator.onLine;
      setSubmitError(
        controller.signal.aborted
          ? copy.errorSlow
          : offline
            ? copy.errorOffline
            : copy.errorGeneric,
      );
    } finally {
      submitInFlight.current = false;
      clearTimeout(timer);
      setSending(false);
    }
  }

  if (done) {
    return (
      <SuccessScreen
        referenceCode={referenceCode}
        locale={locale}
      />
    );
  }

  const canSubmit = !sending;

  return (
    <main dir={locale === "ar" ? "rtl" : "ltr"} lang={locale} className="reg-page">
      <style>{`
        .reg-page {
          max-width: 32rem; margin: 0 auto; padding: 1rem 1rem 2.5rem;
          font-size: 18px; line-height: 1.7; color: var(--text);
          background: var(--bg); min-height: 100dvh;
        }
        .reg-sr-only {
          position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
          overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0;
        }
        .reg-banner {
          background: var(--important-bg); border: 1px solid var(--important-border); color: var(--important-text);
          border-radius: var(--radius-control); padding: 0.65rem 0.9rem; font-size: 16px;
          font-weight: 600; margin: 0 0 1rem;
        }
        .reg-emergency {
          background: var(--urgent-bg); border: 1px solid var(--urgent-border); color: var(--urgent-text);
          border-radius: var(--radius-control); padding: 0.65rem 0.9rem; font-weight: 700;
          margin: 0 0 0.65rem;
        }
        .reg-clinic-note { margin: 0 0 1rem; color: var(--text-secondary); }
        .reg-progress { margin-bottom: 1.25rem; }
        .reg-progress-label { margin: 0 0 0.4rem; font-size: 16px; color: var(--text-secondary); }
        .reg-progress-track {
          height: 8px; background: var(--track); border-radius: 999px; overflow: hidden;
        }
        .reg-progress-fill {
          height: 100%; background: var(--primary-strong); border-radius: 999px;
        }
        .reg-h1 { font-size: 1.35rem; margin: 0 0 1rem; }
        .reg-field { margin-bottom: 1.15rem; }
        .reg-label { display: block; font-weight: 600; margin-bottom: 0.35rem; }
        .reg-input, .reg-textarea {
          width: 100%; box-sizing: border-box; font: inherit; font-size: 18px;
          padding: 0.7rem 0.85rem; border: 1.5px solid var(--control-border); border-radius: var(--radius-control);
          background: var(--surface); color: var(--text); min-height: 48px;
        }
        .reg-input[dir="ltr"] { text-align: end; }
        .reg-textarea { min-height: 96px; resize: vertical; }
        .reg-input:focus-visible, .reg-textarea:focus-visible,
        .reg-btn:focus-visible, .reg-link:focus-visible, .tap-btn:focus-visible,
        .reg-consent input:focus-visible {
          outline: 3px solid var(--focus-ring); outline-offset: 2px;
        }
        .reg-input[aria-invalid="true"], .reg-textarea[aria-invalid="true"] {
          border-color: var(--urgent-border);
        }
        .reg-error { color: var(--urgent-text); font-size: 16px; margin: 0.35rem 0 0; }
        .reg-counter { color: var(--text-secondary); font-size: 15px; margin: 0.25rem 0 0; text-align: start; }
        .reg-actions { display: flex; gap: 0.75rem; margin-top: 1.5rem; }
        .reg-btn {
          font: inherit; font-size: 18px; min-height: 48px; padding: 0.7rem 1.4rem;
          border-radius: var(--radius-control); border: 1.5px solid var(--primary-strong); cursor: pointer;
          background: var(--primary-strong); color: #fff; font-weight: 600; flex: 1;
        }
        .reg-btn:disabled { opacity: 0.55; cursor: not-allowed; }
        .reg-btn-secondary { background: var(--surface); color: var(--primary-strong); }
        .reg-arrow { font-size: 20px; }
        .tap-question { border: 0; padding: 0; margin: 0 0 1.1rem; }
        .tap-legend { font-weight: 600; padding: 0; margin-bottom: 0.45rem; }
        .tap-row { display: flex; gap: 0.6rem; }
        .tap-btn {
          font: inherit; font-size: 18px; min-height: 48px; min-width: 96px;
          padding: 0.6rem 1.2rem; border-radius: var(--radius-control);
          border: 1.5px solid var(--control-border); background: var(--surface); color: var(--text); cursor: pointer;
        }
        .tap-btn-on { background: var(--primary-strong); border-color: var(--primary-strong); color: #fff; font-weight: 600; }
        .reg-review-row {
          display: grid; grid-template-columns: 1fr auto; gap: 0.15rem 0.75rem;
          padding: 0.7rem 0; border-bottom: 1px solid var(--card-border);
        }
        .reg-review-label { color: var(--text-secondary); font-size: 16px; grid-column: 1 / -1; }
        .reg-review-value { font-weight: 600; overflow-wrap: anywhere; }
        .reg-link {
          font: inherit; font-size: 16px; background: none; border: 0;
          padding: 0.4rem; min-height: 48px; color: var(--primary-strong);
          text-decoration: underline; cursor: pointer;
        }
        .reg-nudge {
          background: var(--secondary); border-radius: var(--radius-control); padding: 0.7rem 0.9rem; font-size: 16px;
        }
        .reg-consent { display: flex; gap: 0.6rem; align-items: flex-start; margin: 1.4rem 0; }
        .reg-consent input { width: 24px; height: 24px; margin-top: 0.25rem; }
        .reg-success {
          box-sizing: border-box; width: 100%; max-width: 34rem; min-width: 0;
          margin: clamp(1rem, 5vh, 3rem) auto; padding: clamp(1.25rem, 5vw, 2.5rem);
          text-align: center; font-size: 18px; color: var(--text);
          border: 1px solid var(--card-border); border-radius: var(--radius-card);
          background: var(--surface); box-shadow: var(--shadow-soft);
        }
        .reg-success-mark {
          display: grid; place-items: center; width: 3.5rem; height: 3.5rem;
          margin: 0 auto 1rem; border-radius: 50%; background: var(--success-bg);
          color: var(--success-text); font-size: 2rem; font-weight: 700;
        }
        .reg-success-title { margin: 0 0 1.5rem; font-size: clamp(1.45rem, 5vw, 2rem); line-height: 1.35; overflow-wrap: anywhere; }
        .reg-success-reference {
          margin: 0 auto 1.25rem; padding: 1rem; border: 1px solid var(--card-border);
          border-radius: var(--radius-control); background: var(--surface-sunken);
        }
        .reg-success-label { color: var(--text-secondary); margin: 0 0 0.4rem; }
        .reg-success-code {
          display: block; max-width: 100%; font-size: clamp(1.5rem, 8vw, 2.4rem);
          letter-spacing: 0.12em; font-weight: 700; color: var(--primary-strong);
          overflow-wrap: anywhere; unicode-bidi: isolate;
        }
        .reg-success-note, .reg-success-emergency {
          display: flex; align-items: flex-start; gap: 0.65rem; padding: 0.8rem 1rem;
          border-radius: var(--radius-control); text-align: start; overflow-wrap: anywhere;
        }
        .reg-success-note { color: var(--text-secondary); background: var(--surface-sunken); }
        .reg-success-emergency { font-weight: 700; color: var(--urgent-text); background: var(--urgent-bg); border: 1px solid var(--urgent-border); }
        .reg-success-note span, .reg-success-emergency span { flex: none; }
      `}</style>

      <p className="reg-sr-only" aria-live="polite">
        {liveMessage}
      </p>

      <p className="reg-banner" role="note">
        {copy.demoWarning}
      </p>
      <p className="reg-emergency" role="note">{copy.emergencyNotice}</p>
      <p className="reg-clinic-note" role="note">{copy.clinicReviewNote}</p>

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

      <RegisterProgress step={step} total={TOTAL_STEPS} locale={locale} />

      {step === 1 ? (
        <section>
          <h1 className="reg-h1">{copy.step1Title}</h1>

          <div className="reg-field">
            <label className="reg-label" htmlFor="full_name">
              {copy.fullName}
            </label>
            <input
              id="full_name"
              ref={(element) => {
                refs.current.full_name = element;
              }}
              className="reg-input"
              type="text"
              autoComplete="name"
              placeholder={copy.fullNamePlaceholder}
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
              {copy.phone}
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
              placeholder={copy.phonePlaceholder}
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
              {copy.email}
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
              placeholder={copy.emailPlaceholder}
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
          <h1 className="reg-h1">{copy.step2Title}</h1>
          <TapQuestions
            questions={questions}
            answers={answers}
            yesLabel={copy.yes}
            noLabel={copy.no}
            onChange={(key, value) =>
              setAnswers((current) => ({ ...current, [key]: value }))
            }
          />
        </section>
      ) : null}

      {step === 3 ? (
        <section>
          <h1 className="reg-h1">{copy.step3Title}</h1>

          <div className="reg-field">
            <label className="reg-label" htmlFor="self_description">
              {locale === "ar" ? registrationTextQuestions.selfDescription.label : registrationTextQuestions.selfDescription.labelEn ?? registrationTextQuestions.selfDescription.label}
            </label>
            <textarea
              id="self_description"
              className="reg-textarea"
              maxLength={300}
              value={descriptionValue}
              onChange={(event) => {
                if (voicePieces.self_description.length) {
                  setVoiceTextEdited((current) => ({
                    ...current,
                    self_description: true,
                  }));
                }
                setForm((current) => ({
                  ...current,
                  self_description: event.target.value,
                }));
              }}
            />
            <VoiceInput
              id="registration-description-voice"
              label={locale === "ar" ? registrationTextQuestions.selfDescription.label : registrationTextQuestions.selfDescription.labelEn ?? registrationTextQuestions.selfDescription.label}
              maxChars={300}
              transcript={descriptionTranscript}
              onTranscriptChange={setDescriptionTranscript}
              onAppend={(value, speechPieces) => {
                setVoicePieces((current) => ({
                  ...current,
                  self_description: [...current.self_description, ...speechPieces],
                }));
                setForm((current) => ({
                  ...current,
                  self_description: appendTranscript(current.self_description, value, 300),
                }));
              }}
              autoAppend
              showTranscript={false}
              direction={locale === "ar" ? "rtl" : "ltr"}
              locale={locale}
            />
            <p className="reg-counter">
              {copy.charCount(descriptionValue.length, 300)}
            </p>
          </div>

          <div className="reg-field">
            <label className="reg-label" htmlFor="notes">
              {locale === "ar" ? registrationTextQuestions.notes.label : registrationTextQuestions.notes.labelEn ?? registrationTextQuestions.notes.label}
            </label>
            <textarea
              id="notes"
              className="reg-textarea"
              maxLength={500}
              value={form.notes}
              onChange={(event) => {
                if (voicePieces.notes.length) {
                  setVoiceTextEdited((current) => ({ ...current, notes: true }));
                }
                setForm((current) => ({ ...current, notes: event.target.value }));
              }}
            />
            <VoiceInput
              id="registration-notes-voice"
              label={locale === "ar" ? registrationTextQuestions.notes.label : registrationTextQuestions.notes.labelEn ?? registrationTextQuestions.notes.label}
              maxChars={500}
              transcript={notesTranscript}
              onTranscriptChange={setNotesTranscript}
              onAppend={(value, speechPieces) => {
                setVoicePieces((current) => ({
                  ...current,
                  notes: [...current.notes, ...speechPieces],
                }));
                setForm((current) => ({
                  ...current,
                  notes: appendTranscript(current.notes, value, 500),
                }));
              }}
              autoAppend
              showTranscript={false}
              direction={locale === "ar" ? "rtl" : "ltr"}
              locale={locale}
            />
            <p className="reg-counter">
              {copy.charCount(form.notes.length, 500)}
            </p>
          </div>
        </section>
      ) : null}

      {step === 4 ? (
        <section>
          <h1 className="reg-h1">{copy.step4Title}</h1>

          <ReviewList
            form={{ ...form, self_description: descriptionValue, answers }}
            questions={questions}
            onEdit={(target) => setStep(target)}
            locale={locale}
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
            <span>
              {copy.consent}
            </span>
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
              {locale === "ar" ? "→" : "←"}
            </span>{" "}
            {copy.back}
          </button>
        ) : null}

        {step < TOTAL_STEPS ? (
          <button type="button" className="reg-btn" onClick={goNext}>
            {copy.next}{" "}
            <span aria-hidden="true" className="reg-arrow">
              {locale === "ar" ? "←" : "→"}
            </span>
          </button>
        ) : (
          <button
            type="button"
            className="reg-btn"
            onClick={handleSubmit}
            disabled={!canSubmit}
          >
            {sending ? copy.sending : copy.submit}
          </button>
        )}
      </div>
    </main>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<main dir="rtl" lang="ar" className="reg-page">{ar.register.step1Title}</main>}>
      <RegisterForm />
    </Suspense>
  );
}
