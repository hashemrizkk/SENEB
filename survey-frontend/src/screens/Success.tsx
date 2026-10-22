import { useLang } from "../lib/lang";

export function Success({ code, onHome }: { code: string; onHome: () => void }) {
  const { t } = useLang();
  return (
    <main className="container-app pt-12 pb-16 text-center">
      <div
        className="w-16 h-16 rounded-full mx-auto mb-6 flex items-center justify-center"
        style={{ background: "hsl(var(--ok-tint))" }}
      >
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="hsl(var(--ok))" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4.5 12.5l5 5 10-11" />
        </svg>
      </div>

      <h1 className="font-extrabold text-[26px] mb-8">{t.successTitle}</h1>

      <p className="text-[16px] mb-2" style={{ color: "hsl(var(--muted-foreground))" }}>
        {t.successCodeLabel}
      </p>
      <p
        className="font-bold tracking-[0.2em] mb-2"
        dir="ltr"
        style={{
          fontFamily: "'Hanken Grotesk', monospace",
          fontSize: "clamp(36px, 11vw, 48px)",
          color: "hsl(var(--primary))",
        }}
      >
        {code}
      </p>
      <p className="text-[16px] font-semibold mb-8">{t.successCodeNote}</p>

      <div
        className="rounded-2xl p-5 mb-4 text-start"
        style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
      >
        <p className="text-[15.5px]" style={{ color: "hsl(var(--muted-foreground))" }}>
          {t.successReviewNote}
        </p>
      </div>
      <div
        className="rounded-2xl p-5 mb-8 text-start"
        style={{ background: "hsl(var(--danger-tint))", border: "1px solid hsl(var(--danger) / 0.3)" }}
      >
        <a href="tel:123" className="text-[16px] font-bold" style={{ color: "hsl(var(--danger))" }}>
          {t.successEmergency}
        </a>
      </div>

      <button type="button" onClick={onHome} className="btn-ghost w-full">
        {t.successHome}
      </button>
    </main>
  );
}
