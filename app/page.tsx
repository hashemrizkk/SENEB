import Link from "next/link";
import { ar } from "@/lib/strings.ar";

const homeStats = [
  { value: "١٩٫٨٪", label: ar.home.diabetesPrevalence },
  { value: "١٣٫٢ مليون", label: ar.home.diabetesCount },
  { value: "٦٢٪", label: ar.home.undiagnosedShare },
];

function HeartbeatMark() {
  return (
    <svg aria-hidden="true" className="home-heart" viewBox="0 0 48 40" fill="none">
      <path d="M24 37.2 5.6 20.1C-2.2 12.8 3.1 1 12.1 1c5.2 0 8.6 3.2 11.9 8.1C27.3 4.2 30.7 1 35.9 1c9 0 14.3 11.8 6.5 19.1L24 37.2Z" fill="currentColor" />
      <path d="M5.5 20h9.4l4.1-7.1 6.1 14.2 4.6-8h12.8" stroke="white" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.8" />
    </svg>
  );
}

export default function HomePage() {
  return (
    <main dir="rtl" lang="ar" className="home-page">
      <p className="home-demo-banner">{ar.home.demoBanner}</p>
      <header className="home-header" dir="ltr">
        <Link href="/screening?lang=en" className="home-language-link" lang="en" dir="ltr">
          English
        </Link>
        <Link href="/" className="home-brand">
          <span>{ar.home.title}</span>
          <HeartbeatMark />
        </Link>
      </header>

      <div className="home-content">
        <section className="home-hero" aria-labelledby="home-title">
          <HeartbeatMark />
          <h1 id="home-title">{ar.home.title}</h1>
          <p>{ar.home.intro}</p>
        </section>

        <section className="home-stats" aria-label={ar.home.statisticsLabel}>
          {homeStats.map((stat) => (
            <div className="home-stat" key={stat.value}>
              <strong>{stat.value}</strong>
              <span>{stat.label}</span>
            </div>
          ))}
          <p className="home-stat-source">
            <a href="https://www.ncbi.nlm.nih.gov/books/NBK618739/table/wrap_table-mena/?report=objectonly" target="_blank" rel="noreferrer">
              {ar.home.statisticsSource}
            </a>
          </p>
        </section>

        <nav className="home-actions" aria-label={ar.appTitle}>
          <Link href="/screening" className="home-start-link">
            <strong>{ar.home.startScreening}</strong>
          </Link>
          <Link href="/register" className="home-register-link">
            {ar.home.alreadyDiagnosed}
          </Link>
        </nav>
      </div>
    </main>
  );
}
