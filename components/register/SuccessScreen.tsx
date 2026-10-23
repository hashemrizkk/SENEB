"use client";

import { ar } from "@/lib/strings.ar";

export default function SuccessScreen({ referenceCode, locale }: {
  referenceCode: string | null;
  locale: "ar" | "en";
}) {
  const copy = locale === "ar" ? ar.register : ar.register.en;
  return (
    <section dir={locale === "ar" ? "rtl" : "ltr"} lang={locale} className="reg-success" role="status" aria-labelledby="reg-success-title">
      <span className="reg-success-mark" aria-hidden="true">✓</span>
      <h1 id="reg-success-title" className="reg-success-title">{copy.successTitle}</h1>

      {referenceCode ? (
        <div className="reg-success-reference">
          <p className="reg-success-label">{copy.successCodeLabel}</p>
          <bdi className="reg-success-code" dir="ltr">{referenceCode}</bdi>
        </div>
      ) : null}

      <p className="reg-success-note"><span aria-hidden="true">ℹ</span>{copy.clinicReviewNote}</p>
      <p className="reg-success-emergency"><span aria-hidden="true">🚨</span>{copy.emergencyNotice}</p>
    </section>
  );
}
