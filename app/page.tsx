import Link from "next/link";
import { ar } from "@/lib/strings.ar";

export default function HomePage() {
  return (
    <main
      dir="rtl"
      lang="ar"
      style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: "1rem" }}
    >
      <div style={{ display: "grid", gap: "1rem" }}>
        <Link
          href="/register"
          style={{
            display: "inline-block",
            minHeight: 48,
            padding: "0.9rem 3rem",
            borderRadius: 14,
            background: "#0f6f5c",
            color: "#fff",
            fontSize: 20,
            fontWeight: 700,
            textDecoration: "none",
            textAlign: "center",
          }}
        >
          {ar.homeStart}
        </Link>
        <Link
          href="/voice-demo"
          style={{
            display: "inline-block",
            minHeight: 48,
            padding: "0.9rem 1.5rem",
            borderRadius: 14,
            border: "1px solid #0f6f5c",
            color: "#0f6f5c",
            fontSize: 18,
            fontWeight: 700,
            textDecoration: "none",
            textAlign: "center",
          }}
        >
          جرّب الإملاء الصوتي
        </Link>
      </div>
    </main>
  );
}