# Deployment notes

This is a deployment checklist for the current code, not a declaration that the app is ready for real clinical use.

## Current behavior

The application opens one better-sqlite3 file. Locally its default is hackathon.db in the current working directory; HACKATHON_DB_PATH can select another path. Vercel functions use ephemeral filesystems and independent instances do not share a durable local SQLite file. **The app does not reliably persist data when deployed to Vercel.** A successful response or deployment does not change that fact. See [Vercel's SQLite guidance](https://vercel.com/kb/guide/is-sqlite-supported-in-vercel).

The smallest future change is a hosted SQLite-compatible service and an adapter isolated behind lib/db.ts. Hosted Postgres is another option but would require broader query/schema changes. Neither adapter exists today.

## Demo deployment steps

1. Import the repository into a Vercel project.
2. Set the variables needed for the demo in project settings. Keep all model keys, staff credentials, and session secrets server-side. Do not set SCREENING_DEMO_MODE to true unless the deployment is intentionally showing placeholder scoring.
3. Build and deploy. The package build runs Next.js build.
4. Check the deployment's health endpoint and open the intended public routes.
5. Confirm login gates and warnings appear as expected. Do not enter real data.
6. Treat all database writes as temporary and potentially lost.

These steps do not add durable storage, production authentication, or clinical approval.

## Platform limits that affect this app

The voice API handler declares a 260-second maxDuration; the case-summary route declares 90 seconds; registration/intake declare 35 seconds. Vercel plan and compute settings can impose lower limits. Vercel's documented Node.js function request/response body maximum is 4.5 MB. The voice handler permits 4 MiB patient audio and 8 MiB doctor audio before platform enforcement, so the doctor allowance can exceed Vercel's body cap. See [Vercel function limits](https://vercel.com/docs/functions/limitations), [duration configuration](https://vercel.com/docs/functions/configuring-functions/duration), and [payload-too-large guidance](https://vercel.com/docs/errors/function_payload_too_large).

These platform figures were checked on 2026-10-23. Plan details can change. Some Vercel plans and compute modes support longer durations, but this repository does not configure maxDuration per project or adapt audio upload to platform limits.

## Scheduled reminder

vercel.json declares /api/reminders/run at minute zero of each hour. The endpoint checks CRON_SECRET when configured. Verify the schedule, environment, and endpoint behavior in the target Vercel project before relying on it. The current message system is not evidence that SMS, WhatsApp, or email reminders are operational.

## Before real use

Do not deploy for real patient workflows until the app has a durable database, validated backups and deletion, production identity and access control, security/privacy review, approved clinical content, and verified provider/consent terms. These items are not implemented by this deployment guide.
