import { requireDoctorSession } from "@/lib/doctor-review";
import { latestCaseSummaries } from "@/lib/db";
import { formatCairoDateTime } from "@/lib/date-time";

export const dynamic = "force-dynamic";

function parseArray(value: string | null): unknown[] {
  if (value === null) return [];
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed)) throw new Error("Stored summary list is invalid.");
  return parsed;
}

export default async function AdminSummariesPage() {
  await requireDoctorSession();

  const summaries = latestCaseSummaries(20);
  return (
    <main style={{ padding: 24, fontFamily: "inherit" }}>
      <h1>Developer check: case summaries</h1>
      <p>Developer check page, not for patients.</p>
      <p>Staff-only demo. Do not use with real patient data.</p>
      <div style={{ overflowX: "auto" }}>
      <table>
        <thead>
          <tr>
            <th>Patient</th>
            <th>Mode</th>
            <th>Model</th>
            <th>Suggested priority</th>
            <th>Reasons</th>
            <th>Rule-matched count</th>
            <th>AI-flag count</th>
            <th>Dropped AI items</th>
            <th>Created (Cairo)</th>
          </tr>
        </thead>
        <tbody>
          {summaries.map((summary) => {
            const reasons = parseArray(summary.priority_reasons_json);
            const ruleFlags = parseArray(summary.rule_flags_json);
            const aiFlags = parseArray(summary.ai_flags_json);
            return (
              <tr key={summary.id}>
                <td>{summary.patient_name}</td>
                <td>{summary.generation_mode}</td>
                <td>{summary.model ?? "—"}</td>
                <td>{summary.suggested_priority ?? "Not enough information"}</td>
                <td>
                  {reasons.map((reason, index) => {
                    if (
                      reason === null ||
                      typeof reason !== "object" ||
                      !("text" in reason) ||
                      typeof reason.text !== "string"
                    ) {
                      throw new Error("Stored priority reason is invalid.");
                    }
                    return <div key={index}>{reason.text}</div>;
                  })}
                </td>
                <td>{ruleFlags.length}</td>
                <td>{aiFlags.length}</td>
                <td>{summary.dropped_ai_items}</td>
                <td>{formatCairoDateTime(summary.created_at)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
    </main>
  );
}
