import { getPatient } from "@/lib/db";
import { ar } from "@/lib/strings.ar";
import IntakeForm from "./IntakeForm";

export const dynamic = "force-dynamic";

export default async function IntakePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: rawId } = await params;
  const id = parseInt(rawId, 10);

  if (isNaN(id) || id <= 0) {
    return (
      <main dir="rtl" lang="ar" style={{ padding: "2rem", fontFamily: "system-ui" }}>
        <p style={{ fontSize: "1.2rem" }}>{ar.patientNotFound}</p>
      </main>
    );
  }

  const patient = getPatient(id);

  if (!patient) {
    return (
      <main dir="rtl" lang="ar" style={{ padding: "2rem", fontFamily: "system-ui" }}>
        <p style={{ fontSize: "1.2rem" }}>{ar.patientNotFound}</p>
      </main>
    );
  }

  return <IntakeForm patientId={patient.id} patientName={patient.name} />;
}

