/**
 * All Arabic strings for the patient-facing intake form.
 * A native speaker can review every patient-visible string in this one file.
 */

export const ar = {
  appTitle: "مساعد متابعة الرعاية",
  appDescription: "نموذج تجريبي لمتابعة الرعاية في عيادات الرعاية الأولية.",
  homeStart: "ابدأ",
  // Page titles
  intakeTitle: "استبيان المتابعة",
  patientListTitle: "اختر المريض",
  patientListEmpty: "لا توجد سجلات تجريبية متاحة.",

  // Emergency notice (always visible)
  emergencyNotice: "🚨 لو الحالة طارئة اتصل بالإسعاف 123",

  // Clinic review note (always visible)
  clinicReviewNote: "إجاباتك بيراجعها فريق العيادة ومش فورية.",

  // Consent note (always visible)
  consentNote: "بإرسال إجاباتك، أنت موافق إنها تتشارك مع فريق العيادة.",

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
  errorPatientNotFound: "المريض غير موجود أو الرابط غير صحيح.",

  // Character counter
  charCounter: (current: number, max: number) => `${current}/${max}`,

  // Registration flow
  register: {
    yes: "نعم",
    no: "لا",
    demoBanner: "تجربة تسجيل سريعة: هذا النموذج يختبر تسجيل المريض.",
    step1Title: "معلوماتك الأساسية",
    step2Title: "أسئلة المتابعة",
    step3Title: "معلومات إضافية",
    step4Title: "الموافقة",
    fullName: "الاسم الكامل",
    fullNamePlaceholder: "اكتب اسمك الكامل",
    phone: "رقم الهاتف",
    phonePlaceholder: "مثال: 01012345678",
    email: "البريد الإلكتروني",
    emailPlaceholder: "اختياري",
    selfDescription: "ما الذي يزعجك أكثر في متابعة السكر؟",
    notes: "ملاحظات إضافية",
    consent: "أوافق على مشاركة معلوماتي مع فريق العيادة.",
    back: "رجوع",
    next: "التالي",
    submit: "إرسال",
    sending: "جاري الإرسال...",
    charCount: (current: number, max: number) => `${current}/${max}`,
    stepOf: (step: number, total: number) => `الخطوة ${step} من ${total}`,
    reviewEdit: "تعديل",
    unanswered: "غير مجاب",
    unansweredNudge: "بعض الأسئلة ما زالت غير مجابة. يمكنك العودة والتأكد من الإجابات قبل الإرسال.",
    errorGeneric: "حصلت مشكلة، حاول مرة أخرى.",
    errorSlow: "الطلب استغرق وقتًا طويلًا، حاول مرة أخرى.",
    errorOffline: "أنت غير متصل بالإنترنت حاليًا.",
    errorServer: "ما قدرناش نحفظ البيانات. حاول مرة تانية.",
    errorRateLimited: "في طلبات كتير دلوقتي. استنى شوية وحاول تاني.",
    successTitle: "تم التسجيل بنجاح",
    successCodeLabel: "رمز الإحالة الخاص بك",
    successReview: "سيتم مراجعة بياناتك من قبل فريق العيادة.",
    successEmergency: "إذا كانت الحالة طارئة، تواصل مع الطوارئ فورًا.",
    errors: {
      nameRequired: "الاسم مطلوب.",
      nameInvalid: "يرجى إدخال اسم صحيح.",
      phoneRequired: "رقم الهاتف مطلوب.",
      phoneInvalid: "رقم الهاتف غير صحيح.",
      emailInvalid: "البريد الإلكتروني غير صحيح.",
      consentRequired: "يجب الموافقة قبل الإرسال.",
      selfDescriptionLong: "وصفك طويل جدًا. الحد الأقصى 300 حرف.",
      notesLong: "الملاحظات طويلة جدًا. الحد الأقصى 500 حرف.",
      requestId: "معرف الطلب غير صالح.",
    },
  },
  admin: {
    title: "مراجعة استبيانات المتابعة",
    empty: "لا توجد استبيانات حتى الآن.",
    created: (date: string) => `تاريخ الإرسال: ${date}`,
    processing: "وضع الاستخراج",
    needsReview: "يحتاج مراجعة من فريق العيادة",
    contradiction: "يوجد تعارض بين الإجابة والنص",
    flags: "علامات للمراجعة",
    noFlags: "لا توجد علامات مسجلة.",
    unanswered: "أسئلة بدون إجابة",
    answers: "الحقول المستخرجة",
    patientText: "النص الذي أرسله المريض:",
    none: "لا يوجد",
    unavailable: "البيانات غير متاحة",
    unknown: "غير معروف",
  },
} as const;
