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
- `SCREENING_DEMO_MODE` - set to `true` only when intentionally using a draft
  screening instrument/ruleset for a demo. Local development enables demo
  scoring by default unless set to `false`; production requires this explicit
  opt-in. The `/screening` page keeps its demo-only warning visible. This does
  not approve or activate any clinical configuration.
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

### Screening diagnostics

Run `npm run screening:check` to verify the database path, screening schema,
scoring configuration, red-flag ruleset, Arabic and English content blocks,
and audit hash chain. At dev-server startup it runs in warning mode, so a
failed preflight does not prevent the app from starting. In demo mode, one
valid draft instrument and one valid draft ruleset may be used with the warning
visible; production should use clinician-approved and admin-activated records.

Run `npm run debug:screening -- --new` to create a synthetic screening session
and trace each API/database stage. To inspect an existing session without
printing the full id, run `npm run debug:screening -- <session-id>`; output
redacts the id to its first six characters and does not print answers or cookie
values.

For a manual voice check, set `GEMINI_API_KEY` in `.env.local`, restart the
server, and open `/voice-demo` in a browser over localhost or HTTPS. Choose a
synthetic phrase, allow microphone access, speak, press **إيقاف وإرسال للتحويل**,
and compare the editable transcript with the reference. This sends the
recording to Gemini and may use API quota. Also confirm the typing fallback
works and that no form is submitted automatically. Test `/register` and
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
- `/screening` - Arabic-first anonymous risk-band funnel with a safety gate and test navigation; clinical content is a placeholder
- `/survey` - redirects to `/screening`; the old AUSDRISK submission endpoints and nurse queue remain for previously submitted demo records
- `/voice-demo` - browser voice-input demo with synthetic phrases and approximate CER
- `/api/register` and `/api/intake` - validated, same-origin POST endpoints
- `/api/voice/transcribe` - same-origin, size-limited Gemini audio transcription endpoint
- `/api/health` - database availability check
- `/doctor/login` - staff sign-in
- `/doctor` - intake review queue with new, triaged, and all filters
- `/nurse/login` and `/nurse` - legacy nurse review for previously submitted survey records
- `/staff` - demo-grade screening staff sign-in
- `/staff/reviews` and `/staff/funnel` - screening clinician review queue and synthetic funnel metrics
- `/screening/locations` and `/screening/summary` - demo testing locations and printable referral summary
- `/doctor/[patientId]?intakeId=<id>` - patient record, follow-up history,
  selected intake details, editable questionnaire, staff notes, status/priority,
  and revision history
- `/doctor/[patientId]/summary` - staff case-summary view and history
- `/admin/intakes` - recent intakes, server-computed flags and review metadata
- `/admin/summaries` - latest 20 generated summaries for developer checks

The patient screens never show flags or medical interpretation. Red flags and
unanswered questions are computed by plain code on the server.

### Screening funnel — Phase 1 demo

The former `/survey` page now redirects to the replacement `/screening` funnel. The legacy AUSDRISK APIs and nurse queue remain available for earlier demo submissions, but are no longer the patient entry point. The replacement uses a data-driven 0–26 FINDRISC form, deterministic scoring, risk bands only, a red-flag gate, a symptom modifier, demo test locations, printable summaries, and unverified result entry to a clinician queue. The screening and result paths do not call an LLM.

This is not a diagnosis or emergency service. The 8-item FINDRISC form is the legacy version reproduced in [NICE evidence materials](https://www.nice.org.uk/guidance/ph38/evidence/ep2-implementing-diabetes-prevention-programmes-jaakko-tuomilehto-pdf-435077533), based on Lindström and Tuomilehto (2003; [DOI](https://doi.org/10.2337/diacare.26.3.725)). The Finnish Diabetes Association's current page now describes a broader combined test. Reproduction and translation terms were not clear in the reviewed public sources. The tool is not validated or calibrated for the Egyptian population. Bands only.

### Screening safety, placeholder items, and limits

FINDRISC points and cutpoints, product band mapping, symptom modifier, red-flag checklist, emergency number, test-result categories, all Arabic/English patient wording, consent text, and demo locations are placeholders requiring clinician, legal, or rights-holder review. No clinical item is approved by default. An emergency phone number remains unset; the screen instructs users to call their local emergency number. All test locations and funnel seed records are fake. Self-entered results are unverified and routed for clinician review. The result is not a diagnosis; clinicians must make medical decisions.

See [SCREENING.md](SCREENING.md) for setup, source and licensing notes, roles, privacy/deletion, scoring scripts, and current limitations. See [SCREENING-DEMO.md](SCREENING-DEMO.md) for the read-aloud demo. Set `SCREENING_*_USERNAME` / `SCREENING_*_PASSWORD` values in `.env.local` to seed demo staff users. Staff authentication is demo-grade and not production-ready.

The screening funnel collects contact details only under separate results-sharing consent. Test completion is not verified, and there is no reminder delivery or laboratory integration. A clinician can create a new patient and blank intake from a review when contact consent exists; the person's follow-up workflow is then visible in `/doctor`. Phase 2 has not started.

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

- In-visit session recording is a demo feature. Before any real use, the clinic
  must check recording laws, consent rules, and local clinic policy. Spoken names
  cannot be reliably removed from audio or transcripts. Use fake data only.
- Session recording requires `STT_GEMINI_MODEL` to be configured. Audio is not
  stored by the application; session transcript text is stored after processing.

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
