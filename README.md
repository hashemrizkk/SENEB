# Seneb

Seneb, an ancient Egyptian word for “health,” is a demo chronic-care follow-up assistant for diabetes care in Egyptian primary-care clinics.

It helps patients share follow-up information and helps doctors and nurses turn intake, notes, and follow-up into structured records they can review. AI handles paperwork and reminders; clinic staff make every medical decision.

**Demo-grade. Fake data only. Do not enter real patient data.**

This project was built for the **“Don’t Wait for the Hospital”** hackathon challenge and relates to [UN Sustainable Development Goal 3: Good Health and Well-Being](https://sdgs.un.org/goals/goal3). The IDF Diabetes Atlas 2025 estimates that in 2024, 19.8% of Egyptian adults aged 20–79 had diabetes, 13.2 million adults had diabetes, and 62.0% of cases were undiagnosed. These are population estimates, not app measurements. [IDF Diabetes Atlas, 11th edition, Egypt table](https://diabetesatlas.org/media/uploads/sites/3/2025/10/IDF_Diabetes_Atlas_11th_Edition_2025_WEB.pdf)

## Contents

1. [Overview](#1-overview)
2. [Why Seneb](#2-why-seneb)
3. [Features](#3-features)
4. [Design principles and safety](#4-design-principles-and-safety)
5. [How it works](#5-how-it-works)
6. [AI and language models](#6-ai-and-language-models)
7. [Tech stack](#7-tech-stack)
8. [Getting started](#8-getting-started)
9. [Scripts reference](#9-scripts-reference)
10. [Project structure](#10-project-structure)
11. [Routes and API](#11-routes-and-api)
12. [Data model](#12-data-model)
13. [Testing and quality](#13-testing-and-quality)
14. [Deployment](#14-deployment)
15. [Security and privacy](#15-security-and-privacy)
16. [Accessibility, RTL, and language](#16-accessibility-rtl-and-language)
17. [Troubleshooting](#17-troubleshooting)
18. [Limitations and roadmap](#18-limitations-and-roadmap)
19. [Team and hackathon](#19-team-and-hackathon)
20. [Contributing](#20-contributing)
21. [License and acknowledgements](#21-license-and-acknowledgements)
22. [ملخص بالعربية](#22-ملخص-بالعربية)

## 1. Overview

### Try it in two minutes

Prerequisites: Node.js 22.13 or later and npm. The app creates a local SQLite database and seeds 15 fictional patients when the database has no patients.

1. Install dependencies: **npm ci**.
2. Copy **.env.example** to **.env.local**. For a local demo, leave model keys blank; AI-assisted features then use visibly marked mock or fallback behavior. Set **DOCTOR_NAME**, **DOCTOR_PASSWORD**, and a **SESSION_SECRET** with at least 32 characters to sign in to the doctor page.
3. Start the app with **npm run dev**. The screening preflight runs in warning mode before Next.js starts.
4. Open **http://localhost:3000/doctor/login**, sign in, and review the fake queue. Or start at **http://localhost:3000/register** to submit a new fictional intake.
5. For the separate screening walkthrough, open **http://localhost:3000/screening** and follow [SCREENING-DEMO.md](SCREENING-DEMO.md).

**npm run db:reset** is an optional destructive reset. It deletes the local hackathon.db and recreates it with fake data. Do not run it if you need the current local database.

### Status

The intake and doctor-review workflows are implemented as a local demo. The anonymous screening funnel is partial: its clinical configuration and wording remain drafts and the demo warning stays visible. Authentication, persistence, clinical validation, and deployment are not production-ready.

## 2. Why Seneb

Diabetes follow-up can involve repeated questions, free-text notes, and records spread across visits. Seneb prototypes a bilingual workflow for patients and Egyptian primary-care teams: capture what the patient reports, structure it for review, and keep clinic decisions with people. It supports the hackathon challenge “Don’t Wait for the Hospital” by demonstrating a community screening and follow-up path. The Atlas estimates above are context for the challenge, not evidence that this prototype improves health outcomes.

## 3. Features

“Implemented” means the workflow exists in this repository. It does not mean clinically approved or production-ready.

### Patient side

| Status | Feature |
| --- | --- |
| Implemented | Arabic-first registration and follow-up intake, with Arabic and English interface text. |
| Implemented | Tap answers, free text, and optional voice dictation with transcript review before insertion. |
| Partial | Anonymous screening flow, risk bands, safety escalation, demo locations, self-reported results, and a clinician review queue. Clinical content is placeholder data. |
| Partial | Consent-gated contact sharing in the screening funnel. No actual laboratory or booking integration exists. |
| Partial | Legacy /survey redirects to /screening; earlier survey APIs and nurse queue remain for old demo records. |

### Doctor and clinic side

| Status | Feature |
| --- | --- |
| Implemented | Gated doctor intake queue, patient record, status and priority editing, follow-up history, and revision history. |
| Implemented | Case summaries combining code-checked facts and optional model-written narrative. |
| Implemented | Visit-note completeness checks, doctor dictation, and session recording with reviewable transcript and summaries. |
| Partial | Separate nurse queue for legacy survey records and optional decision emails. |
| Partial | Staff screening funnel, result review, and entered-care handoff; authentication is demo-grade. |
| Planned | Durable hosted database, production authentication, real clinic/lab integrations, and clinician-approved screening content. |

## 4. Design principles and safety

- The language model extracts information the patient actually stated. Missing information stays null. It does not diagnose, score, or give treatment advice.
- Screening scores, intake red flags, note checks, and suggested priorities are computed by application code. Screening itself does not call an LLM.
- Patients do not receive doctor-side flags, queue priority, or clinical interpretation. Patient pages show their own form and screening guidance.
- Patient submissions are retained. Clinician changes create revisions with snapshots and changed-field metadata.
- AI-generated output is reviewed by staff. Mock output is labelled. If generation fails, the app uses a labelled fallback or leaves fields for review.
- The screening instrument, risk bands, safety rules, result categories, translations, consent wording, and locations are drafts. Do not use them for real care.

More detail and limitations are in [SCREENING.md](SCREENING.md).

## 5. How it works

A patient submits the registration or intake form. The server validates it, combines explicit tap answers with extracted free text, computes flags with ordinary code, stores the result and its provenance, and adds it to the doctor queue. A clinician reviews the original report, any extracted fields, and flags, then records edits as a new revision.

The screening funnel is a separate workflow. It stores an anonymous session, consent, answers, and a versioned assessment; it can route self-entered results to clinic review. The screening seed uses draft configurations and synthetic locations.

Four diagrams, checked against the route handlers, LLM functions, and SQLite schema: [architecture and flow diagrams](docs/architecture.md).

## 6. AI and language models

| Component | What it does | Provider and configured model |
| --- | --- | --- |
| Intake extraction | Extracts structured fields from patient free text. | Gemini gemini-3.8-flash, then Groq using the runtime value in GROQ_MODEL. |
| Case summaries | Writes a short narrative from supplied patient facts. Code verifies proposed highlights and computes suggested priority. | Groq using GROQ_MODEL; no Gemini attempt in this component. |
| Note checks and visit-session summaries/roles | Checks note completeness or produces draft structured wording for staff review. | Groq using GROQ_MODEL. |
| Survey copy, follow-up-plan, and patient-recap drafts | Produces draft structured wording for review. | Configured text provider sequence. |
| After-work note rating | Checks clinician-note completeness and profile gaps with quote validation. | Configured text provider sequence; deterministic fallback for unsupported input. |
| Patient voice dictation | Transcribes reviewed patient audio. | Gemini STT_GEMINI_MODEL or default gemini-3.8-flash; Groq whisper-large-v3 is the fallback. |
| Doctor note dictation | Transcribes a clinician’s dictated note. | Gemini only. |
| Session recording | Transcribes chunks, then labels speaker roles for clinician confirmation. | Gemini configured by STT_GEMINI_MODEL; a fallback transcript may be unattributed. |
| Screening scoring and red flags | Deterministic rules over answers and draft config. | No LLM. |

Generation uses temperature 0, bounded timeouts, structured output schemas, and server-side validation. Intake text is treated as untrusted data. With no configured provider, intake extraction uses labelled mock extraction; a failed provider path marks fields for review. Summary and note paths may use code-only or mock output, which is labelled in the UI and database.

Voice recording uses the browser microphone and MediaRecorder, converts recordings to mono 16 kHz WAV, and sends audio after the user stops recording. Long doctor sessions rotate into 45-second chunks; patient form clips have a shorter time limit. The server validates WAV structure and size before provider calls. Users review/edit transcript text before adding it to a field; a submission does not happen automatically. Recordings are not stored in the app database. Provider terms and quota apply.

To change the text-generation provider, set GEMINI_API_KEY or both GROQ_API_KEY and GROQ_MODEL in the server environment. The primary extraction model is a code constant. To change the speech model, set STT_GEMINI_MODEL. No model-accuracy or latency benchmark is established here; evaluation scripts use synthetic examples and are smoke checks, not evidence of clinical accuracy. Provider pricing and free tiers change, so check [Gemini pricing and rate limits](https://ai.google.dev/gemini-api/docs/pricing) and [Groq models and limits](https://console.groq.com/docs/models) before enabling external calls. Cost has not been measured; provider cost is an estimate that depends on model, token/audio usage, and current account terms.

Live Gemini/Groq calls and browser microphone capture were not run for this documentation update; those paths remain unverified.

More provider behavior and guardrails: [AI and voice details](docs/ai-and-voice.md).

## 7. Tech stack

Versions below are declared in package.json; caret (^) means npm may resolve a compatible later minor or patch version.

| Package | Declared version |
| --- | --- |
| Next.js | 16.4.2 |
| React / React DOM | 19.3.0 |
| TypeScript | ^5 |
| Zod | ^4.6.7 |
| better-sqlite3 | ^13.0.3 |
| Vercel AI SDK | ^7.0.148 |
| Google AI SDK provider | ^4.0.102 |
| Groq AI SDK provider | ^4.0.67 |
| ESLint / eslint-config-next | ^9 / 16.4.2 |

Node.js 22.13 or newer is the version stated by the existing setup notes; Next.js itself declares Node.js >=20.9.0. This repository has no .nvmrc or engines field.

## 8. Getting started

### Prerequisites and setup

| Requirement | Version or purpose |
| --- | --- |
| Node.js | 22.13+ recommended by the project setup; see version note above. |
| npm | Use the version bundled with your Node installation. |
| Native build tools | Needed if npm cannot use a prebuilt better-sqlite3 binary. |

Clone this repository from its Git remote, then run the install from the project root:

    npm ci

Copy .env.example to .env.local. The sample file contains variable names only. Do not add keys to Git.

| Variable | Required? | Purpose | Where to get it | If missing |
| --- | --- | --- | --- | --- |
| GEMINI_API_KEY | Optional | Server-side Gemini calls for extraction and transcription. | Google AI Studio | Text extraction uses mock or fallback; voice may use Groq or labelled mock, except doctor dictation requires Gemini. |
| GROQ_API_KEY | Optional | Groq fallback for extraction and patient transcription; Groq-backed summaries/checks. | Groq Console | Those paths use another configured path, mock, or fallback. |
| GROQ_MODEL | Required with Groq | Exact Groq text model id, selected by the deployer. | Choose an available model in Groq documentation | Groq text tasks are not configured. |
| STT_TIMEOUT_MS | Optional | Speech provider timeout in milliseconds; default 90000, maximum accepted 120000. | Choose a numeric server setting | Default timeout applies. |
| STT_GEMINI_MODEL | Optional | Gemini speech/session model id. | Choose a model available to your Google AI account | Speech defaults to gemini-3.8-flash; session recording expects a configured model. |
| DOCTOR_NAME, DOCTOR_PASSWORD | Optional pair | Named clinician sign-in. | Set fictional local demo credentials | If unset, legacy passcode may be used; auth is demo-grade. |
| DOCTOR_PASSCODE | Optional legacy | Shared doctor gate if named credentials are both unset. | Set a local demo passcode | Doctor sign-in has no configured credential. |
| NURSE_NAME, NURSE_PASSWORD | Optional pair | Separate legacy nurse sign-in. | Set fictional local demo credentials | Nurse queue sign-in is unavailable. |
| SESSION_SECRET | Required for signed sessions | Server-side signing secret; use at least 32 random bytes. | Generate it with the command below | Signed staff and screening sessions cannot operate correctly. |
| NEXT_PUBLIC_SITE_URL | Optional | Expected origin for same-origin request checks. | Use the local or deployed app origin | Local default is http://localhost:3000. |
| HACKATHON_DB_PATH | Optional | Local SQLite database path, mainly for isolated tests. | Choose a local file path | Uses hackathon.db in the project directory. |
| DEMO_COOLDOWN_OFF | Optional | Set to 1 for a roughly one-second summary regeneration cooldown in demos. | Set only in a local demo environment | Normal cooldown applies. |
| RESEND_FROM_EMAIL | Optional | Sender for nurse survey decision emails. | Use a verified Resend sender domain | Email sending should remain disabled. The code also expects a provider API key that is missing from the sample environment file; see report. |
| CRON_SECRET | Optional | Shared bearer secret for the scheduled reminder endpoint. | Generate a random secret and configure it in deployment | Vercel cron requests are rejected unless a doctor session is supplied. |
| SCREENING_NAVIGATOR_USERNAME, SCREENING_NAVIGATOR_PASSWORD | Optional pair | Seed screening navigator account. | Set fictional local demo credentials | No navigator account is seeded. |
| SCREENING_CLINICIAN_USERNAME, SCREENING_CLINICIAN_PASSWORD | Optional pair | Seed screening clinician account. | Set fictional local demo credentials | No clinician account is seeded. |
| SCREENING_ADMIN_USERNAME, SCREENING_ADMIN_PASSWORD | Optional pair | Seed screening admin account. | Set fictional local demo credentials | No admin account is seeded. |
| SCREENING_DEMO_MODE | Optional | Explicitly enable placeholder scoring in production; local development defaults to demo mode. | Set to true only for an intentional demo deployment | Draft scoring is unavailable in production; demo warning remains visible when demo mode is enabled. |

Generate a local session secret without printing it into project files:

    node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"

Start the local server with npm run dev. The command first runs the screening check in warning mode. For a production-like local run, use npm run build then npm run start.

## 9. Scripts reference

The [scripts reference](docs/scripts.md) lists every npm script from package.json, its purpose, and when to use it. Use fake data. npm run db:reset deletes the local database. Some HTTP journeys need an already running server; live provider scripts need configured keys.

## 10. Project structure

    app/                  Next.js patient, doctor, nurse, staff, admin, and API routes
    components/           Shared forms, voice input, language switcher, screening UI
    data/screening/       Versioned screening instrument and demo content
    lib/                  SQLite, validation, rules, LLM/audio, review, and workflow logic
    scripts/              Database tools, seeds, diagnostics, tests, and evaluations
    state/                App-owned local state support
    ui-evidence/          UI quality evidence and checks
    docs/                 Architecture, AI, data, routes, and script references
    SCREENING.md           Screening design, sources, caveats, and privacy notes
    SCREENING-DEMO.md      Screening walkthrough for a demo
    THEME.md               UI theme notes
    AGENTS.md              Repository and safety instructions for contributors

## 11. Routes and API

The route inventory includes page routes, API endpoints, caller roles, access gates, and purpose: [routes reference](docs/routes.md). Doctor, nurse, admin, and screening staff pages use their respective server-side gates. Patient registration and anonymous screening are public. The developer/admin pages are doctor-gated; do not expose them as public tools.

## 12. Data model

The app stores patient records, intakes, notes, follow-ups, messages, revisions, summaries, visit sessions, and the screening workflow in SQLite. The full table list, important columns, revision strategy, input provenance, and migration behavior are in [data model](docs/data-model.md). SQL is centralized in lib/db.ts and lib/schema.sql.

## 13. Testing and quality

Run the fast, local checks:

    npm run typecheck
    npm run lint
    npm run test:doctor
    npm run test:summary
    npm run test:screening
    npm run test:voice
    npm run test:audio-wav
    npm run build

HTTP and end-to-end scripts need a local server and synthetic credentials. Provider tests marked live require valid provider keys and can use quota. See the [scripts reference](docs/scripts.md) for each suite and prerequisites. These fixtures are synthetic smoke tests, not proof of clinical accuracy or model reliability. Extraction and role evaluation are meaningful only with the configured real providers; mock-mode output is not an accuracy measurement.

## 14. Deployment

The current code uses better-sqlite3 with a local file. **The deployed app does not reliably persist data on Vercel.** Vercel Function filesystems are ephemeral and instances do not share a durable SQLite file. A hosted database and a tested database adapter are required before deployment with any real workflow data. [Vercel SQLite guidance](https://vercel.com/kb/guide/is-sqlite-supported-in-vercel)

For a demo-only deployment, import the repository into Vercel, add server-side environment values, deploy, and verify the health route. Do not treat a successful deployment as durable storage. The repository has a scheduled hourly route in vercel.json; configure CRON_SECRET and confirm the deployed cron setup. SQLite persistence remains unresolved.

No live Vercel deployment was available during this update; deployed behavior remains unverified.

The voice endpoint accepts audio of up to 8 MiB for doctor notes and 4 MiB for patient transcription at the app layer. Vercel documents a 4.5 MB request/response body limit, so doctor-note uploads above that platform limit will be rejected before reaching this route. Long-running endpoints set code-level durations, but Vercel plan limits still apply. Verify current [request limits](https://vercel.com/docs/functions/limitations) and [function duration](https://vercel.com/docs/functions/configuring-functions/duration) for the target project; Vercel has announced longer durations for some plans, but this app does not configure a deployment-specific duration policy. [Vercel deployment notes](docs/deployment.md)

## 15. Security and privacy

The app handles names, contact details, health-related intake text, structured answers, clinician notes, audio in transit, and screening responses. SQLite stores patient records, notes, derived fields, revisions, review metadata, and screening records. Audio is sent to the configured speech provider and is not saved in the app database. Text and audio sent to external model providers are subject to those providers' processing and retention terms. Optional email and WhatsApp integrations use Resend and Twilio when configured; their provider settings are not fully represented in the sample environment file.

The speech widget displays a consent notice before microphone access; the screening flow records consent for its stated purposes. These are demo flows, not legal approval. Doctor and staff access gates are prototype authentication, not production identity management. Do not use real patient data. See [security and data flow notes](docs/ai-and-voice.md#privacy-and-provider-transfers) and [SCREENING.md](SCREENING.md).

## 16. Accessibility, RTL, and language

The root document defaults to Arabic, right-to-left. The shared language switcher supports English and Arabic on supported pages; individual forms and question copy use lib/strings.ar.ts and lib/questions.ts. Patient pages are Arabic-first. When adding a question, update the question registry and translations, then check patient, doctor, and admin surfaces. When adding a language, add its string dictionary and connect it to the language switcher and page-level locale handling. The repository includes contrast and direction checks; passing them is not a complete accessibility audit.

## 17. Troubleshooting

| Problem | What to try |
| --- | --- |
| better-sqlite3 install or build fails | Use a supported Node release and install the platform's native build tools; then rerun npm ci. |
| Wrong or unsupported Node version | Use Node.js 22.13 or newer for this project's setup. Next.js package metadata requires at least 20.9. |
| Missing model key | Intake uses labelled mock extraction or a review-required fallback. Set a provider key for real provider calls. |
| Microphone is unavailable | Use localhost or HTTPS, allow microphone permission, and use a browser that supports MediaRecorder. Typing remains available. |
| Audio upload is rejected as too large | Shorten the clip. App caps are 4 MiB for patient audio and 8 MiB for doctor notes; Vercel caps the request body at 4.5 MB. |
| Doctor queue looks stale | Doctor pages are dynamic and refresh periodically; reload once, check server/database status, and confirm requests point to the same local SQLite file. |
| Screening shows a demo warning or result unavailable | Run npm run screening:check; draft configurations are demo-only and warning visibility is intentional. |
| A reset would delete local work | Do not run npm run db:reset; it removes hackathon.db and its WAL/SHM files. |

## 18. Limitations and roadmap

Implemented behavior still needs clinic and security review before any real use. Screening instrument permission, Egyptian clinical validation, thresholds, emergency wording, result categories, and translations are unresolved. Staff sign-in is demo-grade. Vercel SQLite persistence is not durable. Real testing locations, lab integrations, reminder delivery, and production monitoring are not present. Model quality and time saved have not been measured. Synthetic tests do not establish safety or accuracy.

Suggested next steps: obtain clinician and legal review of the screening content; choose durable hosted storage and adapt the database layer; conduct security and privacy review; then run usability and language review with intended users. These are suggestions, not implemented work.

## 19. Team and hackathon

- Team names: **TODO**
- Roles: **TODO**
- Hackathon name and dates: **TODO**
- Live demo URL: **TODO**
- Demo video link: **TODO**

## 20. Contributing

Read [AGENTS.md](AGENTS.md) before making changes. Work on the current branch, keep changes focused, use descriptive commits, and run the narrowest relevant checks followed by the broader checks above. Never use real patient information in examples, tests, seeds, or screenshots.

## 21. License and acknowledgements

License: **TODO — confirm the intended project license before publishing.** A LICENSE file exists in the repository; its terms should be confirmed by the project owner before release.

Sources and services used include the [International Diabetes Federation Diabetes Atlas](https://diabetesatlas.org/), [NICE evidence materials for legacy FINDRISC](https://www.nice.org.uk/guidance/ph38/evidence/ep2-implementing-diabetes-prevention-programmes-jaakko-tuomilehto-pdf-435077533), Google Gemini, Groq, Resend, Twilio, Next.js, React, and better-sqlite3. See SCREENING.md for instrument sourcing and licensing notes.

## 22. ملخص بالعربية

سِنِب أداة تجريبية لمتابعة مرض السكري في وحدات الرعاية الأولية بمصر.
تساعد المريض على إرسال معلومات المتابعة، وتعرضها للفريق الطبي في سجل منظم.
يمكن للأداة تحويل النص والصوت إلى معلومات قابلة للمراجعة.
الذكاء الاصطناعي يساعد في الأعمال الورقية فقط؛ والقرارات الطبية للفريق البشري.
المحتوى الطبي والتقييمات ما زالت تجريبية وتحتاج إلى مراجعة واعتماد.
استخدم بيانات وهمية فقط، ولا تدخل بيانات مرضى حقيقية.

**مراجعة متحدث أصلي للعربية مطلوبة قبل النشر.**

### Screens

| Route | What it shows |
| --- | --- |
| /register | Arabic-first patient registration and intake. |
| /doctor | Clinic intake review queue. |
| /doctor/[patientId]/summary | Case summary and session history. |
| /screening | Anonymous screening demo. |
| /staff/reviews | Screening result review queue. |

<!-- Add approved, synthetic-data screenshots for the routes listed above. -->
