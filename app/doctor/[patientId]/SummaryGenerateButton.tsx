"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

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
        router.refresh();
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
      <button type="button" onClick={generate} disabled={!hasIntake || loading}>
        {loading
          ? "Generating..."
          : hasIntake
            ? hasSummary
              ? "Regenerate"
              : "Generate summary"
            : "Generate summary"}
      </button>
      {!hasIntake ? <p>No intake yet</p> : null}
      {error ? (
        <p role="alert" style={{ color: "#991b1b" }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
