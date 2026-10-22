import { screeningReviewQueue } from "@/lib/db";
import { requireStaffPage } from "@/lib/screening/page-auth";
import StaffShell from "@/components/screening/StaffShell";
import ReviewQueue from "@/components/screening/ReviewQueue";
export const dynamic="force-dynamic";
export default async function StaffReviewsPage(){const user=await requireStaffPage(["clinician","admin"]);return <StaffShell user={user}><section className="doctor-card"><h2>Clinical review queue</h2><p>Review submitted test results. The tool does not diagnose.</p><ReviewQueue reviews={screeningReviewQueue()}/></section></StaffShell>;}
