import { cookies } from "next/headers";
import { SCREENING_STAFF_COOKIE, verifyStaffSession } from "@/lib/screening/staff-auth";
import StaffShell from "@/components/screening/StaffShell";
import StaffLoginForm from "@/components/screening/StaffLoginForm";
import { activeScoringVersion } from "@/lib/db";

export const dynamic="force-dynamic";
export default async function StaffHome(){const jar=await cookies();const user=verifyStaffSession(jar.get(SCREENING_STAFF_COOKIE)?.value);if(!user)return <main className="screening-page"><h1>Screening staff sign in</h1><p>Demo-grade authentication, not production-ready.</p><StaffLoginForm/></main>;const version=activeScoringVersion();return <StaffShell user={user}><section className="doctor-card"><h2>Screening operations</h2><p>Clinical configuration is not approved. The assessment and rules are for demonstration only.</p><p>Current scorer: {version?.version_label??"not seeded"} ({version?.status??"unavailable"})</p><p>Use the review queue for test results that need clinician attention.</p></section></StaffShell>;}
