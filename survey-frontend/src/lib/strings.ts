import type { Lang } from "./types";

const ar = {
  appName: "ماتستناش المستشفى",
  appNameEn: "Don't Wait for the Hospital",
  tagline: "فحص سريع لمخاطر السكري — دقيقتين ومن غير تسجيل",
  demoBanner: "ده نموذج تجريبي، ماتكتبش بيانات حقيقية",
  disclaimer: "ده أداة فحص مبدئي، مش تشخيص طبي",
  langToggle: "English",

  // Home
  homeTitle: "ماتستناش المستشفى",
  homeIntro:
    "في مصر حوالي ١ من كل ٥ بالغين عنده سكر، وأكتر من النص مش عارفين. الفحص ده يساعدك تعرف مستوى الخطورة عندك في دقيقتين — من غير ما ناخد أي بيانات شخصية.",
  homeStat1: "١٩.٨٪",
  homeStat1Label: "من البالغين في مصر عندهم سكر",
  homeStat2: "١٣.٢ مليون",
  homeStat2Label: "مصري عايشين بالسكري",
  homeStat3: "٦٢٪",
  homeStat3Label: "من الحالات لسه متشخصتش",
  homeStart: "ابدأ الفحص",
  homeDirectForm: "عندي سكر بالفعل وعايز أملأ فورم المتابعة",
  homeHowTitle: "بيتم إزاي؟",
  homeHow1: "جاوب على أسئلة قصيرة عن سنك ووزنك وعاداتك",
  homeHow2: "هتعرف مستوى الخطورة عندك بلغة بسيطة",
  homeHow3: "لو حابب، تملأ فورم متابعة وفريق الرعاية الأولية يتواصل معاك",

  // Survey chrome
  questionXofY: (x: number, y: number) => `سؤال ${toArabicDigits(x)} من ${toArabicDigits(y)}`,
  next: "التالي",
  back: "السابق",
  yes: "أيوه",
  no: "لأ",
  requiredHint: "اختار إجابة عشان تكمل",
  skipStep: "مش متأكد؟ اختار الأقرب ليك",

  // Q1 age
  qAge: "سنك كام؟",
  ageLt45: "أقل من ٤٥ سنة",
  age4554: "من ٤٥ لـ ٥٤ سنة",
  age5564: "من ٥٥ لـ ٦٤ سنة",
  age65plus: "٦٥ سنة أو أكتر",

  // Q2 BMI
  qBmi: "طولك ووزنك؟",
  qBmiHint: "بنحسب منهم مؤشر كتلة الجسم (BMI) — الرقم مش بيتخزن لوحده",
  heightCm: "الطول (سم)",
  weightKg: "الوزن (كجم)",
  heightPlaceholder: "مثال: ١٧٠",
  weightPlaceholder: "مثال: ٧٥",
  yourBmi: (bmi: string) => `مؤشر كتلة الجسم: ${bmi}`,
  errHeightWeight: "اكتب طولك ووزنك بأرقام صحيحة",

  // Q3 waist
  qWaist: "محيط الوسط (الخصر)؟",
  qWaistHint: "لو تعرف المقاس اكتبه بالسنتيمتر، لو لأ اختار الشكل الأقرب لجسمك",
  sexLabel: "النوع",
  male: "ذكر",
  female: "أنثى",
  waistCm: "محيط الوسط (سم)",
  waistPlaceholder: "مثال: ٩٥",
  waistDontKnow: "مش عارف المقاس",
  shapeSlim: "نحيف أو متوسط",
  shapeBelly: "عندي كرش / وزني زيادة شوية",
  shapeLarge: "جسمي كبير (شكل التفاحة)",
  errWaist: "اختار النوع واكتب المقاس أو اختار شكل الجسم",

  // Q4 activity
  qActivity: "بتتحرك أو بتلعب رياضة ٣٠ دقيقة على الأقل كل يوم؟",
  qActivityHint: "المشي السريع وشغل البيت بيتحسبوا",

  // Q5 food
  qFood: "بتاكل خضار أو فاكهة كل يوم؟",
  foodDaily: "كل يوم",
  foodNotDaily: "مش كل يوم",

  // Q6 BP
  qBp: "اتوصفلك دواء ضغط في أي وقت قبل كده؟",

  // Q7 glucose
  qGlucose: "قالولك قبل كده إن سكر الدم كان عالي عندك؟",
  qGlucoseHint: "مثلاً في الحمل، أو وقت مرض، أو في تحليل عادي",

  // Q8 family
  qFamily: "حد في عيلتك عنده سكر؟",
  familyNone: "لأ، محدش",
  familySecond: "أيوه — قريب من الدرجة التانية (جد / جدة / عم / خال / عمة / خالة)",
  familyFirst: "أيوه — قريب من الدرجة الأولى (أب / أم / أخ / أخت / ابن / بنت)",

  // Symptoms
  qSymptoms: "هل بتحس بأي حاجة من دي الفترة الأخيرة؟",
  qSymptomsHint: "ممكن تختار أكتر من حاجة",
  symptom_frequent_urination: "بتدخل الحمام كتير",
  symptom_excessive_thirst: "عطش شديد مش بيروح",
  symptom_unusual_fatigue: "إرهاق غير معتاد",
  symptom_blurred_vision: "نظر مش واضح (زغللة)",
  symptom_slow_wounds: "جروح بتاخد وقت طويل تشفى",
  symptom_tingling_feet: "تنميل أو وخز في القدمين",
  symptom_weight_loss: "وزنك نزل من غير سبب",
  symptomsNone: "ولا حاجة من دول",

  // Severe red flags
  qSevere: "هل حاسس دلوقتي حالاً بأي حاجة من دي؟",
  qSevereHint: "دي أعراض خطيرة محتاجة تدخل سريع",
  severe_confusion: "تشوش أو دوخة شديدة",
  severe_persistent_vomiting: "قيء مستمر مش بيقف",
  severe_fruity_breath: "رائحة النفس زي الفاكهة أو مزيل المناكير",
  severe_severe_abdominal_pain: "ألم شديد في البطن",
  severeNone: "لأ، ولا حاجة",
  seeResult: "شوف النتيجة",

  // Emergency
  emergencyTitle: "اطلب رعاية طارئة دلوقتي",
  emergencyBody:
    "الأعراض اللي اخترتها ممكن تكون علامة على حالة خطيرة محتاجة تدخل طبي فوري. روح أقرب قسم طوارئ أو اتصل بالإسعاف حالاً.",
  emergencyCall: "اتصل بالإسعاف: 123",
  emergencyNote: "متستناش النتيجة — الحالة دي مش ليها علاقة بنتيجة الفحص",

  // Result
  resultTitle: "نتيجة الفحص",
  tierLow: "مخاطرك منخفضة",
  tierLowBody:
    "نتيجتك مطمئنة دلوقتي. حافظ على وزنك وحركتك وأكلك، ولو عندك أي عرَض من اللي اخترته، استشير دكتور.",
  tierModerate: "مخاطرك متوسطة",
  tierModerateBody:
    "في شوية عوامل ممكن تزوّد احتمالية السكر عندك. تحليل بسيط هيطمنّك ويريّح بالك.",
  tierHigh: "مخاطرك عالية",
  tierHighBody:
    "فيه علامات كتير بتقول إن احتمالية السكر عندك عالية. مهم جداً تعمل تحليل في أقرب وقت.",
  resultActionTitle: "الخطوة الجاية",
  resultAction: "اعمل تحليل سكر صايم أو HbA1c في أقرب وحدة رعاية أولية ليك.",
  resultSymptomNote: "الأعراض اللي اخترتها بتزوّد أهمية تعمل التحليل بسرعة.",
  resultOptInTitle: "تحب نفتكرك ونتابع معاك؟",
  resultOptInBody: "سيب بياناتك في فورم المتابعة وفريق الرعاية الأولية هيفتكرك ويتابع معاك خطوة بخطوة.",
  resultOptInCta: "املأ فورم المتابعة",
  resultRetake: "إعادة الفحص",
  resultNoThanks: "كده كفاية، شكراً",

  // Form chrome
  formTitle: "فورم المتابعة",
  formIntro: "الفورم ده بيوصّل بياناتك لفريق الرعاية الأولية عشان يتابعوا معاك. خد وقتك — حوالي ١٠ دقايق.",
  stepXofY: (x: number, y: number) => `خطوة ${toArabicDigits(x)} من ${toArabicDigits(y)}`,
  submit: "إرسال الفورم",
  submitting: "جاري الإرسال…",
  errRequired: "الحقل ده مطلوب",
  errName: "اكتب اسمك (حروف بس)",
  errAge: "اكتب سنك بشكل صحيح",
  errPhone: "رقم الموبايل لازم يكون ١١ رقم ويبدأ بـ 01",
  errConsent: "لازم توافق قبل الإرسال",
  errGeneric: "حصل خطأ. حاول تاني.",

  // Form step 1 — identity
  f1Title: "بياناتك",
  fName: "الاسم الكامل",
  fNamePlaceholder: "اكتب اسمك",
  fAge: "السن",
  fAgePlaceholder: "مثال: ٤٥",
  fSex: "النوع",
  fGovernorate: "المحافظة",
  fGovernoratePlaceholder: "اختار محافظتك",
  fPhone: "رقم الموبايل",
  fPhonePlaceholder: "01012345678",
  fChannel: "تحب نتواصل معاك إزاي؟",
  channel_whatsapp: "واتساب",
  channel_sms: "رسالة SMS",
  channel_call: "مكالمة تليفون",
  fBestTime: "أحسن وقت نتواصل فيه؟",
  time_morning: "الصبح",
  time_afternoon: "الضهر",
  time_evening: "بالليل",

  // Form step 2 — diabetes status
  f2Title: "حالتك مع السكر",
  fStatus: "إيه وضعك مع السكر؟",
  status_never_tested: "معملتش تحليل سكر قبل كده",
  status_prediabetic: "قالولي عندي ما قبل السكري",
  status_type2: "عندي سكر نوع تاني",
  status_type1: "عندي سكر نوع أول",
  fDiagnosisYear: "اتشخصت سنة كام؟ (اختياري)",
  fDiagnosisYearPlaceholder: "مثال: ٢٠٢٠",

  // Form step 3 — labs
  f3Title: "آخر التحاليل",
  fLabType: "آخر تحليل سكر عملته",
  lab_none: "معملتش تحليل",
  lab_hba1c: "HbA1c (السكر التراكمي)",
  lab_fasting: "سكر صايم",
  fLabValue: "النتيجة",
  fLabValuePlaceholderHba1c: "مثال: ٧.٢٪",
  fLabValuePlaceholderFasting: "مثال: ١٢٦",
  fLabDate: "امتى تقريباً؟ (اختياري)",
  fLabDatePlaceholder: "مثال: شهر ٣ / ٢٠٢٥",
  fHomeReadings: "بتقيس السكر في البيت؟",
  fHomeValue: "قراءة معتادة (اختياري)",
  fHomeValuePlaceholder: "مثال: ١٤٠",

  // Form step 4 — medications
  f4Title: "أدويتك",
  fTakesMeds: "بتاخد أدوية حالياً؟",
  fMedAdd: "ضيف دواء",
  fMedName: "اسم الدواء",
  fMedNamePlaceholder: "مثال: جلوكوفاج",
  fMedDose: "الجرعة",
  fMedDosePlaceholder: "مثال: ٨٥٠ مجم مرتين يومياً",
  fMedRegular: "بتلتزم بيه؟",
  fMedRemove: "امسح",
  fMedQuickAdd: "أدوية شائعة:",
  medMetformin: "ميتفورمين (جلوكوفاج)",
  medInsulin: "أنسولين",
  medBp: "دواء ضغط",

  // Form step 5 — symptoms
  f5Title: "الأعراض الحالية",
  f5Hint: "اخترنا من الفحص الأعراض اللي ذكرتها — عدّل براحتك",
  symptom_chest_pain: "ألم في الصدر",
  symptom_shortness_of_breath: "ضيق في التنفس",
  symptom_fainting: "إغماء أو شبه إغماء",

  // Form step 6 — complications
  f6Title: "فحص المضاعفات",
  fEyeExam: "آخر مرة كشفت نظر (قاع عين)؟",
  fFootProblem: "عندك جروح أو مشاكل في القدم؟",
  fKidney: "عملت تحليل وظائف كلى؟",
  fHospital: "اتنقلت لمستشفى أو طوارئ آخر سنة؟",
  exam_within_year: "من أقل من سنة",
  exam_over_year: "من أكتر من سنة",
  exam_never: "معملتش",
  exam_unknown: "مش فاكر",
  visits0: "ولا مرة",
  visits1: "مرة",
  visits2plus: "مرتين أو أكتر",

  // Form step 7 — lifestyle
  f7Title: "نمط حياتك",
  fSmoking: "بتدخن؟",
  smoking_never: "مبدخنش",
  smoking_former: "كنت بدخن وبطلت",
  smoking_current: "بدخن حالياً",
  fActivity: "بتتحرك ٣٠ دقيقة على الأقل كل يوم؟",
  fDiet: "أكلك بشكل عام؟",
  diet_good: "صحي أغلب الوقت",
  diet_average: "وسط",
  diet_poor: "محتاج يتحسن",
  fRamadan: "نوي تصوم رمضان؟",
  ramadan_yes: "أيوه",
  ramadan_no: "لأ",
  ramadan_not_sure: "لسه مش متأكد",
  fRamadanHint: "معلومة مهمة لظبط مواعيد الأدوية مع الفريق",

  // Form step 8 — care access
  f8Title: "الوصول للرعاية",
  fUnitNearby: "فيه وحدة رعاية أولية قريبة منك؟",
  unknown: "مش عارف",
  fBarrier: "إيه أكتر حاجة بتمنعك من المتابعة؟",
  barrier_none: "مفيش حاجة",
  barrier_cost: "التكلفة",
  barrier_distance: "المسافة بعيدة",
  barrier_time: "مفيش وقت",
  barrier_fear: "قلق أو خوف",

  // Form step 9 — review & consent
  f9Title: "المراجعة والموافقة",
  fAnythingElse: "في حاجة تانية تحب تقولها؟ (اختياري)",
  fAnythingElsePlaceholder: "اكتب أي حاجة تحس إنها مهمة…",
  charCount: (n: number, max: number) => `${toArabicDigits(n)} / ${toArabicDigits(max)}`,
  fConsent: "موافق إن فريق الرعاية الأولية يشوف إجاباتي ويتواصل معايا",
  fReviewTitle: "ملخص إجاباتك",
  reviewEmpty: "لسه ماجاوبتش",

  // Success
  successTitle: "شكراً، تم إرسال إجاباتك",
  successCodeLabel: "كود المتابعة بتاعك:",
  successCodeNote: "احتفظ بالكود ده واذكره في الوحدة",
  successReviewNote: "فريق العيادة هيراجع إجاباتك — مش بشكل فوري",
  successEmergency: "لو الحالة طارئة اتصل بالإسعاف 123",
  successHome: "ارجع للرئيسية",

  // Shared
  notDiagnosisNote: "النتيجة دي مبنية على مقياس FINDRISC المعتمد عالمياً، وهي مجرد مؤشر — التشخيص الحقيقي بيكون بتحليل في معمل.",
};

