# Phase 0 safety-signal inventory

Inventory based on the current route/page and component source before styling changes. Preserve exact wording and ensure equal or greater prominence during later phases.

| Signal | Current UI/source location | Required preservation |
|---|---|---|
| Patient registration demo-only and fake-data notice | `/register` | Keep adjacent to form and prominent; no real patient details in visual test data |
| Emergency line / urgent-care wording | Registration copy, screening content, screening routes | Keep visible and clearly distinguished; never hide or reduce emphasis |
| Patient screening is not diagnostic | Screening landing/result content | Keep with screening result and explanations |
| Clinic-team review is not immediate | Registration copy | Keep on patient screens wherever currently shown |
| Voice recording consent and consent controls | `VoiceInput` | Keep before recording; preserve accept/cancel controls and exact consent text |
| Voice recording/browser/microphone failures and provider-unavailable messages | `VoiceInput` | Keep actionable errors and fallback text visible |
| Voice demo is approximate, not an official accuracy evaluation | `/voice-demo` | Keep beside metrics/results |
| Staff demo authentication is not production-ready | `/staff` and staff shell | Keep conspicuous on staff surfaces |
| Screening test, scoring thresholds, red-flag rules, content and locations are placeholders/demo-only and need clinician/legal review | Staff shell, staff pages, screening data | Keep prominent; never suggest approval or real clinic coverage |
| Screening result bands and red flags | Screening summary/results and staff review | Preserve labels, status meanings, and red-flag emphasis; no patients should gain staff-only detail |
| Booking/test progress is self-reported and unverified | Screening booking/status UI | Keep next to self-reported status |
| Doctor extraction/conflicting-information review notices | `/doctor/[patientId]` | Keep visible and persistent near the relevant record |
| Priority and red-flag indicators | Doctor queue and patient record | Preserve existing colors and text semantics; retain text labels and icons together |
| Visit-note checker is demo-only and not a judgment of care or patient safety | `VisitNoteSection` | Keep conspicuous near the traffic light |
| Traffic-light completeness states and override history | `VisitNoteSection` | Preserve meaning, state label, reason and reviewer history; do not imply clinical severity |
| Mock, AI unavailable, fallback reasons, and technical-detail disclosures | Visit-note and summary UI | Keep mode labels and fallback reasons adjacent to generated/check output |
| Session recording consent | `SessionPortal` | Keep before recording and preserve confirmation control |
| Recording summary is a draft until approved; AI-generated and not a verified medical record until doctor approval | `SessionPortal` | Keep alongside draft and approve actions |
| AI overview/generated text, MOCK, AI unavailable, fallback transcript combining speakers, unverified speaker labels, number verification | `SessionPortal` | Keep visible while reviewing/editing generated session content |
| Session draft is not part of the record and separate from intake/priority/case summary | `SessionSummarySection` | Preserve distinction and label |
| Failed saves, segment retry errors, and conflict states | Forms/session/summary components | Preserve persistent actionable error and keep the user's edits visible |
| Existing safety language, consent, or status in patient/doctor/admin/nurse views | Listed app routes and their components | Keep exact copy and at least equal visual prominence through later phases |

The baseline route text is in `baseline-route-text.json`; source matches were collected in `safety-source-matches.txt` and should be read with the locations above (the grep output also contained synthetic evaluation examples, which are not rendered UI).
