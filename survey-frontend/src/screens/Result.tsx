import { useLang } from "../lib/lang";
import { scoreSurvey } from "../lib/findrisc";
import type { SurveyAnswers, RiskTier } from "../lib/types";
import { Disclaimer } from "../components/Chrome";

/* ---------- Emergency override — always wins over the score ---------- */

export function EmergencyScreen({ onExit }: { onExit: () => void }) {
  const { t } = useLang();
  return (
    <main className="container-app pt-10 pb-16">
      <div
        className="rounded-2xl p-6 mb-6"
        style={{ background: "hsl(var(--danger-tint))", border: "1px solid hsl(var(--danger) / 0.35)" }}
      >
        <div className="flex items-center gap-3 mb-3">
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="hsl(var(--danger))" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 9v4.5" />
            <circle cx="12" cy="17" r="0.6" fill="hsl(var(--danger))" />
            <path d="M10.3 3.9 2.6 17.2A2 2 0 0 0 4.3 20.2h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
          </svg>
          <h1 className="font-extrabold text-[24px] leading-snug" style={{ color: "hsl(var(--danger))" }}>
            {t.emergencyTitle}
          </h1>
        </div>
        <p className="text-[17.5px] leading-relaxed mb-4" style={{ color: "hsl(36 12% 16%)" }}>
          {t.emergencyBody}
        </p>
        <a
          href="tel:123"
          className="btn-primary w-full text-[19px]"
          style={{ background: "hsl(var(--danger))" }}
          dir="ltr"
        >
          {t.emergencyCall}
        </a>
        <p className="text-[14.5px] mt-3" style={{ color: "hsl(var(--muted-foreground))" }}>
          {t.emergencyNote}
        </p>
      </div>
      <button type="button" onClick={onExit} className="btn-ghost w-full">
        {t.successHome}
      </button>
    </main>
  );
}

/* ---------- Result ---------- */

const TIER_STYLE: Record<RiskTier, { color: string; tint: string }> = {
  low: { color: "hsl(var(--ok))", tint: "hsl(var(--ok-tint))" },
  moderate: { color: "hsl(var(--warn))", tint: "hsl(var(--warn-tint))" },
  high: { color: "hsl(var(--danger))", tint: "hsl(var(--danger-tint))" },
};

export function Result({
  survey,
  onOptIn,
  onRetake,
}: {
  survey: SurveyAnswers;
  onOptIn: () => void;
  onRetake: () => void;
}) {
  const { t } = useLang();
  const { tier } = scoreSurvey(survey);
  const style = TIER_STYLE[tier];

  const tierTitle = tier === "low" ? t.tierLow : tier === "moderate" ? t.tierModerate : t.tierHigh;
  const tierBody = tier === "low" ? t.tierLowBody : tier === "moderate" ? t.tierModerateBody : t.tierHighBody;

  return (
    <main className="container-app pt-10 pb-16">
      <h1 className="font-extrabold text-[26px] mb-5">{t.resultTitle}</h1>

      <div
        className="rounded-2xl p-6 mb-6"
        style={{ background: style.tint, border: `1px solid ${style.color}` }}
        role="status"
      >
        <p className="font-extrabold text-[24px] mb-2" style={{ color: style.color }}>
          {tierTitle}
        </p>
        <p className="text-[17.5px] leading-relaxed" style={{ color: "hsl(36 12% 16%)" }}>
          {tierBody}
        </p>
      </div>

      <section className="mb-6 rounded-2xl p-6" style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}>
        <h2 className="font-bold text-[18px] mb-2" style={{ color: "hsl(var(--primary))" }}>
          {t.resultActionTitle}
        </h2>
        <p className="text-[17.5px] font-semibold leading-relaxed">{t.resultAction}</p>
        {survey.symptoms.length > 0 && (
          <p className="text-[15px] mt-2" style={{ color: "hsl(var(--muted-foreground))" }}>
            {t.resultSymptomNote}
          </p>
        )}
      </section>

      <section className="mb-8 rounded-2xl p-6" style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}>
        <h2 className="font-bold text-[18px] mb-2">{t.resultOptInTitle}</h2>
        <p className="text-[16px] mb-4" style={{ color: "hsl(var(--muted-foreground))" }}>
          {t.resultOptInBody}
        </p>
        <button type="button" onClick={onOptIn} className="btn-primary w-full">
          {t.resultOptInCta}
        </button>
        <button
          type="button"
          onClick={onRetake}
          className="w-full mt-2 min-h-[48px] text-[15.5px] font-semibold underline underline-offset-4"
          style={{ color: "hsl(var(--muted-foreground))" }}
        >
          {t.resultRetake}
        </button>
      </section>

      <Disclaimer className="mb-3" />
      <p className="text-[14px] leading-relaxed" style={{ color: "hsl(var(--muted-foreground))" }}>
        {t.notDiagnosisNote}
      </p>
    </main>
  );
}
