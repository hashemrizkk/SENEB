import { redirect } from "next/navigation";
import { currentNurseSession } from "@/lib/nurse-auth";
import NurseLoginForm from "./NurseLoginForm";

export const dynamic = "force-dynamic";

export default async function NurseLoginPage() {
  if (await currentNurseSession()) redirect("/nurse");
  return (
    <main style={{ maxWidth: 480, margin: "10vh auto", padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <h1>Nurse sign in</h1>
      <p>Sign in with the separately configured nurse credentials.</p>
      <NurseLoginForm />
    </main>
  );
}
