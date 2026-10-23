# AI, audio, and provider data

This document describes current calls in lib/llm.ts, lib/gemini-audio.ts, app/api/voice/transcribe/route.ts, and the session API routes. Text-generation calls are server-side.

## Components and model IDs

| Work | Provider order and model |
| --- | --- |
| Intake extraction | Gemini gemini-3.8-flash, then Groq model selected by GROQ_MODEL. |
| Case-summary narrative | Groq model selected by GROQ_MODEL. Code computes facts, priority, and verifies quoted highlights. |
| Note checks, session summary, and role inference | Groq model selected by GROQ_MODEL. These are drafts or documentation checks for staff. |
| Survey wording, follow-up-plan and patient-recap drafts | Configured text provider sequence (Gemini, then Groq); clinic staff review the result. |
| After-work note rating | Configured text provider sequence with schema, language, safety-word, and quote checks; code computes profile completeness. |
| Patient voice transcription | Gemini model selected by STT_GEMINI_MODEL (default gemini-3.8-flash), then Groq Whisper whisper-large-v3. |
| Doctor-note dictation | Gemini only, selected by STT_GEMINI_MODEL (default gemini-3.8-flash). |
| Visit-session transcription | Gemini model from STT_GEMINI_MODEL; configured fallback can return unattributed text. |
| Screening | No model call for scoring, result category, or red-flag matching. |

The Groq text model is not hard-coded: GROQ_MODEL must contain the selected provider model identifier. Gemini text extraction uses a code constant. Voice transcription uses a separate setting. Change provider keys and supported model settings in the server environment, then restart or redeploy. Do not put credentials in client code.

## Fallback and guardrails

Text generation uses temperature 0, disabled SDK retries where configured, abort timeouts, structured Zod output, and server validation. Provider fallback happens for retryable errors and invalid output. A non-retryable provider client error can skip the next provider. If extraction has no usable result, it returns null fields and marks the intake for review. With no configured extraction providers, deterministic mock extraction is labelled mock.

The extraction prompt treats patient input as data, not instructions. It only extracts statements and leaves unknown fields null. Tap answers override extracted values for overlapping fields. Summary text may include a code-only fallback; the mode is recorded. Plain code computes red flags and priority. No AI output makes the final clinic decision.

The configured models and generation rules are implementation details, not a clinical or language-accuracy guarantee. The evaluation scripts use synthetic examples and have not established accuracy, time saved, or production reliability.

## Voice pipeline

1. The browser requests microphone permission and records with MediaRecorder. Recording is stopped by the user or an app time limit.
2. Browser-side code decodes audio and normalizes it to mono, 16 kHz WAV. The API accepts WAV only.
3. Each recording is posted to /api/voice/transcribe after capture. Doctor session capture rotates the recorder about every 45 seconds and sends chunks with sequence metadata.
4. The route checks origin, a local rate limit, MIME type, chunk metadata, byte size, WAV header, duration where configured, and language.
5. Provider order depends on context: patient transcription can fall back from Gemini to Groq; doctor dictation requires Gemini; session chunks use Gemini session transcription with a Groq text fallback path if configured.
6. The browser displays an editable transcript. The user must review it and choose to add it to the field. The application does not submit the form automatically.
7. Audio is not written to the app database. Patient form text is persisted only when the patient submits the form. Visit-session transcript text is stored in session utterance rows and can be deleted through the session workflow. Provider-side handling is governed by the provider's terms.

Patient clips are limited to 4 MiB; doctor-note clips allow 8 MiB in the application. The transcription timeout defaults to 90 seconds and accepts up to 120 seconds. The doctor-note route has a 260-second maximum duration declaration; platform limits can be lower. A Vercel request-size limit may reject the 8 MiB application allowance before the route sees it.

The supported language hints are auto, ar-EG, ar, and en-US. They do not ensure dialect, names, medication, or number accuracy. The transcript must be checked.

## Privacy and provider transfers

When enabled, intake extraction sends free text to the configured text provider. The case-summary payload contains recorded age, diabetes type, structured intake answers, care-gap values, and original intake text. The summary flow does not need the patient's name or phone number. Visit-session audio and transcript are more sensitive: audio goes to a speech provider, and transcript text may go to Groq for session summarization or role inference. Review provider terms before any external calls.

The app records provider/mode metadata and non-content error information. Transcription logs provider/model and operational timing, not transcript text. Session transcripts are stored in SQLite after transcription until deleted through the session flow. Audio itself is not persisted by the application.

Google and Groq terms, quotas, model availability, and free tiers can change. See [Gemini pricing and rate limits](https://ai.google.dev/gemini-api/docs/pricing) and [Groq models](https://console.groq.com/docs/models). No current per-request costs or accuracy rates are measured by this project.

The UI shows microphone-consent wording before capture and a transcript review step. These controls do not establish legal compliance, provider retention guarantees, or suitability for real patient data. Use synthetic content only.
