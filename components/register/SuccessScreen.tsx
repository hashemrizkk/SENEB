"use client";

import { ar } from "@/lib/strings.ar";

export default function SuccessScreen({
  referenceCode,
}: {
  referenceCode: string | null;
}) {
  return (
    <main dir="rtl" lang="ar" className="reg-success" role="status">
      <h1 className="reg-success-title">{ar.register.successTitle}</h1>

      {referenceCode ? (
        <>
          <p className="reg-success-label">{ar.register.successCodeLabel}</p>
          <p className="reg-success-code">{referenceCode}</p>
        </>
      ) : null}

      <p className="reg-success-note">{ar.clinicReviewNote}</p>
      <p className="reg-success-emergency">{ar.emergencyNotice}</p>
    </main>
  );
}