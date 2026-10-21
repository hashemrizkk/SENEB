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

Open `http://localhost:3000/register` to register a demo patient or
`http://localhost:3000/intake` to use the seeded fictional patients.
SQLite creates and seeds `hackathon.db` automatically. The database file is
ignored by Git.

## Environment

Copy `.env.example` to `.env.local`.

- `GOOGLE_GENERATIVE_AI_API_KEY` — optional; tried first for extraction.
- `GROQ_API_KEY` — optional; tried after Google if configured.
- `ADMIN_KEY` — required to access `/admin/intakes` and `/doctor` in production.
  Send it as an `Authorization: Bearer …` header; it is never accepted in a URL.
- `NEXT_PUBLIC_SITE_URL` — canonical site origin used by same-origin checks.

With no LLM keys, the app uses clearly marked mock extraction and flags it for
clinic review. A provider outage does not prevent an intake from being saved.

## Checks

```sh
npm run typecheck
npm run lint
npm run build
```

Start the dev server in one terminal, then run the HTTP regression tests in a
second terminal:

```sh
npm run test:register
```

The test uses fictional records and creates test rows in the local database.
`npm run db:check` prints database counts. `npm run db:reset` deletes and
recreates the local database with 15 fictional patients.

## Routes

- `/register` — patient registration and first follow-up
- `/intake` and `/intake/[id]` — follow-up for a seeded patient
- `/api/register` and `/api/intake` — validated, same-origin POST endpoints
- `/api/health` — database availability check
- `/admin/intakes` — recent intakes, server-computed flags and review metadata
- `/doctor` — legacy demo list; guarded in production along with the review page
- `/doctor/[patientId]` — staff case-summary view and history
- `/admin/summaries` — latest 20 generated summaries for developer checks

The patient screens never show flags or medical interpretation. Red flags and
unanswered questions are computed by plain code on the server.

## Case summary

The staff case-summary page combines intake answers, the patient's original
text, care-gap dates, keyword matches, verified highlights, and a short
narrative. Regenerating a summary creates a new immutable row; it does not
change the intake, the patient's record, or a queue.

- `/doctor` shows a live suggested-priority column and links to each case.
- `/doctor/[patientId]` shows the case summary, suggested priority, and the
  last five summaries.
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
- There is no login, and suggested priority is advice only, not a clinical
  decision or queue assignment.

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
