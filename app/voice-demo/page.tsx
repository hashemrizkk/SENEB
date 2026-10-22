"use client";

import { useState } from "react";
import VoiceInput from "@/components/VoiceInput";
import { characterErrorRate } from "@/lib/voice-utils";

const REFERENCES = [
  "صباح الخير، أنا جاهز لاختبار الإملاء الصوتي.",
  "النهارده الجو جميل والشارع هادي.",
  "عايز أراجع الكلام قبل ما أستخدمه.",
];

export default function VoiceDemoPage() {
  const [reference, setReference] = useState(REFERENCES[0]);
  const [transcript, setTranscript] = useState("");
  const errorRate = characterErrorRate(reference, transcript);

  return (
    <main
      dir="rtl"
      lang="ar"
      style={{
        maxWidth: 680,
        margin: "0 auto",
        padding: "1.25rem",
        fontFamily: "inherit",
        lineHeight: 1.7,
      }}
    >
      <h1>تجربة الإملاء الصوتي</h1>
      <p>
        جرّب الميكروفون أو اكتب النص يدويًا، ثم قارن النتيجة بعبارة مرجعية. هذه
        النسبة تقريبية وليست تقييمًا رسميًا لدقة الخدمة.
      </p>
      <p>
        سجّل حتى 30 ثانية، ثم يُحوّل Gemini الصوت إلى نص. لا تستخدم بيانات
        شخصية أو صحية حقيقية في هذه التجربة.
      </p>

      <fieldset
        style={{
          border: "1px solid var(--card-border)",
          borderRadius: 10,
          padding: "0.8rem",
        }}
      >
        <legend style={{ fontWeight: 700 }}>اختَر عبارة اختبار</legend>
        {REFERENCES.map((phrase) => (
          <label
            key={phrase}
            style={{
              display: "flex",
              gap: "0.6rem",
              alignItems: "flex-start",
              margin: "0.55rem 0",
            }}
          >
            <input
              type="radio"
              name="reference"
              checked={reference === phrase}
              onChange={() => setReference(phrase)}
              style={{ marginTop: "0.5rem" }}
            />
            <span>{phrase}</span>
          </label>
        ))}
      </fieldset>

      <VoiceInput
        id="voice-demo"
        label="النص المسجّل"
        maxChars={300}
        transcript={transcript}
        onTranscriptChange={setTranscript}
      />

      <section
        aria-live="polite"
        style={{
          marginTop: "1rem",
          padding: "0.9rem",
          borderRadius: 10,
          background: "var(--secondary)",
        }}
      >
        <h2 style={{ fontSize: "1.1rem", marginTop: 0 }}>العبارة المرجعية</h2>
        <p>{reference}</p>
        <p>
          معدل خطأ الأحرف التقريبي:{" "}
          <strong>
            {transcript ? `${(errorRate * 100).toFixed(1)}%` : "أدخل نصًا للمقارنة"}
          </strong>
        </p>
        <button
          type="button"
          onClick={() => setTranscript("")}
          style={{
            minHeight: 44,
            padding: "0.45rem 0.8rem",
            border: "1px solid var(--primary-strong)",
            borderRadius: 8,
            background: "var(--surface)",
            color: "var(--primary-strong)",
            font: "inherit",
          }}
        >
          بدء اختبار جديد
        </button>
      </section>
    </main>
  );
}
