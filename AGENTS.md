<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Project instructions

## Project
Chronic-care follow-up assistant for diabetes patients in Egyptian primary-care clinics (SDG hackathon project). Patients fill an Arabic form, the system structures their answers, plain code flags risks, and doctors/nurses review and edit everything on a doctor-side page.
Core principle: the AI handles paperwork and reminders; humans make every medical decision.

## Project facts
- Treat package.json, lockfiles, config files and existing code as the source of truth for versions and APIs. Never assume an API from memory.
- Stack: Next.js + TypeScript, SQLite via better-sqlite3, zod, an LLM layer, deployed on Vercel.
- Check the installed Next.js version's docs before using route handlers, params, cookies, caching, server actions, or client/server component patterns.
- Key modules (verify they exist before relying on them): `lib/db.ts` (all SQL), `lib/intake.ts` (zod schema), `lib/rules.ts` (red flags), `lib/llm.ts` (extraction), `lib/submitIntake.ts` (shared save pipeline), `lib/registration.ts` (sign-up validation), `lib/questions.ts` (question registry), `lib/strings.ar.ts` (all Arabic text).
- Routes: patient pages (`/register`, `/intake`, `/intake/[id]`), doctor pages (`/doctor`, `/doctor/[patientId]`), developer page `/admin/intakes`, APIs under `/api/`.
- Do not record project status or phase progress in this file. It goes stale.

## Medical safety rules (never break these)
- The LLM only extracts what the patient said. Anything not mentioned is `null`. It never diagnoses, scores, advises, or interprets.
- Red flags are plain code in `lib/rules.ts`, computed on the server from saved data. The browser can never set them.
- Patients never see flags, scores, doctor notes, priority, or any medical interpretation. Patient pages and endpoints must never return doctor-side data.
- Unanswered means `null`, never `false` or `0`. Tap answers win over LLM output for the same field.
- Never delete or overwrite what the patient submitted. Doctor edits are saved as new revisions on top of the original.
- Keep the static emergency line and the "reviewed by the clinic team, not instantly" line on patient screens.
- Fake data only. Never add real patient information, to code, tests, seeds or docs.

## Privacy and security
- Send only the patient's free text to the LLM. Never send name, phone, email, or id.
- Treat patient text as untrusted data: delimit it in prompts, validate model output with zod, never render or execute it.
- No personal data in URLs, query strings, console logs, localStorage, or cookies. Never log raw patient text.
- Validate every input on the server with zod, even if the browser already did. Use parameterized SQL only (`?` placeholders). No `dangerouslySetInnerHTML`.
- Never expose API keys to the browser. Never commit secrets. Keep `.env.example` accurate (names only, no values).
- Doctor and admin routes must stay behind the access gate.

## Database
- All SQL lives in `lib/db.ts`. No SQL anywhere else.
- Migrations must be safe to run twice (check before adding a column or table).
- Vercel's serverless filesystem does not keep SQLite files. Do not assume data persists when deployed. Do not switch databases without being asked; keep SQL isolated so a swap stays small.

## LLM layer
- All LLM calls go through `lib/llm.ts`, server-side only.
- Use temperature 0, a timeout, and a fallback order (primary model, second model, then mock/no-LLM with `needs_review = true`).
- Saving must never fail because the LLM failed. Never throw an unhandled LLM error to the user.
- Mock mode must always be clearly labelled and must never be mistaken for real results.
- Verify model IDs in the provider docs. Use `.nullable()`, not `.optional()`, in LLM-facing schemas, then re-validate with the stricter schema.

## Frontend and Arabic
- Patient text is Egyptian Arabic, right-to-left: `dir="rtl"`, `lang="ar"`. All Arabic strings live in `lib/strings.ar.ts`.
- Question text and flag labels come from `lib/questions.ts` only, so patient, doctor and admin screens stay in sync. Never hard-code them elsewhere.
- Flip directional icons for RTL. Phone and email inputs use `dir="ltr"` but stay visually aligned with other fields.
- Mobile-first at 360px width. Base font at least 18px, tap targets at least 48px, visible focus, labelled inputs, errors announced and focused, keyboard-only use works.
- Always provide loading, empty and error states, with clear Arabic messages. Keep the user's typed input when a save fails.
- Doctor pages must not be statically cached. New submissions must appear without a hard reload.
- Do not add a UI kit or form library. Use plain React state and zod.

## Scope control
- Do not build login/user systems, risk scores, voice input, file upload, or the survey unless the task says so.
- Do not add features that were not requested. Put bigger ideas in a "suggestions" list.

## Changes
- Locate the relevant implementation, callers, and tests before editing.
- Prefer the smallest coherent change that satisfies the requirements.
- Do not add dependencies, new abstractions, or unrelated refactors without a concrete reason. Before installing anything, say what and why in one or two sentences.
- Preserve existing public behavior and APIs unless the task requires a change.
- For bug fixes, add or update a focused regression test when practical.
- Five people share this repo. Work on the current branch, touch only the files the task needs, make small commits, and run `git status` first so you do not mix in someone else's uncommitted work.
- Never fix a failure by deleting or weakening a test, adding `@ts-ignore`, disabling a lint rule, or loosening validation. If unavoidable, say exactly what and why.
- If the same bug resists two attempts, stop and report the exact error instead of rewriting around it.

## Validation
- Commands (verify against package.json): `npm run dev`, `npm run build`, `npm run lint`, `npx tsc --noEmit`, `npm run test:rules`, `npm run test:intake`, `npm run test:register`, `npm run test:doctor`.
- Run the narrowest relevant check first, then broader checks when the change warrants it.
- Inspect failures and fix issues caused by the changes.
- Never claim a check passed unless it was actually run.
- Report whether LLM tests ran in real or mock mode. The small synthetic test set is a smoke test, not proof of real accuracy.

## Output
- Explain in plain language. The user is a student, not a senior engineer.
- Summarize the change and affected files.
- Report exact validation commands and their results.
- List decisions made that the user did not specify.
- Include assumptions or remaining risks only when relevant.
- Keep terminal output and explanations focused on relevant results.
