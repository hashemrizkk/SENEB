import { notFound } from "next/navigation";
import { requireDoctorSession } from "@/lib/doctor-review";
import { getPatientRecord } from "@/lib/db";
import SessionPortal from "@/components/SessionPortal";
export const dynamic = "force-dynamic";
export default async function SessionPage({ params }: { params: Promise<{ patientId: string }> }) {
  await requireDoctorSession();
  const { patientId: raw } = await params;
  const patientId = Number(raw);
  if (!Number.isSafeInteger(patientId) || patientId < 1 || !getPatientRecord(patientId)) notFound();
  return <SessionPortal patientId={patientId} />;
}
