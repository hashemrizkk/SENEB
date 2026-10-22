# SolveThe17 visual identity

The UI direction is **Nile teal on limestone**: warm limestone backgrounds, deep teal actions, readable ink, and soft card surfaces. A rounded-top arch is the signature shape for the hero, saved state, and empty states. Keep it sparse and calm. This is a light-only theme.

## Foundations

- CSS tokens live in `components/ui/tokens.css`; the matching TypeScript values are in `components/ui/tokens.ts`. Use those tokens instead of new hex values.
- Readex Pro is the single font for Arabic and English. The installed Next.js 16.4.2 font registry contains its Arabic and Latin subsets and 400/500/600 weights. `next/font` self-hosts the selected font files.
- Use CSS Modules for new component styles. Use logical properties so layouts can follow text direction. `--enter-x` is positive in LTR and negative in RTL.
- Patients use Arabic RTL and 18px base text with 1.7 line height. Doctor, nurse, staff, and admin layouts use English LTR and 16px base text. Use `UserText` or `<bdi dir="auto">` for patient-generated text on LTR pages.
- Controls use 14px corners; cards 20px; chips are pill-shaped; arches use `--radius-arch`. Space values follow the 4px scale. Shadows are single-layer `--shadow-1` or `--shadow-2` only.
- `--faience` and `--sand` are decoration only: do not use them for text, selected states, borders, or controls. Status colors keep their clinical meaning, have visible labels and icons, and never represent “safe” or normal priority through green alone. The visit-note traffic light keeps its separate status tokens and shapes.
- Focus uses a 3px ink outline with a 2px offset. Keep it visible in forced-colors mode. Controls and secondary ink meet the contrast checks against their surfaces.
- The static emergency line, clinic-review timing, demo labels, consent text, AI/mock/unavailable disclosures, red flags, priority, traffic-light meaning, conflicts, and errors must stay visible and unchanged during visual work. Patients must never receive staff-only medical data.

## Components

Import shared pieces from `components/ui/primitives.tsx`; interactive dialog and toast pieces are client components.

| Component | Use |
|---|---|
| `Button` / `IconButton` | Primary, secondary, quiet, danger, and loading actions. Icon buttons require an accessible name. |
| `Card` | A surface for related content. |
| `Badge` | A status chip with both icon and label; preserve the meaning of each variant. |
| `Input`, `Textarea`, `Select` | Native controls paired with visible labels and existing validation. |
| `ProgressBar`, `Stepper` | Include a textual step count; completed steps show a check. |
| `Modal` | Client-only dialog with focus entry, Tab trapping, Escape/backdrop close, and focus restoration. |
| `Toast` | Polite, non-focus-stealing feedback; only noncritical messages auto-dismiss. |
| `InlineAlert` | Persistent actionable errors and conflict messages. |
| `Skeleton` | `aria-busy` plus visually hidden loading text; shimmer only when motion is allowed. |
| `EmptyState`, `SectionHeader` | Use existing screen copy and a small inline SVG where useful. |
| `UserText`, `VisuallyHidden` | Bidi isolation for patient text and assistive-only labels. |
| `icons.tsx` | Inline SVG only; hide decorative icons from assistive technology and mirror directional icons in RTL. |

Presentation components must not take over fetching, state, validation, effects, routing, or API calls. Keep visible copy unchanged, except for the explicitly allowed copy listed in the design brief, and put any such new strings in `components/copy/ui-copy.ts`.

## Motion and performance

The four signature effects are: (1) a 220ms transform/opacity step entrance from the reading-forward side, (2) answer selection with a 120ms tint fade and 160ms check pop, (3) a one-time 400ms arch success check, and (4) skeleton shimmer moved with `translateX`. Reduced motion shows the same state without movement or shimmer. The only other motion allowed is button press, a decorative mic pulse beside existing recording text, spinner rotation, and subtle row lift on hover devices.

Animate only `transform` and `opacity`; no layout properties, background position, filters, `transition: all`, JavaScript animation loops, or animation libraries. Put transitions and animations inside `prefers-reduced-motion: no-preference`. Put hover styles inside `@media (hover: hover)`. No layered shadows. `npm run check:animations` scans CSS and style-bearing TypeScript files for these rules.

`npm run check:budget` reads the latest production build manifests, compares each route's first-load JS against `ui-evidence/bundle-budget-baseline.json`, reports route CSS and font bytes, and fails if client JS grows by more than 10%. Run it after `npm run build`. Add `-- --record-current` to save a reviewable report. The baseline in this folder was captured from the existing coral-theme build immediately before this Nile theme migration.

## Direction, safety, and adding a screen

- The root remains `lang="ar" dir="rtl"`. Nested doctor, nurse, staff, and admin wrappers remain English LTR; route URLs do not change.
- Keep phone/email/reference codes explicitly LTR. Mixed patient text on LTR pages uses `dir="auto"` and bidi isolation.
- Read `ui-evidence/safety-inventory.md` and the route text baseline before restyling a screen. Keep all fields, visible copy, handlers, states, data flow, and safety meaning intact. Review patient pages to ensure they still expose no staff-only data.
- Use tokens and shared primitives, then inspect the result at 360, 480, 768, 1024, and 1280px when browser access is available. Record unavailable visual checks instead of claiming screenshots were reviewed.
- Check with `npm run check:contrast`, `npm run check:direction`, `npm run check:animations`, `npm run check:budget`, `npm run check:scope`, `npm run lint`, `npm run typecheck`, and `npm run build` as the work warrants. Do not modify protected business, API, database, auth, script, or test paths.
