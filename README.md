# Chronic-care follow-up assistant

A local foundation for a diabetes follow-up demo for primary-care clinics in Egypt.
It uses fictional patient data and keeps medical decisions with people, not AI.
This phase is limited to the database, fake seed data, and a read-only patient list.

## Install

Use Node.js 22.13 or newer and npm. From the project folder, run:

```sh
npm install
```

## Run

```sh
npm run dev
```

Open [http://localhost:3000/doctor](http://localhost:3000/doctor) for the patient list.
The database is created and seeded automatically the first time the app connects.

## Database commands

```sh
npm run db:check
npm run db:reset
```

`db:reset` removes `hackathon.db` and creates it again with 15 fictional patients.

## Folder layout

- `app/doctor/` — read-only patient list
- `app/api/health/` — database health endpoint
- `lib/schema.sql` — SQLite table definitions
- `lib/db.ts` — database connection and automatic seeding
- `lib/seed.ts` — fictional demo patients
- `lib/rules.ts` — placeholder for future plain-code rules
- `lib/llm.ts` — placeholder for future LLM calls
- `scripts/` — database reset and check commands
