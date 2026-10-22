import Link from "next/link";
import db, { listAdminNoteSummaries } from "@/lib/db";
import { requireDoctorSession } from "@/lib/doctor-review";

export const dynamic = "force-dynamic";

export default async function AdminNotesPage() {
  await requireDoctorSession();
  const notes = listAdminNoteSummaries(db, 20);
  return (
    <main className="doctor-shell">
      <p><Link href="/doctor">← Review queue</Link></p>
      <h1>Recent visit note checks</h1>
      <p>Developer check page, not for patients.</p>
      <p><strong>Demo only: no login. Do not use with real patients.</strong></p>
      <p>This page shows check metadata only; note text is not displayed.</p>
      {!notes.length ? <p>No visit notes have been saved.</p> : (
        <div style={{ overflowX: "auto" }}>
          <table>
            <thead><tr><th>Patient</th><th>Note</th><th>Author</th><th>Saved</th><th>Mode</th><th>Light</th><th>Unverified</th><th>Override</th><th>Fallback</th></tr></thead>
            <tbody>{notes.map((note) => (
              <tr key={note.id}>
                <td>{note.patient_name}</td><td>#{note.id}</td>
                <td>{note.author_role ?? "Legacy"}: {note.author_name ?? "Unknown"}</td>
                <td>{note.created_at ?? "Unknown"}</td><td>{note.check_mode ?? "Legacy"}</td>
                <td>{note.light ?? "Could not verify"}</td><td>{note.unverified_items ?? "—"}</td>
                <td>{note.override_light ?? "No"}</td><td>{note.fallback_reason ?? "—"}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </main>
  );
}