const en: typeof ar = {
  appName: "Don't Wait for the Hospital",
  appNameEn: "ماتستناش المستشفى",
  tagline: "A 2-minute diabetes risk check — no sign-up needed",
  demoBanner: "Demo form — please don't enter real data",
  disclaimer: "This is a screening tool, not a medical diagnosis",
  langToggle: "عربي",

  homeTitle: "Don't Wait for the Hospital",
  homeIntro:
    "In Egypt, roughly 1 in 5 adults has diabetes — and over half don't know it. This quick check tells you your risk level in about two minutes, without collecting any personal data.",
  homeStat1: "19.8%",
  homeStat1Label: "of Egyptian adults live with diabetes",
  homeStat2: "13.2M",
  homeStat2Label: "people living with diabetes",
  homeStat3: "62%",
  homeStat3Label: "of cases are still undiagnosed",
  homeStart: "Start the check",
  homeDirectForm: "I already have diabetes — go to the follow-up form",
  homeHowTitle: "How it works",
  homeHow1: "Answer short questions about your age, weight and habits",
  homeHow2: "Get your risk level in plain language",
  homeHow3: "If you want, fill a follow-up form and the primary care team will reach out",

  questionXofY: (x: number, y: number) => `Question ${x} of ${y}`,
  next: "Next",
  back: "Back",
  yes: "Yes",
  no: "No",
  requiredHint: "Pick an answer to continue",
  skipStep: "Not sure? Choose the closest one",

  qAge: "How old are you?",
  ageLt45: "Under 45",
  age4554: "45 to 54",
  age5564: "55 to 64",
  age65plus: "65 or older",

  qBmi: "Your height and weight?",
  qBmiHint: "We use them to compute your BMI — the number isn't stored on its own",
  heightCm: "Height (cm)",
  weightKg: "Weight (kg)",
  heightPlaceholder: "e.g. 170",
  weightPlaceholder: "e.g. 75",
  yourBmi: (bmi: string) => `Your BMI: ${bmi}`,
  errHeightWeight: "Enter a valid height and weight",

  qWaist: "Your waist size?",
  qWaistHint: "If you know it, enter it in centimetres — otherwise pick the closest body shape",
  sexLabel: "Sex",
  male: "Male",
  female: "Female",
  waistCm: "Waist (cm)",
  waistPlaceholder: "e.g. 95",
  waistDontKnow: "I don't know it",
  shapeSlim: "Slim or average",
  shapeBelly: "Some belly / a bit overweight",
  shapeLarge: "Large build (apple shape)",
  errWaist: "Pick your sex and enter the measurement or choose a body shape",

  qActivity: "Do you move or exercise at least 30 minutes a day?",
  qActivityHint: "Brisk walking and housework count",

  qFood: "Do you eat vegetables or fruit every day?",
  foodDaily: "Every day",
  foodNotDaily: "Not every day",

  qBp: "Have you ever been prescribed blood-pressure medication?",

  qGlucose: "Have you ever been told your blood sugar was high?",
  qGlucoseHint: "For example during pregnancy, an illness, or a routine test",

  qFamily: "Does anyone in your family have diabetes?",
  familyNone: "No, nobody",
  familySecond: "Yes — a second-degree relative (grandparent / uncle / aunt)",
  familyFirst: "Yes — a first-degree relative (parent / sibling / child)",

  qSymptoms: "Have you felt any of these recently?",
  qSymptomsHint: "You can pick more than one",
  symptom_frequent_urination: "Frequent urination",
  symptom_excessive_thirst: "Excessive thirst",
  symptom_unusual_fatigue: "Unusual fatigue",
  symptom_blurred_vision: "Blurred vision",
  symptom_slow_wounds: "Slow-healing wounds",
  symptom_tingling_feet: "Tingling or numbness in the feet",
  symptom_weight_loss: "Unexplained weight loss",
  symptomsNone: "None of these",

  qSevere: "Are you feeling any of these right now?",
  qSevereHint: "These are serious warning signs",
  severe_confusion: "Confusion or severe dizziness",
  severe_persistent_vomiting: "Persistent vomiting",
  severe_fruity_breath: "Fruity or nail-polish-like breath",
  severe_severe_abdominal_pain: "Severe abdominal pain",
  severeNone: "No, none of these",
  seeResult: "See my result",

  emergencyTitle: "Seek emergency care now",
  emergencyBody:
    "The symptoms you picked can be signs of a serious condition that needs immediate medical attention. Go to the nearest emergency department or call an ambulance now.",
  emergencyCall: "Call ambulance: 123",
  emergencyNote: "Don't wait for a result — this overrides the screening score",

  resultTitle: "Your result",
  tierLow: "Low risk",
  tierLowBody:
    "Your result looks reassuring for now. Keep up your weight, movement and diet — and if any symptom you picked bothers you, see a doctor.",
  tierModerate: "Moderate risk",
  tierModerateBody:
    "A few factors may raise your chance of diabetes. A simple blood test will put your mind at ease.",
  tierHigh: "High risk",
  tierHighBody:
    "Several signs point to a high chance of diabetes. It's important to get tested soon.",
  resultActionTitle: "Your next step",
  resultAction: "Get a fasting glucose or HbA1c test at your nearest primary care unit.",
  resultSymptomNote: "The symptoms you picked make getting tested soon even more important.",
  resultOptInTitle: "Want us to remind you and follow up?",
  resultOptInBody:
    "Leave your details in the follow-up form and the primary care team will remind you and follow up step by step.",
  resultOptInCta: "Fill the follow-up form",
  resultRetake: "Retake the check",
  resultNoThanks: "I'm good, thanks",

  formTitle: "Follow-up form",
  formIntro:
    "This form passes your details to the primary care team so they can follow up with you. Take your time — about 10 minutes.",
  stepXofY: (x: number, y: number) => `Step ${x} of ${y}`,
  submit: "Submit the form",
  submitting: "Sending…",
  errRequired: "This field is required",
  errName: "Enter your name (letters only)",
  errAge: "Enter a valid age",
  errPhone: "Mobile number must be 11 digits starting with 01",
  errConsent: "You need to agree before submitting",
  errGeneric: "Something went wrong. Please try again.",

  f1Title: "Your details",
  fName: "Full name",
  fNamePlaceholder: "Type your name",
  fAge: "Age",
  fAgePlaceholder: "e.g. 45",
  fSex: "Sex",
  fGovernorate: "Governorate",
  fGovernoratePlaceholder: "Choose your governorate",
  fPhone: "Mobile number",
  fPhonePlaceholder: "01012345678",
  fChannel: "How should we reach you?",
  channel_whatsapp: "WhatsApp",
  channel_sms: "SMS",
  channel_call: "Phone call",
  fBestTime: "Best time to reach you?",
  time_morning: "Morning",
  time_afternoon: "Afternoon",
  time_evening: "Evening",

  f2Title: "You and diabetes",
  fStatus: "What's your diabetes status?",
  status_never_tested: "I've never had a blood sugar test",
  status_prediabetic: "I was told I have prediabetes",
  status_type2: "I have type 2 diabetes",
  status_type1: "I have type 1 diabetes",
  fDiagnosisYear: "Year of diagnosis? (optional)",
  fDiagnosisYearPlaceholder: "e.g. 2020",

  f3Title: "Latest test results",
  fLabType: "Your latest blood sugar test",
  lab_none: "Never tested",
  lab_hba1c: "HbA1c",
  lab_fasting: "Fasting glucose",
  fLabValue: "Result",
  fLabValuePlaceholderHba1c: "e.g. 7.2%",
  fLabValuePlaceholderFasting: "e.g. 126",
  fLabDate: "Roughly when? (optional)",
  fLabDatePlaceholder: "e.g. March 2025",
  fHomeReadings: "Do you check your sugar at home?",
  fHomeValue: "A typical reading (optional)",
  fHomeValuePlaceholder: "e.g. 140",

  f4Title: "Your medications",
  fTakesMeds: "Do you take any medication now?",
  fMedAdd: "Add a medication",
  fMedName: "Name",
  fMedNamePlaceholder: "e.g. Glucophage",
  fMedDose: "Dose",
  fMedDosePlaceholder: "e.g. 850mg twice daily",
  fMedRegular: "Taken regularly?",
  fMedRemove: "Remove",
  fMedQuickAdd: "Common ones:",
  medMetformin: "Metformin",
  medInsulin: "Insulin",
  medBp: "Blood-pressure med",

  f5Title: "Current symptoms",
  f5Hint: "We pre-ticked what you mentioned in the check — adjust freely",
  symptom_chest_pain: "Chest pain",
  symptom_shortness_of_breath: "Shortness of breath",
  symptom_fainting: "Fainting or near-fainting",

  f6Title: "Complication screening",
  fEyeExam: "Last eye (retina) exam?",
  fFootProblem: "Any foot wounds or problems?",
  fKidney: "Ever had a kidney function test?",
  fHospital: "Any hospital or ER visits in the last year?",
  exam_within_year: "Within a year",
  exam_over_year: "Over a year ago",
  exam_never: "Never",
  exam_unknown: "Not sure",
  visits0: "None",
  visits1: "Once",
  visits2plus: "Twice or more",

  f7Title: "Your lifestyle",
  fSmoking: "Do you smoke?",
  smoking_never: "Never smoked",
  smoking_former: "Used to, quit",
  smoking_current: "Currently smoking",
  fActivity: "Do you move at least 30 minutes a day?",
  fDiet: "How's your diet overall?",
  diet_good: "Healthy most of the time",
  diet_average: "So-so",
  diet_poor: "Needs work",
  fRamadan: "Planning to fast Ramadan?",
  ramadan_yes: "Yes",
  ramadan_no: "No",
  ramadan_not_sure: "Not sure yet",
  fRamadanHint: "Important for adjusting medication timing with the team",

  f8Title: "Access to care",
  fUnitNearby: "Is there a primary care unit near you?",
  unknown: "I don't know",
  fBarrier: "What's the main thing that stops you from following up?",
  barrier_none: "Nothing",
  barrier_cost: "Cost",
  barrier_distance: "Distance",
  barrier_time: "No time",
  barrier_fear: "Worry or fear",

  f9Title: "Review and consent",
  fAnythingElse: "Anything else you'd like to say? (optional)",
  fAnythingElsePlaceholder: "Write anything you feel is important…",
  charCount: (n: number, max: number) => `${n} / ${max}`,
  fConsent: "I agree that the primary care team can see my answers and contact me",
  fReviewTitle: "Summary of your answers",
  reviewEmpty: "Not answered yet",

  successTitle: "Thank you — your answers were sent",
  successCodeLabel: "Your follow-up code:",
  successCodeNote: "Keep this code and mention it at the unit",
  successReviewNote: "The clinic team will review your answers — not instantly",
  successEmergency: "If it's an emergency, call ambulance 123",
  successHome: "Back to home",

  notDiagnosisNote:
    "This result is based on the internationally validated FINDRISC scale — it's only an indicator. A real diagnosis needs a lab test.",
};

export type Strings = typeof ar;

export const strings: Record<Lang, Strings> = { ar, en };

/** Render Western digits as Arabic-Indic digits (for Arabic UI). */
export function toArabicDigits(x: number | string): string {
  const map = "٠١٢٣٤٥٦٧٨٩";
  return String(x).replace(/\d/g, (d) => map[Number(d)]);
}

/** Generate a short, unambiguous reference code (no 0/O/1/I/L). */
export function makeReferenceCode(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const buf = new Uint32Array(6);
  crypto.getRandomValues(buf);
  return Array.from(buf, (v) => alphabet[v % alphabet.length]).join("");
}
