# npm scripts

This list matches the scripts declared in package.json. Use fictional data only. A script that changes a database is marked below. The HTTP journey scripts require the server and test configuration described in their source.

| Script | What it does | When to use it |
| --- | --- | --- |
| dev | Runs screening preflight in warning mode, then starts Next.js dev server. | Local development. |
| build | Builds the production Next.js app. | Before deployment or release. |
| start | Serves the production build. | After build, for local production-mode checks. |
| lint | Runs ESLint. | Before pushing changes. |
| typecheck | Runs TypeScript without emitting output. | Before pushing changes. |
| check:contrast | Checks project UI color contrast tokens. | After UI/theme changes. |
| check:direction | Checks directional/RTL UI rules. | After layout or RTL changes. |
| check:animations | Checks UI animation constraints. | After animation changes. |
| check:budget | Checks UI bundle/resource budget rules. | After UI changes. |
| check:scope | Checks UI scope rules. | When reviewing UI implementation scope. |
| db:reset | Deletes hackathon.db plus WAL/SHM files, then recreates fake seed data. Destructive. | Only when intentionally resetting local demo data. |
| db:check | Prints database counts and health information. | Inspect local demo database. |
| test:register | Exercises registration over HTTP with fake data. | With a local test server; writes test records. |
| test:survey | Runs legacy survey and survey-registration tests. | Checking compatibility with old survey data. |
| test:summary | Tests case-summary functions and in-memory pipeline. | After summary changes. |
| seed:screening | Adds draft screening configs, placeholder copy, fake locations, and optional seeded users/events. | Initialize screening demo data; it does not reset the database. |
| scoring:create | Creates a screening scoring-version draft from a config file. | Governed demo configuration workflow. |
| scoring:approve | Marks a scoring draft approved through the demo staff workflow. | Only after human review; not proof of clinical validity. |
| scoring:activate | Activates an approved scoring config through the demo staff workflow. | Only after required review and demo setup. |
| audit:verify | Verifies the screening append-only hash chain. | Check the local screening audit log. |
| test:screening | Tests deterministic screening scoring and related rules. | After screening logic changes. |
| test:screening-http | Tests screening result HTTP flow against a configured test server. | With a running isolated test server and seeded test credentials. |
| e2e:screening | Runs the screening and doctor handoff HTTP journey. | With a configured test server and synthetic doctor/screening clinician credentials. |
| debug:screening | Traces screening setup and session state without printing full ids or answers. | Diagnose a local screening flow. Use --new for a synthetic new session. |
| screening:check | Checks schema, scoring/ruleset status, content, and audit chain. | Before demo or troubleshooting screening. |
| session:delete | Deletes one screening session and linked data while preserving audit record. | Only for authorized demo-data deletion; requires configured admin actor. |
| eval:extraction | Runs extraction evaluation against a synthetic corpus using a real provider. | Explicitly evaluate provider output; calls may use quota. |
| test:providers | Tests provider fallback behavior with mocks. | After provider order/error handling changes. |
| test:voice | Tests voice utility functions. | After transcript or provenance changes. |
| test:voice-api | Tests Gemini audio provider behavior and recorder chunk management. | Local tests; verify source before use if real provider keys are present. |
| test:react-keys | Tests stable React key usage. | After component/list changes. |
| test:audio-wav | Tests WAV validation and conversion. | After audio normalization changes. |
| test:doctor | Tests doctor workflow, migrations, revisions, conflicts, and role-separated sessions. | After doctor/data changes. Uses test database fixtures. |
| test:note-check | Tests note completeness checks. | After note-check changes. |
| test:sessions | Tests visit-session processing pipeline. | After recording/session changes. |
| test:sessions:db | Tests session database behavior. | After session schema or persistence changes. |
| eval:roles | Evaluates role inference with the configured Groq provider. | Explicit real-provider evaluation; may use quota. |
| e2e:sessions | Runs visit-session end-to-end flow. | With local server and session e2e time bounds configured. |
| test:nurse | Tests legacy nurse survey flow and mocked email decisions. | After nurse/email changes. Uses a temporary database. |
| test:priority-auto | Tests automatic priority helper behavior. | After priority rules change. |
| test:followup-plan | Tests follow-up plan construction. | After follow-up planning changes. |
| test:messaging | Tests messaging helpers and provider behavior. | After message scheduling/provider changes. |
| smoke:summary | Runs fake-row case-summary pipeline smoke cases. | After summary generation changes. |

## Suggested local check group

    npm run typecheck
    npm run lint
    npm run test:doctor
    npm run test:summary
    npm run test:screening
    npm run test:voice
    npm run test:audio-wav
    npm run build

The API-level and live-provider scripts are not part of this local group because they need extra server configuration or external credentials. Do not run live-provider checks unless you intend to send synthetic requests to the provider and use its quota.
