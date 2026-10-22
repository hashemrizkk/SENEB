# Chronic-care follow-up assistant

A demo of a diabetes follow-up assistant for Egyptian primary-care clinics.
Patient-facing content is Egyptian Arabic and right-to-left. The AI extracts
information from free text; clinic staff review it and make every medical
decision. The included patient records are fictional.

## Requirements

- Node.js 22.13 or newer
- npm

## Run locally

```sh
npm install
npm run dev
```

Open `http://localhost:3000/register` to register a demo patient.
SQLite creates and seeds `hackathon.db` automatically. The database file is
ignored by Git.

## Environment

Copy `.env.example` to `.env.local`.

- `GEMINI_API_KEY` - optional; tried first for extraction and summaries.
- `GROQ_API_KEY` - optional; tried after Gemini if configured.
- `GOOGLE_GENERATIVE_AI_API_KEY` - legacy alias accepted when
  `GEMINI_API_KEY` is unset.
- `DOCTOR_NAME` and `DOCTOR_PASSWORD` - the configured clinician's sign-in
  credentials. Both must be set to enable named sign-in.
- `DOCTOR_PASSCODE` - optional legacy shared passcode, used only when neither
  named credential is configured.
- `NURSE_NAME` and `NURSE_PASSWORD` - separate credentials for the nurse survey
  queue at `/nurse`; nurse and doctor sessions use different signed roles.
- `SESSION_SECRET` - signing key of at least 32 bytes. Generate one with
  `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"`.
- `NEXT_PUBLIC_SITE_URL` - canonical site origin used by same-origin checks.
- `HACKATHON_DB_PATH` - optional SQLite path; useful for testing without
  changing the default `hackathon.db`.
- `RESEND_API_KEY` and `RESEND_FROM_EMAIL` - optional server-only Resend
  settings for nurse survey decision emails. Sending stays disabled unless
  both are valid. Resend requires a verified sender domain.

With no LLM keys, the app uses clearly marked mock extraction and flags it for
clinic review. Gemini is attempted first, followed by Groq when configured.
Requests have bounded timeouts and SDK retries are disabled so the app controls
fallback behavior. Rate/quota limits, timeouts, network/server failures, and
invalid structured output can trigger the fallback. Non-retryable provider
client errors do not; extraction then produces empty fields marked for staff
review, and the intake can still be saved. Summary failures use the existing
code-generated fallback.

