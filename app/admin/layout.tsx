import type { ReactNode } from "react";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <div className="admin-app" dir="ltr" lang="en">{children}</div>;
}
