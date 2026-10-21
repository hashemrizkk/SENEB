import Link from "next/link";
import { listPatients } from "@/lib/db";
import { ar } from "@/lib/strings.ar";

export const dynamic = "force-dynamic";

export default function IntakeListPage() {
  const patients = listPatients();

  return (
    <main
      dir="rtl"
      lang="ar"
      style={{ padding: "1.5rem", fontFamily: "system-ui, sans-serif" }}
    >
      <h1 style={{ fontSize: "1.5rem", marginBottom: "1rem" }}>
        {ar.patientListTitle}
      </h1>

      <p
        style={{
          background: "#fee2e2",
          padding: "0.75rem",
          borderRadius: "8px",
          marginBottom: "1rem",
          fontSize: "1.1rem",
        }}
      >
        {ar.emergencyNotice}
      </p>

      {patients.length === 0 ? <p>{ar.patientListEmpty}</p> : null}
      <ul style={{ listStyle: "none", padding: 0 }}>
        {patients.map((p) => (
          <li key={p.id} style={{ marginBottom: "0.5rem" }}>
            <Link
              href={`/intake/${p.id}`}
              style={{
                display: "block",
                padding: "1rem",
                border: "1px solid #ddd",
                borderRadius: "8px",
                textDecoration: "none",
                color: "#1a1a1a",
                fontSize: "1.2rem",
                minHeight: "48px",
              }}
            >
              {p.name}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
