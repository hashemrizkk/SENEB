# Data model

SQLite schema is created from lib/schema.sql and migrations in lib/db.ts, lib/db-migrations.ts, and lib/doctor-review.ts. SQL remains in the database layer.

## Tables

| Table | Purpose and key columns |
| --- | --- |
| patients | Patient record: id, name, age, phone/email, diabetes_type, reference_code, care-gap dates, consent_at. |
| intakes | Submitted or assisted intake: patient_id, input_method, raw_text, structured_json, red_flags_json, meta_json, status, priority, version, editor and timestamps. |
| intake_revisions | Immutable revision snapshots: intake_id, revision, source, editor, reason/reason_type, snapshot_json, changed_fields_json, is_backfill. |
| notes | Visit notes and check results: patient_id, intake_id, note_text, input_method, author role/name, check mode/model, light, rules version, override and fallback details. |
| note_audit | Append-only history of note light overrides, including old/new value, reason, and actor. |
| followups | Follow-up plans, next visit, confirmation, message, status, and reply. |
| messages | Queued recap/reminder messages, schedule, status, attempt count, provider reference, and error. |
| case_summaries | New summary versions with generation mode/model, facts, rule/AI flags, verified values, inconsistencies, priority reasons, and rules version. |
| visit_sessions | Consent, participants, lifecycle state, linked patient/intake, duration, and transcript deletion/discard metadata. |
| session_utterances | Stored transcript segments, speaker labels, suggested and confirmed roles, text, and segment order. |
| session_summaries | Versioned session summary drafts, mode/model, key points/values, approval, and superseded status. |
| session_audit | Session actions and actor metadata. |
| anonymous_sessions | Anonymous screening cookie hash, locale/status, last step, expiry, and pinned scoring/ruleset ids. |
| consent_records | Session consent purpose, version/hash of legal text, grant and withdrawal timestamps. |
| scoring_versions | Versioned screening config, hash, citation, source, license/validation notes, lifecycle status, and approver. |
| redflag_rulesets | Versioned screening safety rules, emergency number, and lifecycle/approval fields. |
| content_blocks | Versioned Arabic/English content and placeholder/approved status. |
| survey_responses | One answer per session/question, with selected option and points. |
| risk_assessments | Computed total, band, breakdown, symptom modifier, and scoring version. |
| recommendations | Recommendation kind and content-block keys tied to an assessment. |
| safety_escalations | Matched rule ids, source, session, and ruleset. |
| test_locations | Demo or future location details, offered tests, active state, and is_demo_data. |
| bookings | Location selected and clicked or self-reported booking/test status. It is not a live booking integration. |
| contact_details | Optional session contact fields linked to a consent record. |
| lab_results | Entered test/value/unit/date, categorization version, source, and verification flag. |
| clinical_reviews | Result review status, outcome, clinician note, reviewer, and completion time. |
| staff_users | Screening staff username, role, and salted password hash. |
| audit_log | Append-only hash-chained screening actions. |
| analytics_events | Whitelisted, low-detail screening funnel events and properties. |

The schema also defines indexes for review queues, revision history, due messages, summaries, and session lookup. Screening migrations create tables only when absent, check columns before adding, and add append-only/config-immutability triggers.

## Revisions and provenance

Patient intake submission creates revision 1. Clinician edits update the current intake and append a new snapshot with a revision number, source, reason, and changed fields. Existing submitted text is preserved in the revision history. Older records without recoverable original submissions can receive a backfill snapshot explicitly marked as reconstructed.

The intake input_method column records tap, typed, voice, mixed, or assisted. The registration form derives typed/voice/mixed from text and transcript edits; tap answers can be stored as tap. A clinician-created intake is assisted. Transcript text becomes normal patient text only after review and form submission. Visit sessions separately record voice or pasted input and retain utterance text, not raw audio.

## Migration and local storage behavior

On application startup, the database layer opens hackathon.db (or HACKATHON_DB_PATH), executes the base schema, and runs repeatable table/column migrations. The better-sqlite3 connection uses WAL mode and enables foreign keys. A new empty database receives 15 fictional patients.

The reset script deletes hackathon.db and its -shm and -wal companions before creating demo records. The script uses the default path directly; do not expect HACKATHON_DB_PATH to protect the default file when running db:reset.

Vercel functions do not share a permanent local SQLite file. Current deployed persistence is therefore not reliable.
