import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Cairo, Inter } from "next/font/google";
import { ar } from "@/lib/strings.ar";
import "./globals.css";

const arabicFont = Cairo({
  subsets: ["arabic", "latin"],
  display: "swap",
  variable: "--font-arabic",
});

const englishFont = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-english",
});

export const metadata: Metadata = {
  title: ar.appTitle,
  description: ar.appDescription,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ar" dir="rtl" className={`${arabicFont.variable} ${englishFont.variable}`}>
      <body>{children}</body>
    </html>
  );
}
