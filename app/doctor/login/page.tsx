import { redirect } from "next/navigation";
import { currentDoctorSession } from "@/lib/doctor-review";
import DoctorLoginForm from "./DoctorLoginForm";

export const dynamic = "force-dynamic";

export default async function DoctorLoginPage() {
  if (await currentDoctorSession()) redirect("/doctor");
  return (
    <main style={{ maxWidth: 480, margin: "10vh auto", padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <h1>Doctor sign in</h1>
      <p>Use your clinic passcode and enter your name for the audit trail.</p>
      <DoctorLoginForm />
    </main>
  );
}
