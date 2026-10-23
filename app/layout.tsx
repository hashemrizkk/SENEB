import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Marcellus, Readex_Pro } from "next/font/google";
import { ar } from "@/lib/strings.ar";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import "./globals.css";

const solveFont = Readex_Pro({
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600"],
  display: "swap",
  variable: "--font-solve",
});

const senebDisplayFont = Marcellus({
  subsets: ["latin"],
  weight: "400",
  display: "swap",
  variable: "--font-seneb-display",
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
    <html lang="ar" dir="rtl" className={`${solveFont.variable} ${senebDisplayFont.variable}`}>
      <body><LanguageSwitcher />{children}</body>
    </html>
  );
}
