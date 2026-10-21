import { getPatient } from "@/lib/db";
import { ar } from "@/lib/strings.ar";
import { notFound } from "next/navigation";
import IntakeForm from "./IntakeForm";

export const dynamic = "force-dynamic";

export default async function IntakePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: rawId } = await params;
  const id = /^\d+$/.test(rawId) ? Number(rawId) : NaN;

  if (!Number.isSafeInteger(id) || id <= 0) notFound();

  const patient = getPatient(id);

  if (!patient) notFound();

  return <IntakeForm patientId={patient.id} patientName={patient.name} />;
}
