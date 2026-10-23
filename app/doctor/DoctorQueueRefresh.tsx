"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ar } from "@/lib/strings.ar";

export default function DoctorQueueRefresh({ locale }: { locale: "ar" | "en" }) {
  const copy = locale === "ar" ? ar.doctor : ar.doctor.en;
  const router = useRouter();
  const [reducedMotion, setReducedMotion] = useState(false);
  const [manualRefresh, setManualRefresh] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (reducedMotion) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, 20_000);
    return () => window.clearInterval(timer);
  }, [router, reducedMotion]);

  return reducedMotion
    ? <p><button type="button" onClick={() => { setManualRefresh(true); router.refresh(); }}>{copy.refresh}</button>{manualRefresh ? <span role="status"> {copy.refreshed}</span> : null}</p>
    : <p aria-live="polite">{copy.refreshAutomatic}</p>;
}
