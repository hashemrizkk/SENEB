export type Lang = "ar" | "en";

/* ---------- Survey ---------- */

export type AgeBand = "lt45" | "45_54" | "55_64" | "gte65";
export type Sex = "male" | "female";
export type BodyShape = "slim" | "some_belly" | "large";
export type WaistAnswer =
  | { kind: "cm"; value: number }
  | { kind: "shape"; value: BodyShape };
export type FamilyHistory = "none" | "second" | "first";

export type SymptomId =
  | "frequent_urination"
  | "excessive_thirst"
  | "unusual_fatigue"
  | "blurred_vision"
  | "slow_wounds"
  | "tingling_feet"
  | "weight_loss";

export type SevereSymptomId =
  | "confusion"
  | "persistent_vomiting"
  | "fruity_breath"
  | "severe_abdominal_pain";

export interface SurveyAnswers {
  ageBand: AgeBand | null;
  sex: Sex | null;
  heightCm: number | null;
  weightKg: number | null;
  waist: WaistAnswer | null;
  activity30: boolean | null;
  fruitVegDaily: boolean | null;
  bpMedsEver: boolean | null;
  highGlucoseEver: boolean | null;
  familyHistory: FamilyHistory | null;
  symptoms: SymptomId[];
  severeSymptoms: SevereSymptomId[];
}

export const emptySurvey: SurveyAnswers = {
  ageBand: null,
  sex: null,
  heightCm: null,
  weightKg: null,
  waist: null,
  activity30: null,
  fruitVegDaily: null,
  bpMedsEver: null,
  highGlucoseEver: null,
  familyHistory: null,
  symptoms: [],
  severeSymptoms: [],
};

export type RiskTier = "low" | "moderate" | "high";

/* ---------- Intake form ---------- */

export type FollowUpChannel = "whatsapp" | "sms" | "call";
export type BestTime = "morning" | "afternoon" | "evening";
export type DiabetesStatus = "never_tested" | "prediabetic" | "type2" | "type1";
export type LabTestType = "none" | "hba1c" | "fasting_glucose";
export type ExamRecency = "within_year" | "over_year" | "never" | "unknown";
export type YesNoUnknown = "yes" | "no" | "unknown";
export type SmokingStatus = "never" | "former" | "current";
export type DietQuality = "good" | "average" | "poor";
export type RamadanPlan = "yes" | "no" | "not_sure";
export type CareBarrier = "none" | "cost" | "distance" | "time" | "fear";

export interface Medication {
  id: string;
  name: string;
  dose: string;
  regular: boolean | null;
}

export interface IntakeAnswers {
  // 1. Identity & contact
  fullName: string;
  age: string;
  sex: Sex | null;
  governorate: string;
  phone: string;
  channel: FollowUpChannel | null;
  bestTime: BestTime | null;
  // 2. Diabetes status
  diabetesStatus: DiabetesStatus | null;
  diagnosisYear: string;
  // 3. Latest numbers
  labTestType: LabTestType | null;
  labValue: string;
  labDate: string;
  hasHomeReadings: boolean | null;
  homeReadingValue: string;
  // 4. Medications
  takesMeds: boolean | null;
  medications: Medication[];
  // 5. Symptoms & red flags (pre-filled from survey)
  symptoms: (SymptomId | "chest_pain" | "shortness_of_breath" | "fainting")[];
  // 6. Complication screening
  eyeExam: ExamRecency | null;
  footProblem: boolean | null;
  kidneyTest: ExamRecency | null;
  hospitalVisits: "0" | "1" | "2plus" | null;
  // 7. Lifestyle
  smoking: SmokingStatus | null;
  activity30: boolean | null;
  diet: DietQuality | null;
  ramadan: RamadanPlan | null;
  // 8. Care access
  unitNearby: YesNoUnknown | null;
  barrier: CareBarrier | null;
  // 9. Free text + consent
  anythingElse: string;
  consent: boolean;
}

export function emptyIntake(survey?: SurveyAnswers): IntakeAnswers {
  return {
    fullName: "",
    age: "",
    sex: survey?.sex ?? null,
    governorate: "",
    phone: "",
    channel: null,
    bestTime: null,
    diabetesStatus: null,
    diagnosisYear: "",
    labTestType: null,
    labValue: "",
    labDate: "",
    hasHomeReadings: null,
    homeReadingValue: "",
    takesMeds: null,
    medications: [],
    symptoms: survey ? [...survey.symptoms] : [],
    eyeExam: null,
    footProblem: null,
    kidneyTest: null,
    hospitalVisits: null,
    smoking: null,
    activity30: survey?.activity30 ?? null,
    diet: null,
    ramadan: null,
    unitNearby: null,
    barrier: null,
    anythingElse: "",
    consent: false,
  };
}
