import type { ReactNode } from "react";

export default function DoctorLayout({ children }: { children: ReactNode }) {
  return <div className="doctor-app" dir="ltr" lang="en">{children}</div>;
}
