"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function NurseQueueRefresh() {
  const router = useRouter();

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, 20_000);
    return () => window.clearInterval(timer);
  }, [router]);

  return <p aria-live="polite">This queue refreshes automatically every 20 seconds.</p>;
}
