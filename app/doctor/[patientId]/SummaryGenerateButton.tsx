"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function SummaryGenerateButton({
  patientId,
  hasIntake,
  hasSummary,
}: {
  patientId: number;
  hasIntake: boolean;
  hasSummary: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);

  useEffect(() => {
    if (cooldownSeconds === 0) return;
    const timer = window.setTimeout(() => {
      setCooldownSeconds((seconds) => Math.max(0, seconds - 1));
    }, 1_000);
    return () => window.clearTimeout(timer);
  }, [cooldownSeconds]);

  async function generate() {
    if (!hasIntake || loading) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patient_id: patientId }),
      });
      const result: unknown = await response.json();
      if (
        response.ok &&
        result !== null &&
        typeof result === "object" &&
        "ok" in result &&
        result.ok === true
      ) {
        setCooldownSeconds(0);
        router.refresh();
        return;
      }
      if (
        response.status === 429 &&
        result !== null &&
        typeof result === "object" &&
        "retry_after_seconds" in result &&
        typeof result.retry_after_seconds === "number" &&
        Number.isInteger(result.retry_after_seconds) &&
        result.retry_after_seconds > 0
      ) {
        setError(null);
        setCooldownSeconds(result.retry_after_seconds);
        return;
      }
      const message =
        result !== null &&
        typeof result === "object" &&
        "error" in result &&
        typeof result.error === "string"
          ? result.error
          : "The summary could not be generated.";
      setError(message);
    } catch {
      setError("The request failed. Check the connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={generate}
        disabled={!hasIntake || loading || cooldownSeconds > 0}
      >
        {loading
          ? "Generating..."
          : cooldownSeconds > 0
            ? `Wait ${cooldownSeconds}s to regenerate`
            : hasIntake
              ? hasSummary
                ? "Regenerate"
                : "Generate summary"
              : "Generate summary"}
      </button>
      {!hasIntake ? <p>No intake yet</p> : null}
      {cooldownSeconds > 0 ? (
        <p role="status">
          A summary was just generated. You can regenerate in {cooldownSeconds}{" "}
          second{cooldownSeconds === 1 ? "" : "s"}.
        </p>
      ) : null}
      {error ? (
        <p role="alert" style={{ color: "#991b1b" }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
