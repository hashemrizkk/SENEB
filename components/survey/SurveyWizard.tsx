"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import VoiceInput from "@/components/VoiceInput";
import { ar } from "@/lib/strings.ar";
import { appendTranscript } from "@/lib/voice-utils";
import {
  scoreFindrisc,
  type FindriscAnswers,
  type FindriscBand,
  type FindriscItem,
} from "@/lib/survey/findrisc";
import {
  surveyRedFlags,
  type SurveySymptoms,
} from "@/lib/survey/redflags";
import { setSurveyHandoff } from "@/lib/survey/handoff";
import type { SurveyPhrase } from "@/lib/survey/phrasing";

type Screen = "intro" | "symptoms" | "urgent" | "questions" | "result";
type QuestionKey =
  | "age"
  | "bmi"
  | "waist"
  | "activity"
  | "fruit_veg"
  | "antihypertensive"
  | "high_glucose"
  | "family_history";

const QUESTION_KEYS: readonly QuestionKey[] = [
  "age",
  "bmi",
  "waist",
  "activity",
  "fruit_veg",
  "antihypertensive",
  "high_glucose",
  "family_history",
];

const EMPTY_ANSWERS: FindriscAnswers = {
  age: null,
  sex: null,
  height_cm: null,
  weight_kg: null,
  waist_cm: null,
  activity: null,
  fruit_veg: null,
  antihypertensive: null,
  high_glucose: null,
  family_history: null,
};

const EMPTY_SYMPTOMS: SurveySymptoms = {
  extreme_thirst: null,
  rapid_weight_loss: null,
  blurred_vision: null,
  vomiting: null,
  confusion: null,
};

const FALLBACK_PHRASES: SurveyPhrase[] = ar.survey.questions.map((question) => ({
  key: question.item,
  question: question.question,
  options: [...question.options],
}));

const SYMPTOM_KEYS = [
  "extreme_thirst",
  "rapid_weight_loss",
  "blurred_vision",
  "vomiting",
  "confusion",
] as const;

function readPhraseReply(value: unknown): {
  phrases: SurveyPhrase[];
  mode: "llm" | "mock";
} | null {
  if (!value || typeof value !== "object") return null;
  const record = value as { phrases?: unknown; mode?: unknown };
  if (!Array.isArray(record.phrases)) return null;
  if (record.mode !== "llm" && record.mode !== "mock") return null;
  const phrases = record.phrases.filter(
    (phrase): phrase is SurveyPhrase =>
      Boolean(phrase) &&
      typeof phrase === "object" &&
      typeof (phrase as SurveyPhrase).key === "string" &&
      typeof (phrase as SurveyPhrase).question === "string" &&
      Array.isArray((phrase as SurveyPhrase).options) &&
      (phrase as SurveyPhrase).options.every((option) => typeof option === "string"),
  );
  if (phrases.length !== FALLBACK_PHRASES.length) return null;
  if (phrases.some((phrase, index) =>
    phrase.key !== FALLBACK_PHRASES[index]?.key ||
    phrase.options.length !== FALLBACK_PHRASES[index]?.options.length
  )) return null;
  return { phrases, mode: record.mode };
}

