"use client";

import { ar } from "@/lib/strings.ar";

export default function SuccessScreen({ referenceCode }: {
  referenceCode: string | null;
}) {
  return (
    <section dir="rtl" lang="ar" className="reg-success" role="status" aria-labelledby="reg-success-title">
      <span className="reg-success-mark" aria-hidden="true">✓</span>
      <h1 id="reg-success-title" className="reg-success-title">{ar.register.successTitle}</h1>

      {referenceCode ? (
        <div className="reg-success-reference">
          <p className="reg-success-label">{ar.register.successCodeLabel}</p>
          <bdi className="reg-success-code" dir="ltr">{referenceCode}</bdi>
        </div>
      ) : null}

      <p className="reg-success-note"><span aria-hidden="true">ℹ</span>{ar.clinicReviewNote}</p>
      <p className="reg-success-emergency"><span aria-hidden="true">🚨</span>{ar.emergencyNotice}</p>
    </section>
  );
}
