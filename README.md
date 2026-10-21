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

- `GOOGLE_GENERATIVE_AI_API_KEY` - optional; tried first for extraction.
- `GROQ_API_KEY` - optional; tried after Google if configured.
- `DOCTOR_NAME` and `DOCTOR_PASSWORD` - the configured clinician's sign-in
  credentials. Both must be set to enable named sign-in.
- `DOCTOR_PASSCODE` - optional legacy shared passcode, used only when neither
  named credential is configured.
- `SESSION_SECRET` - signing key of at least 32 bytes. Generate one with
  `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"`.
- `NEXT_PUBLIC_SITE_URL` - canonical site origin used by same-origin checks.
- `HACKATHON_DB_PATH` - optional SQLite path; useful for testing without
  changing the default `hackathon.db`.

With no LLM keys, the app uses clearly marked mock extraction and flags it for
clinic review. A provider outage does not prevent an intake from being saved.
Staff sign in at `/doctor/login`; with named credentials configured, both the
name and password are verified before the name is recorded with edits. The
legacy shared passcode does not independently verify a clinician's identity.
This is a demo authentication mechanism, not a production patient-data
security system.

## Checks

```sh
npm run typecheck
npm run lint
npm run build
npm run test:doctor
npm run test:summary
npm run smoke:summary
```

Start the dev server in one terminal, then run the HTTP regression tests in a
second terminal:

```sh
npm run test:register
```

`npm run test:register` uses fictional records and creates test rows in the
local database. `npm run test:doctor` uses an isolated in-memory database to
check migration repeatability, legacy queue import, revisions, edit conflicts,
and signed sessions; it does not reset or write `hackathon.db`.
`npm run db:check` prints database counts. `npm run db:reset` deletes and
recreates the local database with 15 fictional patients; do not run it if you
need to preserve local data.

## Routes

- `/register` - patient registration and first follow-up
- `/api/register` - validated, same-origin registration endpoint
- `/api/intake` - existing validated intake endpoint retained for compatibility
- `/api/health` - database availability check
- `/doctor/login` - staff sign-in
- `/doctor` - intake review queue with new, triaged, and all filters
- `/doctor/[patientId]?intakeId=<id>` - patient record, follow-up history,
  selected intake details, editable questionnaire, staff notes, status/priority,
  and revision history
- `/doctor/[patientId]/summary` - staff case-summary view and history
- `/admin/intakes` - recent intakes, server-computed flags and review metadata
- `/admin/summaries` - latest 20 generated summaries for developer checks

The patient screens never show flags or medical interpretation. Red flags and
unanswered questions are computed by plain code on the server.

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
