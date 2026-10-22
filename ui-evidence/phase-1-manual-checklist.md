# Phase 1 review checklist

## Nile teal migration evidence

- This migration reuses the existing `components/ui` foundation and changes its visual tokens to the latest brief. The tracked contrast output is `phase-1-contrast.txt`.
- Conflicts resolved from the existing coral foundation: coral/cream palette → Nile teal/limestone; Cairo plus Inter → one Readex Pro family; 12/16px control/card radii → 14/20px plus an arch token; coral focus ring and white gap → ink outline with 2px offset; old single shadow and background-position shimmer → two single-layer shadow tokens and transform-only shimmer; transitions on color/border/shadow and progress width → transform/opacity-only motion inside reduced-motion-safe media rules; previous status pairs → the requested pairs, with darker border shades where needed to meet 3:1.
- Route structure, page behavior, existing visible text, auth, API, and safety meanings are not part of this migration. No user-facing strings were added.
- Browser access is disabled in this workspace, so no new screenshots or visual inspection are claimed. `baseline-route-text.json` remains the available pre-restyle text snapshot; use the checklist below for the manual visual and keyboard review when browser access is available.
- `bundle-budget-baseline.json` records the existing coral production build before this migration. `bundle-budget-current.json` records the Nile Phase 1 build.

## Available evidence

- The staff-only component preview is `/staff/ui-kit`. It renders every primitive once in an Arabic RTL section and once in an English LTR section. Opening it requires an existing screening-staff session; this environment had no configured staff credentials.
- Codex reports browser access disabled in Work settings. No browser screenshots or interactive keyboard checks could be made. The baseline server-rendered text and route checklist remain in this folder. The production build confirms Next generated `/staff/ui-kit`, but it does not prove browser layout or interaction.
- The preview strings reuse existing product text except the title and accessibility/loading labels listed in `components/copy/ui-copy.ts`.

## Manual checks when browser access is available

- [ ] Open `/staff/ui-kit` while signed in; inspect both direction sections at 360×740, 768×1024, and 1280×800.
- [ ] Keyboard through controls; confirm visible focus and the intended order.
- [ ] Open the preview dialog; verify initial focus, Tab/Shift+Tab trapping, Escape close, backdrop close, and focus restoration.
- [ ] Trigger the preview toast; confirm it announces politely, does not take focus, and dismisses after four seconds.
- [ ] Emulate reduced motion; confirm no spinner animation, shimmer, or press transform remains.
- [ ] Inspect Arabic text in the LTR section for correct bidi isolation.

No visual claims are made until these browser checks can be performed.