The configured models are `gemini-3.8-flash` and `openai/gpt-oss-20b`.
Provider quotas and prices depend on the provider, model, account, and current
terms; do not assume either service is unlimited or free. Check the providers'
current [Gemini pricing and usage terms](https://ai.google.dev/gemini-api/docs/pricing),
[Gemini rate limits](https://ai.google.dev/gemini-api/docs/rate-limits),
[Groq model availability and pricing](https://console.groq.com/docs/models),
and [Groq rate limits](https://console.groq.com/docs/rate-limits) before use.

### Third-party data and privacy

When an LLM key is configured, extraction sends the patient's free-text answer
to that provider. Case summaries send age, recorded diabetes type, structured
intake answers, care-gap values, and the patient's original intake text. Names
and phone numbers are not included in these LLM payloads. The application logs
provider names and error classes, not prompt text or provider response bodies.
Provider requests are external data transfers: Google documents that some
Gemini free-tier content may be used to improve its products, and provider
retention/processing terms can change. Review the current terms linked above
before using any real or sensitive information; this demo is not approved for
real patient data.

### Voice input

The optional voice widget records audio with `getUserMedia` and `MediaRecorder`
in browsers that support them; microphone access requires permission and a
secure context (HTTPS or localhost). Browser recordings are decoded and
normalized to mono 16 kHz WAV before sending, to avoid codec incompatibility.
Recordings stop automatically after 30 seconds, are limited to 8 MB, and are
sent to this app's `/api/voice/transcribe` route only after the user stops
recording. The route sends audio to Gemini
(`gemini-3.8-flash`) using the server-side Gemini key and does not persist audio
or log the transcript. This audio transfer uses provider quota and is subject
to Google's current processing and retention terms. Do not use real patient
audio in this demo.

Choose a language hint (`ar-EG`, `ar`, or `en-US`); it is not a guarantee of
accurate dialect recognition or code-switching. The user can review/edit the
returned transcript and must press **أضف إلى الحقل** before inserting it; the
form is never auto-submitted. After insertion and ordinary form submission,
the text follows the existing patient text processing and storage flow. The
standalone `/voice-demo` uses synthetic sample phrases and reports an
approximate character error rate (CER), ignoring spaces, punctuation, and
Arabic diacritics for that estimate; it does not save a transcript.

With named credentials configured, both the clinician's name and password are
verified before the name is recorded with edits. The legacy shared passcode
does not independently verify a clinician's identity.
This is a demo authentication mechanism, not a production patient-data
security system.

## Checks

```sh
npm run typecheck
npm run lint
npm run build
npm run test:doctor
npm run test:summary
npm run test:providers
npm run test:voice
npm run test:voice-api
npm run test:audio-wav
npm run smoke:summary
```

For a manual voice check, set `GEMINI_API_KEY` in `.env.local`, restart the
server, and open `/voice-demo` in a browser over localhost or HTTPS. Choose a
synthetic phrase, allow microphone access, speak, press **إيقاف وإرسال للتحويل**,
and compare the editable transcript with the reference. This sends the
recording to Gemini and may use API quota. Also confirm the typing fallback
works and that no form is submitted automatically. Test `/register` and
`/intake` separately to confirm that **أضف إلى الحقل** appends reviewed text
without replacing existing typed text. Automated tests do not exercise a live
microphone or Gemini request.

To manually check provider priority, configure both provider keys in a local
`.env.local`, submit fictional test text, then check intake review metadata to
confirm Gemini is used when it succeeds. For fallback, temporarily use a
deliberately invalid Gemini key with a valid Groq key and check that extraction
uses Groq. Do not put keys in `.env.example`, commit them, or use real patient
data for this test.

Start the dev server in one terminal, then run the HTTP regression tests in a
second terminal:

```sh
npm run test:register
```

`npm run test:register` uses fictional records and creates test rows in the
local database. `npm run test:doctor` uses an isolated in-memory database to
check migration repeatability, legacy queue import, revisions, edit conflicts,
and role-separated signed sessions; it does not reset or write `hackathon.db`.
`npm run test:nurse` uses and removes a uniquely named temporary SQLite file
to test survey submission idempotency, nurse decisions, and mocked email sending.
`npm run db:check` prints database counts. `npm run db:reset` deletes and
recreates the local database with 15 fictional patients; do not run it if you
need to preserve local data.

## Routes

- `/register` - patient registration and first follow-up
- `/survey` - standalone Arabic AUSDRISK diabetes-screening questionnaire; optionally submit answers with an email address and explicit email consent for nurse review; it is not an ER triage tool
- `/intake` and `/intake/[id]` - follow-up for a seeded patient
- `/voice-demo` - browser voice-input demo with synthetic phrases and approximate CER
- `/api/register` and `/api/intake` - validated, same-origin POST endpoints
- `/api/voice/transcribe` - same-origin, size-limited Gemini audio transcription endpoint
- `/api/health` - database availability check
- `/doctor/login` - staff sign-in
- `/doctor` - intake review queue with new, triaged, and all filters
- `/nurse/login` - separate nurse sign-in
- `/nurse` - private survey-review queue; nurses choose and audit a patient action
- `/doctor/[patientId]?intakeId=<id>` - patient record, follow-up history,
  selected intake details, editable questionnaire, staff notes, status/priority,
  and revision history
- `/doctor/[patientId]/summary` - staff case-summary view and history
- `/admin/intakes` - recent intakes, server-computed flags and review metadata
- `/admin/summaries` - latest 20 generated summaries for developer checks

The patient screens never show flags or medical interpretation. Red flags and
unanswered questions are computed by plain code on the server.

### Survey scoring and limits

The standalone survey does not navigate to `/register` or prefill a form. It
does not send or save answers unless the patient supplies contact details and
explicitly consents to clinic review and email contact. Submitted surveys
appear in the separate nurse queue; they are not sent to the doctor queue. The
LLM does not score, interpret, or triage survey answers.
The 2023 community study reported a cutoff
of 9 or more for screening abnormal glycemia and 13 or more for screening
undiagnosed diabetes. These are research screening thresholds, not diagnoses
or emergency-department criteria. Incomplete answers remain `null` and make
the clinician-side result incomplete; the patient never sees a score or
classification. The clinic team reviews submitted answers and makes care
decisions. Existing stored FINDRISC records remain readable as legacy data.

- Farag et al., *Arabic version of the Australian type 2 diabetes risk
  assessment tool (AUSDRISK): translation and validation* (2022),
  https://doi.org/10.1186/s13104-022-06200-2
- Farag et al., *Prevalence and predictors of undiagnosed type 2 diabetes and
  pre-diabetes among adult Egyptians: a community-based survey* (2023),
  https://doi.org/10.1186/s12889-023-15819-0

  In the 2023 study (719 adults), the ≥13 cutoff for undiagnosed diabetes had
  86.11% sensitivity, 73.35% specificity, and AUC 0.887; the ≥9 cutoff for
  abnormal glycemia had 80.73% sensitivity, 58.06% specificity, and AUC 0.767.
  These study estimates are not guarantees for an individual or for every clinic
  population. A score below a cutoff must not be used to reassure someone that
  they do not have diabetes, and this tool must not be used to rule out an ER
  visit. Unanswered items remain `null`; neither patients nor nurses receive an
automated emergency classification.

### Nurse survey review and email

The nurse reviews the answers and records one of three human-selected actions:
urgent ER referral, prompt clinical assessment, or no ER referral from this
review. These are the nurse's recorded decisions, not an LLM result or a
validated emergency triage protocol; in particular, no ER referral does not
rule out an emergency. AUSDRISK contains no acute-symptom assessment, so the
nurse must confirm a separate assessment using the clinic's approved process
before recording an action. The prototype supplies no ER protocol. The patient
always sees the static emergency contact notice, and the survey is never
presented as an ER assessment tool.

The patient must separately consent before survey and email details are stored.
The result email is sent only after a nurse records it. Sending uses Resend's
transactional email API; it stays disabled until `RESEND_API_KEY` and a verified
`RESEND_FROM_EMAIL` are configured on the server. The email contains only the
nurse's selected action and emergency safety wording, not survey answers or
scores. Its subject is generic to avoid exposing health details in inbox
previews. Provider acceptance does not confirm delivery. Never put the API key
in browser code, source control, or this README.

Resend currently lists a free transactional tier (3,000 emails/month, capped
at 100/day); limits and eligibility may change. A verified domain is required
for sending. Check the current [Resend pricing](https://resend.com/pricing) and
[verified-domain docs](https://resend.com/docs/dashboard/domains/introduction).

To exercise the workflow with synthetic data:

1. Set `NURSE_NAME`, `NURSE_PASSWORD`, and `SESSION_SECRET` in `.env.local`.
2. To enable email, also set `RESEND_API_KEY` and `RESEND_FROM_EMAIL` using a
   Resend API key and sender address on a verified domain. Keep the API key
   secret and restart the server.
3. Open `/survey`, use fictional details and an email you control, and check
   the email-consent box before submitting.
4. Sign in at `/nurse/login`, confirm the submission, choose an action, confirm
   the separate assessment, then use **Save and email patient**. Without
   Resend configuration, only **Save decision** is available.
5. Use synthetic survey data only. Check the recipient inbox and provider
   dashboard; provider acceptance is not proof the email arrived.

## Doctor review workflow

1. Set `DOCTOR_NAME`, `DOCTOR_PASSWORD`, and a randomly generated
   `SESSION_SECRET` in `.env.local`. Keep `.env.local` private and never commit
   real credentials; generate the session secret with the command above.
2. Start the app and open `/doctor/login`; sign in with fictional staff details.
3. Submit a fake patient registration through `/register`. It should appear in
   `/doctor` and refresh automatically.
4. Open a patient record. Use **Record a new clinic follow-up** to add a
   separate follow-up record, then select it from the record history. This
   appends a record without replacing registration or earlier follow-ups.
   Existing records can also be edited; those changes create a revision on the
   selected record. Add an optional note and reason when editing, then confirm
   the revision history shows the saved edit and staff note. Open the same
   intake in another tab before editing to check that a stale edit reports a
   conflict and keeps its unsaved text.
5. Sign out and confirm `/doctor` returns to sign-in. Registration remains
   available without staff authentication; follow-up recording is doctor-side.

Doctor-review migrations are additive and preserve legacy queue tables. Old
records receive a clearly marked reconstructed snapshot, not a claimed copy of
their original submission. Existing registration data may store a yes/no
low-sugar answer as a count of 1 or 0; the original yes/no meaning cannot be
recovered from that value.

## Case summary

The staff case-summary page combines intake answers, the patient's original
text, care-gap dates, keyword matches, verified highlights, and a short
narrative. Regenerating a summary creates a new immutable row; it does not
change the intake, the patient's record, or a queue.

- `/doctor` lists submitted intakes and assigned staff priorities.
- `/doctor/[patientId]/summary` shows the case summary, suggested priority, and
  the last five summaries.
- `/admin/summaries` is a developer check page, not for patients.
- Run `npm run test:summary` for pure-function and in-memory pipeline tests.
- Run `npm run smoke:summary` for end-to-end cases using fake intake rows.

Plain code decides the suggested priority. The LLM only writes the narrative
and proposes display-only highlights; code verifies every quoted highlight,
value, and AI inconsistency against the patient's original text. Staff make
every final decision. With no provider keys configured, summaries use clearly
marked mock text; a provider failure is recorded as a code-only fallback.

### Known limitations

- Rules, tiers, and thresholds are placeholders and must be reviewed by a
  clinician before any real use.
- The starter keyword list has not been clinically reviewed.
- Substring matching can over-flag.
- Nearby negation is annotated for staff but never trusted to lower a tier.
- The LLM can be wrong; quoted items are checked against the original text.
- Voice recognition is browser-dependent, may use a third-party speech service,
  and requires transcript review; it is not a medical transcription guarantee.
- Suggested priority is advice only, not a clinical decision or queue
  assignment. Queue priority is set by clinic staff.

## Deployment note

The current database is a local SQLite file under the app directory. Vercel's
serverless filesystem is not durable, and its deployed filesystem must not be
treated as writable persistent storage. On Vercel, writes may fail or appear to
work only temporarily/on one function instance; registrations and intakes can
be lost. Do not use this setup with real patient data.

The smallest durable migration is a hosted SQLite-compatible service such as
Turso, keeping the query and transaction boundary in `lib/db.ts`. Hosted
Postgres is another option but requires a larger SQL adaptation. The project
has not been switched to either database.
