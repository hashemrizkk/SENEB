# Routes and API

Page routes below come from app/**/page.tsx. API routes come from app/api/**/route.ts. Dynamic segments are shown in brackets. Request bodies are validated server-side. The gate column names the applicable prototype gate; it does not mean production-grade authentication.

## Pages

| Path | Caller | Gate | Purpose |
| --- | --- | --- | --- |
| / | Patient | None | Landing page. |
| /register | Patient | None | Registration and first follow-up form. |
| /screening | Anonymous participant | Screening session | Arabic-first anonymous screening. |
| /screening/locations | Anonymous participant | Screening session | Demo testing-location and booking flow. |
| /screening/summary | Anonymous participant | Screening session | Printable screening summary. |
| /survey | Patient | None | Legacy path; redirects to /screening. |
| /voice-demo | Developer/demo user | None | Synthetic voice transcription demo. |
| /doctor/login | Doctor | None | Doctor sign-in form. |
| /doctor | Doctor | Doctor session | Intake review queue. |
| /doctor/[patientId] | Doctor | Doctor session | Patient record, intake, edits, and history. |
| /doctor/[patientId]/summary | Doctor | Doctor session | Case summary and visit-session summaries. |
| /doctor/[patientId]/session | Doctor | Doctor session | Visit session and transcript workflow. |
| /nurse/login | Nurse | None | Legacy nurse sign-in form. |
| /nurse | Nurse | Nurse session | Legacy nurse survey queue. |
| /staff | Screening staff | Screening staff session | Screening staff home. |
| /staff/funnel | Screening staff | Navigator, clinician, or admin role | Screening funnel metrics. |
| /staff/locations | Screening staff | Navigator, clinician, or admin role | Demo screening locations. |
| /staff/reviews | Screening clinician | Clinician or admin role | Screening result review queue. |
| /staff/ui-kit | Developer | None | UI component preview. |
| /admin/intakes | Developer/doctor | Doctor session | Recent intakes and review metadata. |
| /admin/notes | Developer/doctor | Doctor session | Note check diagnostics. |
| /admin/sessions | Developer/doctor | Doctor session | Session pipeline diagnostics; transcript text is not shown. |
| /admin/summaries | Developer/doctor | Doctor session | Recent case-summary diagnostics. |

## API routes

| Path | Caller | Gate | Purpose |
| --- | --- | --- | --- |
| POST /api/register | Patient | Same-origin check | Create patient and initial intake. |
| POST /api/intake | Patient | Same-origin check | Add a follow-up intake. |
| POST /api/voice/transcribe | Patient or doctor | Same-origin, rate/size checks | Transcribe uploaded WAV audio. |
| GET /api/health | Monitor/developer | None | Check database availability. |
| POST /api/doctor/login | Doctor | Credentials | Create signed doctor session. |
| POST /api/doctor/logout | Doctor | Doctor session | Clear doctor session. |
| PUT /api/doctor/intakes/[intakeId] | Doctor | Doctor session | Save a clinician revision to an intake. |
| POST /api/doctor/encounters/[intakeId] | Doctor | Doctor session | Record a clinic encounter. |
| POST /api/doctor/patients/[patientId]/intakes | Doctor | Doctor session | Create a new follow-up intake for the patient. |
| POST /api/nurse/login | Nurse | Credentials | Create nurse session. |
| POST /api/nurse/logout | Nurse | Nurse session | Clear nurse session. |
| POST /api/nurse/survey-action | Nurse | Nurse session | Record a legacy survey decision. |
| POST /api/staff/login | Screening staff | Seeded credentials | Create screening staff session. |
| POST /api/staff/logout | Screening staff | Staff session | Clear screening staff session. |
| GET /api/staff/reviews | Screening clinician | Clinician/admin role | Read screening review queue. |
| POST /api/staff/reviews | Screening clinician | Clinician/admin role | Save review outcome. |
| GET /api/screening/rules | Participant | Anonymous session | Return localized safety gate wording. |
| POST /api/screening/start | Participant | Same-origin check | Start anonymous screening session. |
| POST /api/screening/locale | Participant | Anonymous session | Change session language. |
| GET /api/screening/progress | Participant | Anonymous session | Read screening progress. |
| POST /api/screening/answers | Participant | Same-origin and consented session | Save screening answers. |
| POST /api/screening/redflags | Participant | Same-origin and session | Save safety-gate response/escalation. |
| POST /api/screening/result | Participant | Same-origin and completed questions | Compute or retrieve screening result. |
| POST /api/screening/bookings | Participant | Anonymous session | Record a click on a demo testing location. |
| POST /api/screening/bookings/status | Participant | Anonymous session | Save self-reported booking/test status. |
| POST /api/screening/contact | Participant | Contact consent | Save optional contact details. |
| POST /api/screening/contact/withdraw | Participant | Anonymous session | Withdraw contact sharing. |
| POST /api/screening/lab-results | Participant or staff | Session or staff gate by source | Save an unverified or staff-entered result. |
| POST /api/screening/restart | Participant | Anonymous session | Start over after an allowed session state. |
| POST /api/survey/submissions | Legacy survey user | Same-origin/session rules | Accept old survey submissions. |
| POST /api/survey/explain | Patient | Same-origin/rate limits | Generate or return legacy survey explanation. |
| POST /api/survey/phrasing | Patient | Same-origin/rate limits | Generate or return legacy survey wording. |
| GET/POST /api/notes | Doctor/nurse | Staff session | Save and check a visit note. |
| POST /api/notes/[id]/override | Doctor/nurse | Staff session | Record a reviewed checklist override. |
| POST /api/sessions | Doctor | Doctor session and consent | Create a visit session. |
| POST /api/sessions/paste | Doctor | Doctor session | Add pasted transcript text. |
| GET /api/sessions/[id] | Doctor | Doctor session | Read visit-session state. |
| POST /api/sessions/[id]/discard | Doctor | Doctor session | Discard a session draft. |
| POST /api/sessions/[id]/end | Doctor | Doctor session | End recording. |
| POST /api/sessions/[id]/roles | Doctor | Doctor session | Confirm transcript speaker roles. |
| POST /api/sessions/[id]/segments | Doctor | Doctor session | Upload/transcribe a session audio chunk. |
| POST /api/sessions/[id]/summarize | Doctor | Doctor session | Generate a draft visit summary. |
| POST /api/sessions/[id]/summary/[summaryId]/approve | Doctor | Doctor session | Approve a session summary. |
| POST /api/sessions/[id]/transcript/delete | Doctor | Doctor session | Delete stored session transcript text. |
| POST /api/summary | Doctor | Doctor session, same-origin, rate limit | Generate a case summary. |
| POST /api/reminders/run | Cron | CRON_SECRET when configured | Process scheduled reminders. |

<details>
<summary>Representative request and response shapes</summary>

Patient registration uses POST /api/register with registration form values, a request id, and optional survey data. It returns success and a reference code. Patient intake uses POST /api/intake with patient id, free text, tap answers, and input-method provenance; success returns an intake id. These routes reject invalid bodies and apply same-origin/rate guards.

Voice transcription posts multipart form data with a WAV file, language hint, context, and optional chunk sequence metadata. Success returns editable transcript text, selected provider metadata in logs, and chunk ordering fields. It never saves raw audio.

Case-summary generation accepts a patient id and returns a generated summary result or a bounded error. Screening result bodies are session-bound; clients cannot supply computed scores or red-flag decisions as authoritative values.

</details>
