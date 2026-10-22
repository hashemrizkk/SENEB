import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SCREENING_STAFF_COOKIE, staffHasRole, verifyStaffSession, type ScreeningStaff } from "./staff-auth.ts";
export async function requireStaffPage(roles:ScreeningStaff["role"][]):Promise<ScreeningStaff>{
  const store=await cookies();const user=verifyStaffSession(store.get(SCREENING_STAFF_COOKIE)?.value);
  if(!staffHasRole(user,roles))redirect("/staff");return user;
}
