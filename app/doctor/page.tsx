import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { hasAdminAccess } from "@/lib/adminAuth";
import Link from "next/link";
import { latestIntakeForPatient, listPatients } from "@/lib/db";
import { intakeFieldsSchema, intakeMetaSchema } from "@/lib/intake";
import { assessIntake } from "@/lib/case-assessment";

export const dynamic = "force-dynamic";

export default async function DoctorPage() {
  const requestHeaders = await headers();
  if (!hasAdminAccess(requestHeaders.get("authorization"))) notFound();

  const patients = listPatients();

  return (
    <main>
      <h1>Patients</h1>
      <p>Demo only: no login. Do not use with real patients.</p>
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Age</th>
            <th>Diabetes type</th>
            <th>Next visit</th>
            <th>Last HbA1c</th>
            <th>Last foot exam</th>
            <th>Last BP</th>
            <th>Suggested priority</th>
          </tr>
        </thead>
        <tbody>
          {patients.map((patient) => {
            const intake = latestIntakeForPatient(patient.id);
            let priorityLabel = "No intake";
            if (intake) {
              let fields = intakeFieldsSchema.safeParse(null);
              try {
                fields = intakeFieldsSchema.safeParse(
                  intake.structured_json
                    ? JSON.parse(intake.structured_json)
                    : null,
                );
              } catch {
                fields = intakeFieldsSchema.safeParse(null);
              }
              let needsReview = true;
              if (intake.meta_json) {
                try {
                  const meta = intakeMetaSchema.safeParse(
                    JSON.parse(intake.meta_json),
                  );
                  needsReview = !meta.success || meta.data.needs_review;
                } catch {
                  needsReview = true;
                }
              }
              const suggestion = fields.success
                ? assessIntake({
                    fields: fields.data,
                    rawText: intake.raw_text,
                    hasIntake: true,
                    needsReview,
                  }).suggestion
                : { priority: null };
              priorityLabel =
                suggestion.priority === null
                  ? "Not enough information"
                  : suggestion.priority[0].toUpperCase() +
                    suggestion.priority.slice(1);
            }

            return (
              <tr key={patient.id}>
                <td>
                  <Link href={`/doctor/${patient.id}`}>{patient.name}</Link>
                </td>
                <td>{patient.age ?? "—"}</td>
                <td>{patient.diabetes_type ?? "—"}</td>
                <td>{patient.next_visit_date ?? "—"}</td>
                <td>{patient.last_hba1c_date ?? "—"}</td>
                <td>{patient.last_foot_exam_date ?? "—"}</td>
                <td>{patient.last_bp_date ?? "—"}</td>
                <td>
                  <span
                    style={{
                      display: "inline-block",
                      border: "1px solid #999",
                      borderRadius: 999,
                      padding: "0.2rem 0.6rem",
                    }}
                  >
                    ● {priorityLabel}
                  </span>{" "}
                  <small>(rules v1)</small>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </main>
  );
}
