import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Readex_Pro } from "next/font/google";
import { ar } from "@/lib/strings.ar";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import "./globals.css";

const solveFont = Readex_Pro({
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600"],
  display: "swap",
  variable: "--font-solve",
});

export const metadata: Metadata = {
  title: ar.appTitle,
  description: ar.appDescription,
};

export const viewport: Viewport = {
  colorScheme: "light",
  themeColor: "#FBFAF7",
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ar" dir="rtl" className={solveFont.variable}>
      <body><LanguageSwitcher />{children}</body>
    </html>
  );
}
