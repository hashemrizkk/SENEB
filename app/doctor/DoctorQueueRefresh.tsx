"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function DoctorQueueRefresh() {
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
    ? <p><button type="button" onClick={() => { setManualRefresh(true); router.refresh(); }}>Refresh queue</button>{manualRefresh ? <span role="status"> Queue refreshed.</span> : null}</p>
    : <p aria-live="polite">This queue refreshes automatically every 20 seconds.</p>;
}
