# "Don't Wait for the Hospital" — Project Brief
**SDG Hackathon (ST17_2.0) · Hospitals & Healthcare in Egypt**
**Repo:** https://github.com/hashemrizkk/ST17_2.0_Hackathon
**Consolidated:** 2026-10-22 — single source of truth for the whole project.

---

## 1. The Problem

Egypt carries a huge burden of chronic non-communicable disease, and most cases are caught too late:

| Statistic | Value | Source |
|---|---|---|
| Adult diabetes rate (ages 20–79) | **19.8%** | IDF Diabetes Atlas 2025 |
| People living with diabetes | **13.2 million** | IDF Diabetes Atlas 2025 |
| Undiagnosed cases | **~62%** | IDF Diabetes Atlas 2025 |

**Challenge statement:** How might we reach Egyptians with chronic health conditions *before* acute medical emergencies, making proactive health monitoring accessible and sustainable at the **primary care** level?

**Supporting evidence (uploaded papers):**
- Farag et al., *BMC Public Health* (2023) 23:949 — community survey of 719 Egyptian adults: 5% had undiagnosed diabetes, 21.7% pre-diabetes. Predictors: age, physical inactivity, previous abnormal glucose, waist circumference.
- Farag et al., *BMC Research Notes* (2022) 15:303 — **AUSDRISK Arabic version** translated and validated in Egypt (WHO forward/backward protocol). 9 questions, score 0–34; cutoffs: mild ≤4, moderate 5–10, severe ≥11. Strong performance: AUC 0.887 for detecting diabetes (sensitivity 86%, specificity 73% at ≥13).

---

## 2. The Product — Two Connected Flows

The user journey (from the sketch image): an **open online survey** catches undiagnosed people → high-risk results **convert into a structured pre-visit intake form** → the clinic follows up.

### Flow A — Screening Survey ("الفحص السريع")
- ~2 minutes, **no login, no personal data collected**.
- Uses a validated risk score — **FINDRISC** (8 questions, easy to score in code):
  1. Age group
  2. BMI (ask height + weight, compute)
  3. Waist circumference (offer "I don't know" + body-shape picker fallback)
  4. Daily physical activity ≥ 30 min?
  5. Daily fruit/vegetable intake
  6. Ever taken blood-pressure medication
  7. Ever had high blood glucose (pregnancy, illness, or check-up)
  8. Family history of diabetes
- **Plus a symptom check:** frequent urination, excessive thirst, unusual fatigue, blurred vision, slow-healing wounds, tingling/numbness in feet, unexplained weight loss.
- **Result screen:**
  - Low / Moderate / High tier in plain language — **never a diagnosis**.
  - One single action: *"Get a fasting glucose or HbA1c test at your nearest primary care unit."*
  - Opt-in: *"Want us to remind you and track follow-up?"* → leads to Flow B.
  - **Hard override:** severe symptoms (confusion, persistent vomiting, fruity breath, severe abdominal pain) → *"Go to the emergency department now"* regardless of score. (Egypt ambulance: **123**.)
- **Arabic-first (Egyptian dialect), English toggle.**
- Visible disclaimer on both pages: *"This is a screening tool, not a diagnosis."*

### Flow B — Intake / Pre-Visit Form (after opt-in)
Structured, deterministic — feeds the rules engine and the LLM. **Keep to ≤12–15 minutes of fields (fewer is better — drop-off is the enemy).**

| Section | Fields |
|---|---|
| Identity & contact | Name, age, sex, governorate, phone, preferred channel (WhatsApp/SMS/call), best time of day |
| Diabetes status | Never tested / prediabetic / type 2 / type 1 (+ year of diagnosis) |
| Latest numbers | Last HbA1c or fasting glucose + date, home readings |
| Medications | Name, dose, taken regularly? (incl. insulin, BP meds) |
| Symptoms & red flags | Survey symptom list + chest pain, shortness of breath, fainting |
| Complication screening | Last eye exam, foot problems/wounds, kidney tests, recent hospital/ER visits |
| Lifestyle | Smoking, activity, diet, **Ramadan fasting** (medication timing) |
| Care access | Primary care unit nearby? Main barrier (cost, distance, time, fear) |
| Consent | Explicit permission for follow-up messages + data storage, in plain Arabic |

- Store as **structured fields** (numbers, enums, booleans) — keeps `lib/rules.ts` simple.
- **One** optional free-text "anything else?" box — the only input that goes to the LLM.

---

