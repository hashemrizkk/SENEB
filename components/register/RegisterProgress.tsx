"use client";

import { ar } from "@/lib/strings.ar";

export default function RegisterProgress({
  step,
  total,
}: {
  step: number;
  total: number;
}) {
  const label = ar.register.stepOf(step, total);

  return (
    <div className="reg-progress">
      <p className="reg-progress-label">{label}</p>
      <div
        className="reg-progress-track"
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={total}
        aria-valuenow={step}
        aria-label={label}
      >
        <div
          className="reg-progress-fill"
          style={{ width: `${(step / total) * 100}%` }}
        />
      </div>
    </div>
  );
}