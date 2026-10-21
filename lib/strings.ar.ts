/**
 * Arabic strings for patient-facing pages.
 */

export const ar = {
  appTitle: "مساعد متابعة الرعاية",
  appDescription: "نموذج تجريبي لمتابعة الرعاية في عيادات الرعاية الأولية.",
  homeStart: "ابدأ",
  demoWarning:
    "تنبيه: ده نموذج تجريبي. من فضلك استخدم بيانات وهمية فقط، وما تدخلش بيانات حقيقية.",
  // Emergency notice (always visible)
  emergencyNotice: "🚨 لو الحالة طارئة اتصل بالإسعاف 123",

  // Clinic review note (always visible)
  clinicReviewNote: "إجاباتك بيراجعها فريق العيادة ومش فورية.",

  // Answer buttons
  yes: "نعم",
  no: "لا",
  zero: "٠",
  one: "١",
  two: "٢",
  threeOrMore: "٣ أو أكتر",

  errorPatientNotFound: "المريض غير موجود أو الرابط غير صحيح.",

  // Registration flow
  register: {
    yes: "نعم",
    no: "لا",
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
