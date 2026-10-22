import { requireDoctorSession } from "@/lib/doctor-review";
import { getLatestSessionAdminRows } from "@/lib/db";
export const dynamic = "force-dynamic";
export default async function AdminSessionsPage() {
  await requireDoctorSession();
  const rows = getLatestSessionAdminRows();
  return <main style={{ maxWidth: 1100, margin: "0 auto", padding: 24 }}><h1>Session developer check</h1><p>Developer check page, not for patients. Transcript text is not shown.</p><table><thead><tr>{["Patient","Status","Duration","Segments","Utterances","Role changes","Mode","Dropped","Fallback","Approved by","Created"].map((heading) => <th key={heading}>{heading}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={String(row.id)}>{["patient","status","duration_seconds","segments","utterances","role_changes","mode","dropped_items","fallback_reason","approved_by","created_at"].map((key) => <td key={key}>{String(row[key] ?? "—")}</td>)}</tr>)}</tbody></table></main>;
}
