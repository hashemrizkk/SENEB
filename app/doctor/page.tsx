import db from "@/lib/db";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { hasAdminAccess } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

type Patient = {
  id: number;
  name: string;
  age: number | null;
  diabetes_type: string | null;
  next_visit_date: string | null;
  last_hba1c_date: string | null;
  last_foot_exam_date: string | null;
  last_bp_date: string | null;
};

export default async function DoctorPage() {
  const requestHeaders = await headers();
  if (!hasAdminAccess(requestHeaders.get("authorization"))) notFound();

  const patients = db
    .prepare<[], Patient>(
      `SELECT id, name, age, diabetes_type, next_visit_date,
              last_hba1c_date, last_foot_exam_date, last_bp_date
       FROM patients
       ORDER BY id`,
    )
    .all();

  return (
    <main>
      <h1>Patients</h1>
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
          </tr>
        </thead>
        <tbody>
          {patients.map((patient) => (
            <tr key={patient.id}>
              <td>{patient.name}</td>
              <td>{patient.age ?? "—"}</td>
              <td>{patient.diabetes_type ?? "—"}</td>
              <td>{patient.next_visit_date ?? "—"}</td>
              <td>{patient.last_hba1c_date ?? "—"}</td>
              <td>{patient.last_foot_exam_date ?? "—"}</td>
              <td>{patient.last_bp_date ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
