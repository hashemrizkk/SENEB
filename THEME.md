# SolveThe17 UI theme

Phase 1 foundation for the friendly clinic redesign, guided by the `survey-frontend` on the `ali_1` reference branch. The visual direction is warm cream, dark ink, deep coral actions, beige dividers, and rounded surfaces. Patient surfaces use Arabic and RTL by default; doctor, nurse, staff, and admin surfaces use English and LTR. This document is a usage guide, not a claim that later page phases have been completed.

## Foundations

- Tokens live in `components/ui/tokens.css`; TypeScript references live in `components/ui/tokens.ts`.
- Cairo is used for Arabic because the installed Next.js font registry contains its Arabic and Latin subsets and it is designed for Arabic legibility. Inter is used for English staff interfaces; the reference uses Hanken Grotesk, which is not available in this installed Next.js font registry. Next 16.4.2 self-hosts imported Google fonts at build time via `next/font`, so visitors do not fetch font files from Google.
- Use CSS Modules for new component styles. Keep spacing on the 4px scale and use logical properties such as `padding-inline`, `margin-block`, and `inset-inline` so layout can follow text direction.
- Patient base text is 18px with generous line height. Staff scopes are 16px and LTR. Arabic user text inside staff interfaces should use `UserText` or `<bdi dir="auto">`; `:lang(ar)` selects Cairo.
- `--primary-strong` is the reference's deep coral; `--primary-bright` is decoration only and must not be used for text, controls, borders, focus, or selected states. Normal priority is neutral slate, never green or coral. Color never communicates a status by itself: use visible text and an icon together.
- Every interactive control receives the shared `:focus-visible` treatment. It uses a high-contrast coral outer ring and a white inner gap so focus remains distinct around controls and light surfaces.
- Under `prefers-reduced-motion: reduce`, animation, transitions, transforms, shimmer, and pulse are removed; status text remains.

## Components and use

Import from `components/ui/primitives.tsx` unless a client-only component is needed.

| Component | Use |
|---|---|
| `Button` | Native button with primary, secondary, quiet, danger, and loading variants. Keep the button label visible while busy. |
| `IconButton` | Icon-only action. TypeScript requires an `aria-label`; use an icon from `icons.tsx`. |
| `Card` | Section/article surface for related content. |
| `Badge` | Status chip with a built-in icon and visible text. Choose urgent, important, normal, info, or success; do not change clinical meaning by changing colors. |
| `Input`, `Textarea`, `Select` | Native form controls. Always pair them with a visible `<label>` and existing validation behavior. `Textarea` has a counter slot. |
| `ProgressBar`, `Stepper` | Progress with visible text, not a color-only bar. `Stepper` marks completed steps with a check and labels the current step. |
| `Modal` | Client-only dialog with focus entry, Tab trapping, Escape close, backdrop close, and focus restoration. Keep the title specific and preserve the caller's state/behavior. |
| `Toast` | Client-only, polite announcement; noncritical messages dismiss after four seconds. Critical errors do not auto-dismiss. It never moves focus. |
| `InlineAlert` | Persistent actionable error; defaults to `role="alert"`. Use for save errors and conflicts while preserving the user's edited content. |
| `Skeleton` | Loading placeholder with `aria-busy` and visually hidden “Loading” text. |
| `EmptyState` | Inline decorative icon and existing empty-state text. |
| `SectionHeader` | Heading, optional description, and optional action. |
| `UserText` | `<bdi dir="auto">` isolation for names, notes, transcript text, and quotes in LTR pages. |
| `VisuallyHidden` | Screen-reader text that stays available to assistive technology. |
| `icons.tsx` | Small inline SVG set. Decorative icons are hidden from assistive technology by default. Directional arrows mirror in RTL. |

Use components as presentation only: do not move fetching, handlers, effects, validation, intervals, or API calls into this layer. Do not put new visible copy in components; add allowed new UI copy to `components/copy/ui-copy.ts` for later review.

## Direction rules

- The root document stays Arabic RTL. Nested `doctor`, `admin`, `nurse`, and `staff` layouts set an English LTR wrapper without changing route URLs or replacing the root layout.
- Keep phone, email, reference codes, and other Latin identifiers explicitly LTR.
- In English staff views, isolate patient-entered Arabic/Latin content with `UserText`; do not force the direction of mixed user text.
- New CSS must not use physical `left`/`right` direction properties. `npm run check:direction` checks styles and verifies the direction wrappers and bidi primitive.

## Safety and adding a screen

- Preserve every current disclaimer, consent sentence, red-flag and priority indicator, fallback/mock/unavailable badge, conflict/stale warning, traffic-light meaning, and error message verbatim and with equal or greater prominence. Review `ui-evidence/safety-inventory.md` before changing a screen.
- Patients must not receive staff-only flags, priority, notes, or medical interpretation. Do not add medical claims or imply a diagnosis, outcome, or approval.
- Before restyling a screen, capture its current visible text and enumerate safety signals. Apply tokens and components while keeping its data and behavior unchanged. Compare text against the baseline and inspect at 360px, 768px, and 1280px when browser access is available.
- Run `npm run check:contrast`, `npm run check:direction`, and `npm run check:scope` before committing. The scope check compares to `UI-Implementation` (override with `UI_SCOPE_BASE` only when the redesign base changes).
