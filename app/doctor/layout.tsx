import type { ReactNode } from "react";

export default function DoctorLayout({ children }: { children: ReactNode }) {
  return <div className="doctor-app">{children}</div>;
}
