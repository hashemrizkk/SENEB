import Link from "next/link";
import { ar } from "@/lib/strings.ar";

export default function HomePage() {
  return (
    <main dir="rtl" lang="ar" className="home-page">
      <div className="home-content">
        <nav className="home-actions" aria-label={ar.appTitle}>
          <Link href="/register" className="home-card home-card-primary">
            <strong>{ar.homeStart}</strong>
          </Link>
          <Link href="/screening" className="home-card home-card-secondary">
            <strong>فحص مخاطر السكري</strong>
          </Link>
          <Link href="/voice-demo" className="home-card home-card-secondary">
            <strong>جرّب الإملاء الصوتي</strong>
          </Link>
        </nav>
      </div>
    </main>
  );
}
