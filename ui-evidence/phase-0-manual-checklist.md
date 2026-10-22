# Phase 0 baseline evidence

Baseline captured before UI source changes on branch `ui-redesign`, from `UI-Implementation`.

## Capture method and limitation

The Codex computer-use inventory reports that browser use is disabled in Work settings, and no browser is available. Per the request, no Playwright dependency was added. `baseline-route-text.json` contains the server-rendered visible text for each route listed in it, collected from the local Next.js 16.4.2 dev server. `route-files.txt` inventories all page routes. `inline-style-files.txt` lists files with inline styles. These are text evidence, not visual screenshots.

Authenticated doctor, nurse, admin, and screening-staff pages returned their existing sign-in view in this unauthenticated capture. No demo credentials were read or printed, so those pages need manual visual review after login. Client-only states (wizard steps, recording, loading, errors, modals, focus) also need manual browser review.

## Route checklist

| Route | Baseline text captured | Baseline screenshots | Notes |
|---|---:|---:|---|
| `/` | Yes | Not available | Patient home, Arabic RTL |
| `/register` | Yes | Not available | Registration initial state; wizard steps require interaction |
| `/screening` | Yes | Not available | Patient screening, Arabic default |
| `/survey` | Yes | Not available | Legacy route response |
| `/voice-demo` | Yes | Not available | Initial demo state; recording/error states need interaction |
| `/doctor/login` | Yes | Not available | Public login |
| `/doctor` | Yes | Not available | Returned doctor login gate |
| `/doctor/[patientId]` | No | Not available | Requires an authenticated doctor and a fake patient id |
| `/doctor/[patientId]/session` | No | Not available | Requires an authenticated doctor and a fake patient id |
| `/doctor/[patientId]/summary` | No | Not available | Requires an authenticated doctor and a fake patient id |
| `/nurse/login` | Yes | Not available | Public login |
| `/nurse` | No | Not available | Requires nurse authentication |
| `/staff` | Yes | Not available | Unauthenticated screening staff login |
| `/staff/reviews` | No | Not available | Requires screening staff authentication |
| `/staff/funnel` | No | Not available | Requires screening staff authentication |
| `/staff/locations` | No | Not available | Requires screening staff authentication |
| `/screening/locations` | Yes | Not available | Demo locations; server-rendered initial state |
| `/screening/summary` | Yes | Not available | Empty summary state |
| `/admin/intakes` | Yes | Not available | Returned doctor login gate |
| `/admin/notes` | Yes | Not available | Returned doctor login gate |
| `/admin/sessions` | Yes | Not available | Returned doctor login gate |
| `/admin/summaries` | Yes | Not available | Returned doctor login gate |

No screenshots were fabricated. The requested 360×740, 768×1024, and 1280×800 views could not be captured without an available browser.
