import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import UIPlayground from "@/components/ui/UIPlayground";
import StaffShell from "@/components/screening/StaffShell";
import { SCREENING_STAFF_COOKIE, verifyStaffSession } from "@/lib/screening/staff-auth";
import { uiCopy } from "@/components/copy/ui-copy";

export const metadata: Metadata = { title: uiCopy.uiKitTitle };

export default async function UIkitPage() {
  const cookieStore = await cookies();
  const user = verifyStaffSession(cookieStore.get(SCREENING_STAFF_COOKIE)?.value);
  if (!user) redirect("/staff");
  return <StaffShell user={user}><UIPlayground /></StaffShell>;
}
