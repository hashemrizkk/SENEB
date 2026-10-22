import type { ReactNode } from "react";
import Link from "next/link";
import type { ScreeningStaff } from "@/lib/screening/staff-auth";
export default function StaffShell({user,children}:{user:ScreeningStaff;children:ReactNode}){
 return <main className="doctor-shell"><header className="doctor-header"><h1>Screening staff</h1><span>{user.role} · Demo-grade authentication, not production-ready</span></header><nav className="doctor-nav" aria-label="Staff pages"><Link href="/staff">Home</Link><Link href="/staff/reviews">Clinical reviews</Link><Link href="/staff/funnel">Funnel</Link><Link href="/staff/locations">Locations</Link><Link href="/doctor">Existing care</Link><form action="/api/staff/logout" method="post"><button type="submit">Sign out</button></form></nav><p className="doctor-card"><strong>Unapproved clinical items:</strong> FINDRISC version and cutpoints, red-flag rules, symptom modifier, blood-test categories, and all patient wording. Demo data only until clinician and legal review.</p>{children}</main>
}
