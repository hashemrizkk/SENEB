import { useLang } from "../lib/lang";
import { Disclaimer, HeartMark } from "../components/Chrome";

export function Home({ onStartSurvey, onStartForm }: { onStartSurvey: () => void; onStartForm: () => void }) {
  const { t } = useLang();
  const stats = [
    { n: t.homeStat1, label: t.homeStat1Label },
    { n: t.homeStat2, label: t.homeStat2Label },
    { n: t.homeStat3, label: t.homeStat3Label },
  ];
  const steps = [t.homeHow1, t.homeHow2, t.homeHow3];

  return (
    <main className="container-app pt-12 pb-16">
      <div className="flex justify-center mb-6">
        <HeartMark size={52} />
      </div>
      <h1
        className="text-center font-extrabold leading-[1.25] mb-4"
        style={{ fontSize: "clamp(34px, 9vw, 48px)", letterSpacing: "-0.01em" }}
      >
        {t.homeTitle}
      </h1>
      <p
        className="text-center text-[18px] leading-relaxed max-w-[520px] mx-auto"
        style={{ color: "hsl(var(--muted-foreground))" }}
      >
        {t.homeIntro}
      </p>

      <div className="mt-10 mb-10">
        {stats.map((s, i) => (
          <div
            key={i}
            className="flex items-baseline gap-4 py-4"
            style={{ borderTop: i === 0 ? "none" : "1px solid hsl(var(--border))" }}
          >
            <span
              className="font-bold shrink-0"
              style={{
                fontFamily: "'Hanken Grotesk', 'Cairo', sans-serif",
                fontSize: "clamp(26px, 7vw, 34px)",
                color: "hsl(var(--primary))",
                minWidth: "7.5ch",
              }}
            >
              {s.n}
            </span>
            <span className="text-[16px] leading-snug">{s.label}</span>
          </div>
        ))}
      </div>

      <button type="button" onClick={onStartSurvey} className="btn-primary w-full text-[19px]">
        {t.homeStart}
      </button>
      <button
        type="button"
        onClick={onStartForm}
        className="w-full mt-3 min-h-[48px] text-[15.5px] font-semibold underline underline-offset-4 decoration-1 transition-colors hover:text-[hsl(var(--primary))]"
        style={{ color: "hsl(var(--muted-foreground))" }}
      >
        {t.homeDirectForm}
      </button>

      <section className="mt-12" aria-labelledby="how-title">
        <h2 id="how-title" className="font-bold text-[20px] mb-4">
          {t.homeHowTitle}
        </h2>
        <ol className="space-y-4">
          {steps.map((s, i) => (
            <li key={i} className="flex items-start gap-3.5">
              <span
                className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-[14px] font-bold mt-0.5"
                style={{
                  background: "hsl(var(--accent))",
                  color: "hsl(var(--accent-foreground))",
                  fontFamily: "'Hanken Grotesk', 'Cairo', sans-serif",
                }}
              >
                {i + 1}
              </span>
              <span className="text-[16.5px] leading-relaxed">{s}</span>
            </li>
          ))}
        </ol>
      </section>

      <div className="mt-12 pt-6" style={{ borderTop: "1px solid hsl(var(--border))" }}>
        <Disclaimer />
      </div>
    </main>
  );
}
