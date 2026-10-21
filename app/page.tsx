import Link from "next/link";
import { ar } from "@/lib/strings.ar";

export default function HomePage() {
  return (
    <main
      dir="rtl"
      lang="ar"
      style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: "1rem" }}
    >
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
        }}
      >
        {ar.homeStart}
      </Link>
    </main>
  );
}