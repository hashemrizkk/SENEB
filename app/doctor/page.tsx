import Link from "next/link";
import { requireDoctorSession } from "@/lib/doctor-review";
import { listQueue, type QueueFilter } from "@/lib/db";
import { flagLabel } from "@/lib/questions";
import { inputMethodLabel, inputMethodNote } from "@/lib/voice-utils";
import DoctorQueueRefresh from "./DoctorQueueRefresh";
import { ar } from "@/lib/strings.ar";

export const dynamic = "force-dynamic";

function selectedFilter(value: string | undefined): QueueFilter {
  return value === "new" || value === "triaged" ? value : "all";
}

export default async function DoctorPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const session = await requireDoctorSession();
  const { filter: rawFilter } = await searchParams;
  const filter = selectedFilter(rawFilter);
  const records = listQueue(filter);
  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
        <div>
          <h1>Doctor review queue</h1>
          <p>Signed in as {session.name}. Review flags are decision support, not a diagnosis.</p>
        </div>
        <form action="/api/doctor/logout" method="post">
          <button type="submit">Sign out</button>
        </form>
      </header>
      <DoctorQueueRefresh />
      <nav aria-label="Queue filters" style={{ display: "flex", gap: 12, marginBlock: 16 }}>
        {(["new", "triaged", "all"] as const).map((value) => (
          <Link
            key={value}
            href={`/doctor?filter=${value}`}
            aria-current={filter === value ? "page" : undefined}
          >
            {value === "new" ? "New" : value === "triaged" ? "Triaged" : "All"}
          </Link>
        ))}
        <Link href="/admin/intakes">Recent intake details</Link>
      </nav>
      {records.length === 0 ? <p>No intakes in this queue.</p> : null}
      <div style={{ overflowX: "auto" }}>
        <table>
          <thead>
            <tr>
              <th>Patient / reference</th>
              <th>Submitted</th>
              <th>Input method</th>
              <th>Queue state</th>
              <th>Priority</th>
              <th>Review flags</th>
              <th>Answers missing</th>
              <th>Record</th>
            </tr>
          </thead>
          <tbody>
            {records.map((record) => (
              <tr key={record.id}>
                <td>
                  <strong>{record.patient_name}</strong>
                  <br />
                  <small>{record.reference_code ?? "No reference code"}</small>
                  {record.meta?.survey ? (
                    <p>
                      <span aria-label="FINDRISC screening band">
                        FINDRISC · {ar.survey.bandNames[record.meta.survey.band]}
                      </span>
                    </p>
                  ) : null}
                </td>
                <td>{record.created_at ?? "Unknown"}</td>
                <td>
                  {inputMethodLabel(record.input_method)}
                  {inputMethodNote(record.input_method) ? (
                    <p>{inputMethodNote(record.input_method)}</p>
                  ) : null}
                </td>
                <td>{record.status}</td>
                <td>{record.priority ?? "Not assigned"}</td>
                <td>
                  {record.flags.flags.length
                    ? record.flags.flags.map(flagLabel).join(", ")
                    : "None"}
                  {record.edited ? <p>Edited by {record.edited_by}</p> : null}
                </td>
                <td>{record.unansweredCount}</td>
                <td>
                  <Link href={`/doctor/${record.patient_id}?intakeId=${record.id}`}>Review intake</Link>
                  <br />
                  <Link href={`/doctor/${record.patient_id}/summary`}>Case summary</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
