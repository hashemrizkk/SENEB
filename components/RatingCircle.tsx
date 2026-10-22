"use client";

const ratingPresentation = {
  green: { symbol: "🟢", text: "Complete" },
  yellow: { symbol: "🟡", text: "Needs attention" },
  red: { symbol: "🔴", text: "Incomplete" },
} as const;

export default function RatingCircle({
  rating,
  label,
  details,
  mode,
  prompt,
}: {
  rating: "green" | "yellow" | "red";
  label: string;
  details: string[];
  mode: "llm" | "mock" | "fallback";
  prompt?: string | null;
}) {
  const presentation = ratingPresentation[rating];
  return (
    <div>
      <span aria-label={`${label}: ${presentation.text}`}>
        {presentation.symbol} {label}: {presentation.text}
      </span>
      {rating !== "green" && prompt ? <p>{prompt}</p> : null}
      {mode !== "llm" ? (
        <small style={{ display: "block" }}>Not a real AI rating ({mode}).</small>
      ) : null}
      <details>
        <summary>Rating details</summary>
        {details.length > 0 ? (
          <ul>{details.map((detail, index) => <li key={`${index}-${detail}`}>{detail}</li>)}</ul>
        ) : (
          <p>No missing items were reported.</p>
        )}
      </details>
    </div>
  );
}
