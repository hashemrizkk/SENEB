"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Locale = "ar" | "en";

export default function LanguageSwitcher() {
  const router = useRouter();
  const [locale, setLocale] = useState<Locale>("ar");

  useEffect(() => {
    const applyLocale = () => {
      const query = new URLSearchParams(window.location.search);
      const selected: Locale = query.get("lang") === "en" ? "en" : "ar";
      setLocale(selected);
      document.documentElement.lang = selected;
      document.documentElement.dir = selected === "ar" ? "rtl" : "ltr";
    };
    const preserveLocale = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      const nextUrl = new URL(anchor.href, window.location.href);
      if (nextUrl.origin !== window.location.origin || nextUrl.searchParams.has("lang")) return;
      nextUrl.searchParams.set("lang", document.documentElement.lang === "en" ? "en" : "ar");
      anchor.href = `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`;
    };
    applyLocale();
    document.addEventListener("click", preserveLocale, true);
    return () => document.removeEventListener("click", preserveLocale, true);
  }, []);

  function selectLanguage(next: Locale) {
    if (window.location.pathname === "/screening") {
      window.dispatchEvent(new CustomEvent("app-locale-change", { detail: next }));
      const current = new URL(window.location.href);
      current.searchParams.set("lang", next);
      window.history.replaceState(null, "", `${current.pathname}${current.search}${current.hash}`);
      setLocale(next);
      document.documentElement.lang = next;
      document.documentElement.dir = next === "ar" ? "rtl" : "ltr";
      return;
    }
    const url = new URL(window.location.href);
    url.searchParams.set("lang", next);
    router.push(`${url.pathname}${url.search}${url.hash}`);
  }

  return (
    <nav className="global-language-switcher" aria-label="Language / اللغة">
      <button type="button" lang="ar" aria-pressed={locale === "ar"} onClick={() => selectLanguage("ar")}>العربية</button>
      <button type="button" lang="en" aria-pressed={locale === "en"} onClick={() => selectLanguage("en")}>English</button>
    </nav>
  );
}
