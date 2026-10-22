import type { ReactNode } from "react";

export default function NurseLayout({ children }: { children: ReactNode }) {
  return <div className="nurse-app" dir="ltr" lang="en">{children}</div>;
}
