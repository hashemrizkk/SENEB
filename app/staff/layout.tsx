import type { ReactNode } from "react";

export default function StaffLayout({ children }: { children: ReactNode }) {
  return <div className="staff-app" dir="ltr" lang="en">{children}</div>;
}
