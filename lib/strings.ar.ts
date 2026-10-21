/**
 * All Arabic strings for the patient-facing intake form.
 * A native speaker can review every patient-visible string in this one file.
 */

export const ar = {
  // Page titles
  intakeTitle: "استبيان المتابعة",
  patientListTitle: "اختر المريض",

  // Emergency notice (always visible)
  emergencyNotice: "🚨 لو الحالة طارئة اتصل بالإسعاف 123",

  // Clinic review note (always visible)
  clinicReviewNote: "إجاباتك بيراجعها فريق العيادة ومش فورية.",

  // Consent note (always visible)
  consentNote: "بإرسال إجاباتك، أنت موافق إنها تتشارك مع فريق العيادة.",

  // Questions
  q1Label: "هل نسيت تاخد الدوا الأسبوع ده؟",
  q2Label: "كام مرة حسيت بهبوط في السكر (دوخة، عرق، رعشة)؟",
  q3Label: "في جرح أو ألم أو تنميل في رجلك؟",
  q4Label: "حصل تغيير في نظرك؟",
  q5Label: "عايز تقول حاجة تانية؟ (اختياري)",

  // Answer buttons
  yes: "نعم",
  no: "لا",
  zero: "٠",
  one: "١",
  two: "٢",
  threeOrMore: "٣ أو أكتر",

  // Free text
  freeTextPlaceholder: "اكتب هنا لو عايز تقول حاجة...",

  // Submit
  submitButton: "إرسال",
  submitting: "جاري الإرسال...",

  // After submit
  thankYou: "شكراً، تم إرسال إجاباتك.",
  errorGeneric: "حصل مشكلة، حاول تاني. إجاباتك لسه موجودة.",

  // Not found
  patientNotFound: "المريض غير موجود.",

  // Character counter
  charCounter: (current: number, max: number) => `${current}/${max}`,
} as const;

