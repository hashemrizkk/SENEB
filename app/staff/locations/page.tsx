import { listScreeningLocations } from "@/lib/db";
import { requireStaffPage } from "@/lib/screening/page-auth";
import StaffShell from "@/components/screening/StaffShell";
export const dynamic="force-dynamic";
export default async function StaffLocationsPage(){const user=await requireStaffPage(["navigator","clinician","admin"]);const locations=listScreeningLocations();return <StaffShell user={user}><section className="doctor-card"><h2>Testing locations</h2><p>Every location below is fake demo data, not a real service.</p><ul>{locations.map((item)=><li key={String(item.id)}>{String(item.name)} — {String(item.city)}, {String(item.area)} — {String(item.phone)} (demo)</li>)}</ul></section></StaffShell>;}
