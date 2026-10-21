import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ar } from "@/lib/strings.ar";

export const metadata: Metadata = {
  title: ar.appTitle,
  description: ar.appDescription,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
