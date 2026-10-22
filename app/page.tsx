import Link from "next/link";
import { ar } from "@/lib/strings.ar";

function HeartbeatMark() {
  return (
    <svg aria-hidden="true" className="home-heart" viewBox="0 0 48 40" fill="none">
      <path d="M24 37.2 5.6 20.1C-2.2 12.8 3.1 1 12.1 1c5.2 0 8.6 3.2 11.9 8.1C27.3 4.2 30.7 1 35.9 1c9 0 14.3 11.8 6.5 19.1L24 37.2Z" fill="currentColor" />
      <path d="M5.5 20h9.4l4.1-7.1 6.1 14.2 4.6-8h12.8" stroke="white" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.8" />
    </svg>
  );
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const { lang } = await searchParams;
  const locale = lang === "en" ? "en" : "ar";
  const isArabic = locale === "ar";
  const copy = isArabic ? ar.home : ar.home.en;
  const homeStats = [
    { value: isArabic ? "١٩٫٨٪" : "19.8%", label: copy.diabetesPrevalence },
    { value: isArabic ? "١٣٫٢ مليون" : "13.2 million", label: copy.diabetesCount },
    { value: isArabic ? "٦٢٪" : "62%", label: copy.undiagnosedShare },
  ];

  return (
    <main dir={isArabic ? "rtl" : "ltr"} lang={locale} className="home-page">
      <p className="home-demo-banner">{copy.demoBanner}</p>
      <header className="home-header" dir="ltr">
        <span aria-hidden="true" />
        <Link href={isArabic ? "/" : "/?lang=en"} className="home-brand" dir={locale}>
          <span>{copy.title}</span>
          <HeartbeatMark />
        </Link>
      </header>

      <div className="home-content">
        <section className="home-hero" aria-labelledby="home-title">
          <HeartbeatMark />
          <h1 id="home-title">{copy.title}</h1>
          <p>{copy.intro}</p>
        </section>

        <section className="home-stats" aria-label={copy.statisticsLabel}>
          {homeStats.map((stat) => (
            <div className="home-stat" key={stat.value}>
              <strong>{stat.value}</strong>
              <span>{stat.label}</span>
            </div>
          ))}
          <p className="home-stat-source">
            <a href="https://www.ncbi.nlm.nih.gov/books/NBK618739/table/wrap_table-mena/?report=objectonly" target="_blank" rel="noreferrer">
              {copy.statisticsSource}
            </a>
          </p>
        </section>

        <nav className="home-actions" aria-label={isArabic ? ar.appTitle : copy.actionsLabel}>
          <Link href={isArabic ? "/screening" : "/screening?lang=en"} className="home-start-link">
            <strong>{copy.startScreening}</strong>
          </Link>
          <Link href={isArabic ? "/register?lang=ar" : "/register?lang=en"} className="home-register-link">
            {copy.alreadyDiagnosed}
          </Link>
        </nav>
      </div>
    </main>
  );
}