## 3. Existing Codebase (current repo state)

**Stack:** Next.js 16.4 (App Router) · React 19 · TypeScript 5 strict · SQLite via `better-sqlite3` (WAL, foreign keys) · Zod 4 · ESLint 9 · Node 22.13+

**Structure:**
```
app/api/health/route.ts   GET /api/health (DB liveness)
app/doctor/page.tsx       Read-only patient list (/doctor)
app/layout.tsx            Root layout
lib/db.ts                 Connection, schema init, auto-seed (globalThis cache)
lib/schema.sql            patients, intakes, notes, followups
lib/seed.ts               15 fictional Arabic-named patients, relative dates
lib/rules.ts              Placeholder → red flags & overdue logic
lib/llm.ts                Placeholder → LLM extraction/follow-up drafting
scripts/db-check.ts       npm run db:check
scripts/db-reset.ts       npm run db:reset
```

**Tables:** `patients` (name, age, phone, diabetes_type, last_hba1c/foot_exam/bp/next_visit dates) · `intakes` (patient_id, input_method, raw_text, structured_json, red_flags_json) · `notes` (note_text, check_result_json, override_reason) · `followups` (message, status, reply_text, escalated).

**Scripts:** `dev`, `build`, `start`, `lint`, `db:check`, `db:reset` (scripts run via `node --experimental-strip-types`).

---

## 4. Working Rules & Hard Constraints (from the team prompt, `message(2).txt`)

These apply to every build session:
- **Humans decide, software assists.** AI handles paperwork and reminders; clinicians make every medical decision.
- **Fake data only**, with a visible banner: "ده نموذج تجريبي، ماتكتبش بيانات حقيقية".
- **Red flags are plain code only** (`lib/rules.ts`); the LLM only extracts/structures — it never flags or interprets.
- The patient **never sees** flags, scores internals, or medical interpretation.
- **Only free text goes to the LLM** — never name, phone, or email. LLM calls are server-side only. Saving must never fail because the LLM failed (fallback + mock mode).
- Parameterized SQL always. Server re-validates everything. No personal data in URLs, query strings, logs, localStorage, or cookies. No `dangerouslySetInnerHTML`.
- Patient-facing UI: **RTL Egyptian Arabic**, mobile-first at 360px, font ≥18px, tap targets ≥48px, calm one-accent design, `prefers-reduced-motion` respected, Arabic-friendly font (Cairo / Noto Sans Arabic), all strings in `lib/strings.ar.ts`.
- Git: work on the current branch, one commit per task ("Task N: ..."), check `git status` for foreign uncommitted changes first.
- Explain step by step in plain language (the student is non-technical). Don't add unrequested features.

---

## 5. Open Decisions / Things to Flag

1. **FINDRISC vs AUSDRISK-Arabic.** The spec says FINDRISC (8 questions, well-established). But the uploaded papers prove **AUSDRISK-Arabic is validated specifically on Egyptians** — a strong judging point. FINDRISC is still a safe, simpler default; AUSDRISK-Arabic could be a differentiator or a stretch goal. → Decide before building the survey.
2. **Repo is behind the prompt.** The GitHub repo currently contains only the foundation skeleton (one commit). The team prompt describes Phase 2 components (lib/intake.ts, /intake/[id], /admin/intakes, lib/strings.ar.ts, tests) that don't exist in the repo yet — they may exist locally on a teammate's machine. → Confirm which code is canonical before building.
3. **Survey → Form data handoff.** Per the sketch, survey answers should pre-fill the intake form when a high-risk user opts in. Mechanism TBD (in-memory state vs. server-side token) — must respect the "no personal data in survey" rule.
4. **Scope discipline.** The team prompt explicitly defers: login/accounts, risk-score display to patients, doctor pages beyond the queue, voice, file upload. The survey itself was previously out of scope — it is now **in scope** per the latest brief.

---

## 6. Sources
- International Diabetes Federation — IDF Diabetes Atlas, 2025 edition (Egypt country data).
- *From Guidelines to Practice — Expert Opinion on T2DM Management in Primary Care* (2025).
- Farag H.M. et al. "Prevalence and predictors of undiagnosed type 2 diabetes and pre-diabetes among adult Egyptians: a community-based survey." *BMC Public Health* (2023) 23:949.
- Farag H.M. et al. "Arabic version of the Australian type 2 diabetes risk assessment tool (AUSDRISK): translation and validation." *BMC Research Notes* (2022) 15:303.
