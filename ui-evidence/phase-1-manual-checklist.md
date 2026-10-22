# Phase 1 review checklist

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
