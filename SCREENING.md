# Screening funnel (Phase 1 demo)

## What this is and is not

This is a demo screening funnel for adults who may have undiagnosed type 2 diabetes or prediabetes. It uses a published risk questionnaire to show a risk band, helps find a test location, accepts a self-entered result, and routes results for clinician review. It is not a diagnostic tool, emergency service, or replacement for a clinician. It does not provide diagnosis or medication advice.

The existing diabetes follow-up, patient intake, case summary, queue, and visit-note workflows remain separate and unchanged by this funnel.

## Safety rules

- A red-flag gate runs before questions, and the “I feel very unwell” link remains available during the flow. The configured emergency number is null; the fixed instruction is to seek urgent care and call the local emergency number.
- Risk scoring is deterministic code. Screening does not call an LLM or provider.
- The UI displays bands only. It does not display points, percentages, or probabilities.
- Screening answers are anonymous. Height, weight, and waist are converted to answer categories server-side and are not stored as measurements.
- Contact details are collected only if the person separately consents to sharing the summary with clinic staff. The consent and details are stored separately from anonymous answers. Do not put real patient data into this demo.
- Test results entered by a person are unverified and are routed to a clinical review. A result category is not a diagnosis.
- Failure guidance directs the person to a blood test and urgent care if very unwell.

## Instrument and sources

The demo contains the eight-item 0–26 FINDRISC form as a versioned JSON data file at `data/screening/findrisc-0.2.json`. Its scoring form is reproduced in NICE evidence materials: [NICE evidence PDF](https://www.nice.org.uk/guidance/ph38/evidence/ep2-implementing-diabetes-prevention-programmes-jaakko-tuomilehto-pdf-435077533). The original publication is Lindström and Tuomilehto, *The Diabetes Risk Score*, *Diabetes Care* 2003;26(3):725–731, [doi:10.2337/diacare.26.3.725](https://doi.org/10.2337/diacare.26.3.725). The Finnish Diabetes Association's [current source and use-instructions page](https://diabetes.fi/lahteet-ja-kayttoohjeet-kansansairauksien-riskitesti/) now presents a broader combined risk test, so this config explicitly describes itself as a legacy FINDRISC reproduction, not the current Finnish web questionnaire.

Source point ranges are low 0–6, slightly elevated 7–11, moderate 12–14, high 15–20, and very high 21–26. Product bands map those source labels into low, elevated, and high. The config records this mapping and the retrieval date. A test confirms minimum 0 and maximum 26 and checks 14 hand-calculated response vectors plus product-band boundaries.

The reviewed public materials did not clearly state rights to reproduce or translate the instrument. The Arabic and English text is a plain-language demo adaptation. Obtain permission and clinical translation review before real use. The questionnaire has **not been validated or calibrated for the Egyptian population. Bands only.**

Blood-result category placeholders use the ADA 2026 Standards of Care: [Diagnosis and Classification](https://doi.org/10.2337/dc26-s002), retrieved 2026-10-22. Category thresholds are draft data and require local clinical approval; a clinician confirms interpretation and diagnosis.

## PLACEHOLDER items needing review before real use

- FINDRISC translation and licensing/permission; the exact legacy form/version and all point options.
- Score-band mapping and recommendations for the Egyptian population.
- Symptom-modifier items and the “blood test soon” wording.
- Red-flag list and emergency wording; verify an appropriate emergency number before configuring one.
- Blood-result categorization, accepted units, plausible-entry bounds, unusual-value confirmation, and clinician review workflow.
- All patient-facing Arabic and English content, including consent, privacy, safety, result explanation, and fallback wording.
- Consent retention/deletion promises and legal text.
- Demo locations, contact details, hours, and any future real location data.

Clinical configs remain draft/placeholders by default. No item is approved by this repository. This page and the staff shell list those items during operation.

## Setup and commands

Install the dependencies already declared in `package.json`, copy `.env.example` into a local environment file, and set a `SESSION_SECRET` with at least 32 characters. To create demo staff accounts, set the `SCREENING_NAVIGATOR_*`, `SCREENING_CLINICIAN_*`, and `SCREENING_ADMIN_*` username/password environment variables. Never commit passwords or secrets.

```text
npm run seed:screening
npm run dev
npm run test:screening
npm run e2e:screening
npx tsc --noEmit
npm run lint
npm run audit:verify
```

`npm run seed:screening` adds draft scoring and red-flag configs, placeholder Arabic/English content, clearly fake locations, optional staff users, and synthetic funnel events. It does not reset the database. Do not activate a scoring version for real use. For demo-only governed transitions, use `npm run scoring:create -- <config.json> <staff-username> <version-label>`, then `npm run scoring:approve -- <version-id> <clinician-username>` and `npm run scoring:activate -- <version-id> <admin-username>`. Approval is a demo script action, not evidence of clinical validation.

The HTTP journey needs `TEST_BASE_URL` pointing to an isolated local test server, plus seeded screening clinician and doctor demo credentials in the environment. It makes only synthetic requests; it was not run as part of the current checks because this environment has no test server or screening staff users configured.

Delete one screening session with `npm run session:delete -- <session-id>` after setting `SCREENING_DELETE_ACTOR` to a seeded admin username. The associated audit entry remains. The in-product deletion request UI is not part of Phase 1.

## Staff roles and authentication

Navigator, clinician, and admin accounts are seeded from environment variables using scrypt password hashes. Staff sessions use a signed, httpOnly cookie. **Demo-grade authentication, not production-ready.** Credentials, deployment security, password handling, and session controls need a security review before deployment. The review queue is clinician/admin-only; funnel access is available to all three roles.

## Privacy and deletion

The session cookie contains a random token; SQLite stores its SHA-256 hash, not the token. Sessions expire after 24 hours. Consent is required before session data is written. No free-text questionnaire fields exist. Raw derived measurements are not persisted. Analytics accepts a fixed event whitelist and rejects personal-looking property keys. Audit rows are append-only and chained with SHA-256; use `npm run audit:verify` to validate the chain. Deletion removes linked session data while preserving the audit entry. Optional contact sharing uses separate contact and results-sharing consent records; withdrawal removes the contact fields and records withdrawal.

## Known limitations

- The instrument, thresholds, copy, result categories, and safety rules are placeholders. Do not use with real patients.
- The source version is the legacy 0–26 FINDRISC form, while the Finnish association's current web questionnaire has changed.
- The seed locations and phone numbers are fake. No real booking, reminder delivery, lab integration, consent withdrawal, or partner workflow exists.
- Self-entered test results are unverified. A clinician can enter a consenting person into the existing follow-up queue after supplying age and diabetes type. This creates a new patient and blank intake; it does not alter another patient's record.
- Funnel counts include synthetic demo events; test completion is self-reported unless staff verification is added.
- The current smoke test covers scoring, derived inputs, bands, basic wording, no-provider imports, and append-only audit triggers. It does not prove clinical accuracy or all browser/API acceptance paths.
- Phase 2 is not implemented.
