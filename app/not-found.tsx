import Link from "next/link";
import { ar } from "@/lib/strings.ar";

export default function NotFoundPage() {
  return (
    <main dir="rtl" lang="ar" style={{ padding: "2rem", textAlign: "center" }}>
      <h1>{ar.errorPatientNotFound}</h1>
      <Link href="/register">{ar.homeStart}</Link>
    </main>
  );
}
