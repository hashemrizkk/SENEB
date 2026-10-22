import { useLang } from "../lib/lang";

/** Visible demo banner — required on every screen. */
export function DemoBanner() {
  const { t } = useLang();
  return (
    <div
      role="note"
      className="w-full text-center text-[15px] font-semibold py-2 px-4"
      style={{ background: "hsl(42 78% 93%)", color: "hsl(32 74% 30%)" }}
    >
      {t.demoBanner}
    </div>
  );
}

export function Header() {
  const { t, toggle, lang } = useLang();
  return (
    <header className="hairline-t border-t-0 border-b" style={{ borderBottom: "1px solid hsl(var(--border))" }}>
      <div className="container-app flex items-center justify-between py-4">
        <div className="flex items-center gap-2.5">
          <HeartMark />
          <span className="font-bold text-[19px] tracking-tight">{t.appName}</span>
        </div>
        <button
          type="button"
          onClick={toggle}
          className="min-h-[44px] px-4 rounded-full text-[15px] font-semibold border transition-colors hover:bg-[hsl(var(--secondary))]"
          style={{ borderColor: "hsl(var(--border))" }}
          aria-label={lang === "ar" ? "Switch to English" : "التبديل إلى العربية"}
        >
          {t.langToggle}
        </button>
      </div>
    </header>
  );
}

/** "This is a screening tool, not a diagnosis" — visible on both flows. */
export function Disclaimer({ className = "" }: { className?: string }) {
  const { t } = useLang();
  return (
    <p className={`text-[15px] leading-relaxed ${className}`} style={{ color: "hsl(var(--muted-foreground))" }}>
      <span aria-hidden="true" className="inline-block align-[-2px] me-1.5">
        <InfoIcon />
      </span>
      {t.disclaimer}
    </p>
  );
}

export function HeartMark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 21s-7.5-4.9-9.8-9.2C.7 8.6 2.6 5 6.1 5c2 0 3.4 1.1 4.1 2.3l1.8 2.9 1.8-2.9C14.5 6.1 15.9 5 17.9 5c3.5 0 5.4 3.6 3.9 6.8C19.5 16.1 12 21 12 21Z"
        fill="hsl(12 62% 44%)"
      />
      <path d="M4 12h4l1.6-2.6 2.4 5 1.6-2.4H20" stroke="#FAF9F6" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="12" cy="12" r="9.5" />
      <path d="M12 11v5.5" strokeLinecap="round" />
      <circle cx="12" cy="7.8" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  );
}