function parseNumber(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function fieldError(key: QuestionKey, answers: FindriscAnswers): string | null {
  if (key === "age") {
    return Number.isInteger(answers.age) && answers.age !== null &&
      answers.age >= 18 && answers.age <= 120
      ? null
      : ar.survey.ageInvalid;
  }
  if (key === "bmi") {
    if (
      answers.height_cm === null || answers.height_cm < 100 || answers.height_cm > 250
    ) return ar.survey.heightInvalid;
    if (
      answers.weight_kg === null || answers.weight_kg < 25 || answers.weight_kg > 300
    ) return ar.survey.weightInvalid;
    return null;
  }
  if (key === "waist") {
    if (answers.sex === null) return ar.survey.required;
    return answers.waist_cm !== null && answers.waist_cm >= 40 && answers.waist_cm <= 200
      ? null
      : ar.survey.waistInvalid;
  }
  if (key === "activity" || key === "fruit_veg" || key === "antihypertensive") {
    return null;
  }
  if (key === "high_glucose") {
    return answers.high_glucose === null ? ar.survey.required : null;
  }
  return null;
}

function bandName(band: FindriscBand): string {
  return ar.survey.bandNames[band];
}

function optionText(
  phrase: SurveyPhrase | undefined,
  index: number,
  fallback: string,
): string {
  return phrase?.options[index] ?? fallback;
}

function itemName(item: FindriscItem): string {
  return ar.survey.questions.find((question) => question.item === item)?.question ?? item;
}

export default function SurveyWizard() {
  const router = useRouter();
  const [screen, setScreen] = useState<Screen>("intro");
  const [answers, setAnswers] = useState<FindriscAnswers>(EMPTY_ANSWERS);
  const [symptoms, setSymptoms] = useState<SurveySymptoms>(EMPTY_SYMPTOMS);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [phrases, setPhrases] = useState(FALLBACK_PHRASES);
  const [phrasingMode, setPhrasingMode] = useState<"llm" | "mock">("mock");
  const [clarification, setClarification] = useState("");
  const [clarificationTranscript, setClarificationTranscript] = useState("");
  const [explanation, setExplanation] = useState<string>(ar.survey.explanationFallback);
  const [explanationMode, setExplanationMode] =
    useState<"llm" | "mock" | "fallback">("fallback");
  const [error, setError] = useState("");

  const result = useMemo(() => scoreFindrisc(answers), [answers]);
  const redFlags = useMemo(() => surveyRedFlags(symptoms), [symptoms]);
  const activeQuestion = QUESTION_KEYS[questionIndex];
  const activePhrase = phrases.find((phrase) => phrase.key === activeQuestion);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/survey/phrasing", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) return null;
        return readPhraseReply(await response.json());
      })
      .then((reply) => {
        if (!reply || controller.signal.aborted) return;
        setPhrases(reply.phrases);
        setPhrasingMode(reply.mode);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (screen !== "result") return;
    const controller = new AbortController();
    const payload = {
      band: result.band,
      unknownItems: result.unknownItems,
      redFlagSymptoms: redFlags.symptoms,
    };
    fetch("/api/survey/explain", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
      .then(async (response): Promise<{
        text: string;
        mode: "llm" | "mock" | "fallback";
      } | null> => {
        if (!response.ok) return null;
        const value: unknown = await response.json();
        if (!value || typeof value !== "object") return null;
        const record = value as { text?: unknown; mode?: unknown };
        if (
          typeof record.text !== "string" ||
          (record.mode !== "llm" && record.mode !== "mock" && record.mode !== "fallback")
        ) return null;
        const mode: "llm" | "mock" | "fallback" =
          record.mode === "llm"
            ? "llm"
            : record.mode === "mock"
              ? "mock"
              : "fallback";
        return {
          text: record.text,
          mode,
        };
      })
      .then((reply) => {
        if (!reply || controller.signal.aborted) return;
        setExplanation(reply.text);
        setExplanationMode(reply.mode);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [screen, result.band, result.unknownItems, redFlags.symptoms]);

  function beginSymptoms(): void {
    setScreen("symptoms");
    setError("");
  }

  function continueFromSymptoms(): void {
    setError("");
    if (redFlags.urgent) {
      setScreen("urgent");
      return;
    }
    setQuestionIndex(0);
    setScreen("questions");
  }

  function continueAfterUrgent(): void {
    setQuestionIndex(0);
    setScreen("questions");
  }

  function updateBoolean(
    key: "activity" | "fruit_veg" | "antihypertensive" | "high_glucose",
    value: boolean | null,
  ): void {
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
    setScreen("symptoms");
  }

  function convertToRegistration(): void {
    setSurveyHandoff({
      survey: { answers, symptoms },
      clarification: clarification.trim(),
    });
    router.push("/register");
  }

  const currentStep =
    screen === "intro" ? 0
      : screen === "symptoms" || screen === "urgent" ? 1
        : screen === "questions" ? questionIndex + 2
          : 9;

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
        .survey-link:focus-visible, .survey-textarea:focus-visible {
          outline: 3px solid #0f6f5c; outline-offset: 2px;
        }
        .survey-hint { margin: .25rem 0 .7rem; color: #455563; }
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
        .survey-urgent { padding: .8rem; border: 2px solid #b3261e; border-radius: 14px; background: #fff1f0; }
        .survey-result-band { margin: .5rem 0; font-size: 2rem; line-height: 1.3; }
        .survey-result-card { padding: 1rem; border: 1px solid #cbd7df; border-radius: 16px; background: #f8fbfc; }
        .survey-caveat { border-inline-start: 4px solid #ba7a00; padding-inline-start: .75rem; }
        .survey-next-step { font-weight: 700; }
        .survey-consent-note { padding: .85rem; border-radius: 12px; background: #f2f6f8; font-size: 16px; }
        .survey-small { font-size: 16px; color: #455563; }
        .survey-link { display: inline-flex; align-items: center; min-height: 48px; color: #075e54; font-weight: 700; }
        @media (prefers-reduced-motion: reduce) { .survey-fill { transition: none; } }
      `}</style>

      <p className="survey-banner survey-warning" role="note">{ar.demoWarning}</p>
      <p className="survey-banner survey-emergency" role="note">{ar.emergencyNotice}</p>
      <p className="survey-banner survey-disclaimer" role="note">{ar.survey.disclaimer}</p>

      {redFlags.urgent && screen !== "urgent" ? (
        <p className="survey-banner survey-urgent" role="alert">{ar.survey.urgentCareScreening}</p>
      ) : null}

      <div className="survey-progress" aria-label={ar.survey.progress(currentStep, 9)}>
        <p className="survey-progress-label">{ar.survey.progress(currentStep, 9)}</p>
        <div className="survey-track" role="progressbar" aria-valuemin={0} aria-valuemax={9} aria-valuenow={currentStep}>
          <div className="survey-fill" style={{ width: `${(currentStep / 9) * 100}%` }} />
        </div>
      </div>

      {screen === "intro" ? (
        <section>
          <h1 className="survey-title">{ar.survey.title}</h1>
          <p className="survey-copy">{ar.survey.intro}</p>
          <p className="survey-copy">{ar.survey.privacy}</p>
          <p className="survey-small">{phrasingMode === "mock" ? ar.survey.phrasingFallback : ""}</p>
          <button className="survey-button survey-primary" type="button" onClick={beginSymptoms}>
            {ar.survey.start}
          </button>
        </section>
      ) : null}

      {screen === "symptoms" ? (
        <section>
          <h1 className="survey-title">{ar.survey.symptomTitle}</h1>
          <p>{ar.survey.symptomHelp}</p>
          {SYMPTOM_KEYS.map((key) => (
            <fieldset className="survey-field" key={key} style={{ border: 0, padding: 0 }}>
              <legend className="survey-label">{ar.survey.symptoms[key]}</legend>
              <div className="survey-options">
                {[true, false].map((value) => (
                  <button
                    key={String(value)}
                    type="button"
                    className="survey-option"
                    aria-pressed={symptoms[key] === value}
                    onClick={() => setSymptoms((current) => ({ ...current, [key]: value }))}
                  >
                    {value ? ar.survey.yes : ar.survey.no}
                  </button>
                ))}
              </div>
            </fieldset>
          ))}
          <div className="survey-field">
            <label className="survey-label" htmlFor="symptom-clarification">{ar.survey.symptomClarification}</label>
            <textarea
              id="symptom-clarification"
              className="survey-input survey-textarea"
              maxLength={500}
              rows={3}
              value={clarification}
              onChange={(event) => setClarification(event.target.value)}
            />
            <VoiceInput
              id="survey-symptom-voice"
              label={ar.survey.symptomClarification}
              maxChars={500}
              transcript={clarificationTranscript}
              onTranscriptChange={setClarificationTranscript}
              onAppend={(text) => setClarification((current) => appendTranscript(current, text, 500))}
            />
          </div>
          <button className="survey-button survey-primary" type="button" onClick={continueFromSymptoms}>
            {ar.survey.next}
          </button>
        </section>
      ) : null}

      {screen === "urgent" ? (
        <section className="survey-urgent" role="alert">
          <h1 className="survey-title">{ar.survey.urgentTitle}</h1>
          <p>{ar.survey.urgentText}</p>
          <p>{ar.emergencyNotice}</p>
          <button className="survey-button survey-primary" type="button" onClick={continueAfterUrgent}>
            {ar.survey.continueAfterUrgent}
          </button>
        </section>
      ) : null}

      {screen === "questions" && activeQuestion ? (
        <section>
          <h1 className="survey-title">
            {activePhrase?.question ?? ar.survey.questions[questionIndex]?.question}
          </h1>
          {activeQuestion === "age" ? (
            <div className="survey-field">
              <label className="survey-label" htmlFor="survey-age">{ar.survey.age}</label>
              <input
                id="survey-age"
                className="survey-input"
                type="number"
                inputMode="numeric"
                min={18}
                max={120}
                value={answers.age ?? ""}
                onChange={(event) => setAnswers((current) => ({ ...current, age: parseNumber(event.target.value) }))}
              />
            </div>
          ) : null}
          {activeQuestion === "bmi" ? (
            <>
              <p>{ar.survey.bmiHint ?? ""}</p>
              <div className="survey-field">
                <label className="survey-label" htmlFor="survey-height">{ar.survey.height}</label>
                <input
                  id="survey-height"
                  className="survey-input"
                  type="number"
                  inputMode="decimal"
                  min={100}
                  max={250}
                  step="0.1"
                  value={answers.height_cm ?? ""}
                  onChange={(event) => setAnswers((current) => ({ ...current, height_cm: parseNumber(event.target.value) }))}
                />
              </div>
              <div className="survey-field">
                <label className="survey-label" htmlFor="survey-weight">{ar.survey.weight}</label>
                <input
                  id="survey-weight"
                  className="survey-input"
                  type="number"
                  inputMode="decimal"
                  min={25}
                  max={300}
                  step="0.1"
                  value={answers.weight_kg ?? ""}
                  onChange={(event) => setAnswers((current) => ({ ...current, weight_kg: parseNumber(event.target.value) }))}
                />
              </div>
            </>
          ) : null}
          {activeQuestion === "waist" ? (
            <>
              <div className="survey-field">
                <span className="survey-label">{ar.survey.sex}</span>
                <div className="survey-options">
                  {(["male", "female"] as const).map((sex) => (
                    <button
                      key={sex}
                      type="button"
                      className="survey-option"
                      aria-pressed={answers.sex === sex}
                      onClick={() => setAnswers((current) => ({ ...current, sex }))}
                    >
                      {sex === "male" ? ar.survey.male : ar.survey.female}
                    </button>
                  ))}
                </div>
              </div>
              <div className="survey-field">
                <label className="survey-label" htmlFor="survey-waist">{ar.survey.waist}</label>
                <p className="survey-hint">{ar.survey.waistHint}</p>
                <input
                  id="survey-waist"
                  className="survey-input"
                  type="number"
                  inputMode="decimal"
                  min={40}
                  max={200}
                  step="0.1"
                  value={answers.waist_cm ?? ""}
                  onChange={(event) => setAnswers((current) => ({ ...current, waist_cm: parseNumber(event.target.value) }))}
                />
              </div>
            </>
          ) : null}
          {activeQuestion === "activity" || activeQuestion === "fruit_veg" || activeQuestion === "antihypertensive" ? (
            <div className="survey-options">
              {[true, false, null].map((value) => (
                <button
                  key={String(value)}
                  type="button"
                  className="survey-option"
                  aria-pressed={answers[activeQuestion] === value}
                  onClick={() => updateBoolean(activeQuestion, value)}
                >
                  {value === null
                    ? optionText(activePhrase, 2, ar.survey.dontKnow)
                    : value
                      ? optionText(activePhrase, 0, ar.survey.yes)
                      : optionText(activePhrase, 1, ar.survey.no)}
                </button>
              ))}
            </div>
          ) : null}
          {activeQuestion === "high_glucose" ? (
            <div className="survey-options">
              {[true, false].map((value) => (
                <button
                  key={String(value)}
                  type="button"
                  className="survey-option"
                  aria-pressed={answers.high_glucose === value}
                  onClick={() => updateBoolean("high_glucose", value)}
                >
                  {value
                    ? optionText(activePhrase, 0, ar.survey.yes)
                    : optionText(activePhrase, 1, ar.survey.no)}
                </button>
              ))}
            </div>
          ) : null}
          {activeQuestion === "family_history" ? (
            <div className="survey-options">
              {[
                { value: "none" as const, label: ar.survey.noFamilyHistory },
                { value: "second_degree" as const, label: ar.survey.extendedFamilyHistory },
                { value: "first_degree" as const, label: ar.survey.closeFamilyHistory },
                { value: null, label: ar.survey.dontKnow },
              ].map(({ value, label }, index) => (
                <button
                  key={value ?? "unknown"}
                  type="button"
                  className="survey-option"
                  aria-pressed={answers.family_history === value}
                  onClick={() => setAnswers((current) => ({ ...current, family_history: value }))}
                >
                  {optionText(activePhrase, index, label)}
                </button>
              ))}
            </div>
          ) : null}
          {error ? <p className="survey-error" role="alert">{error}</p> : null}
          <div className="survey-actions">
            <button className="survey-button" type="button" onClick={previousQuestion}>{ar.survey.back}</button>
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
            <p className="survey-small">{ar.survey.resultBandLabel}</p>
            <p className="survey-result-band">{bandName(result.band)}</p>
            <p>{ar.survey.bandMeanings[result.band]}</p>
            <p>{explanation}</p>
            {explanationMode === "fallback" ? (
              <p className="survey-small">{ar.survey.phrasingFallback}</p>
            ) : null}
            {result.unknownItems.length ? (
              <p className="survey-caveat">
                {ar.survey.unknownCaveat}
                <span className="survey-small"> {result.unknownItems.map(itemName).join("، ")}</span>
              </p>
            ) : null}
            <p className="survey-next-step">{ar.survey.nextSteps[result.band]}</p>
          </div>
          {redFlags.urgent ? (
            <p className="survey-banner survey-urgent" role="alert">{ar.survey.urgentText}</p>
          ) : null}
          <p className="survey-banner survey-disclaimer">{ar.survey.disclaimer}</p>
          <div className="survey-actions">
            <button className="survey-button survey-primary" type="button" onClick={convertToRegistration}>
              {ar.survey.convert}
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
