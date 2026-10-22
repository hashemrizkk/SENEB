import { ar } from "./strings.ar.ts";

export type QuestionAnswer = boolean | number | null;

export type QuestionOption = {
  value: boolean | number;
  label: string;
};

export type QuestionDefinition = {
  id: string;
  key: string;
  label: string;
  options: QuestionOption[];
  structuredField: string | null;
  flagRule: string | null;
};

export const flagRules = {
  hypoglycemia: "hypoglycemia",
  hypoglycemiaSymptoms: "hypoglycemia (symptoms described)",
  footProblem: "foot problem",
  visionChange: "vision change",
  missedDoses: "missed doses",
  possibleEmergency: "possible emergency, review first",
} as const;

export const registrationQuestions: QuestionDefinition[] = [
  {
    id: "registration_missed_doses",
    key: "missed_doses",
    label: "هل نسيت أخذ الدواء خلال الأسبوع الماضي؟",
    options: [
      { value: true, label: ar.yes },
      { value: false, label: ar.no },
    ],
    structuredField: "missed_doses",
    flagRule: flagRules.missedDoses,
  },
  {
    id: "registration_hypoglycemia_yes_no",
    key: "hypo_episodes",
    label: "هل تعرضت لهبوط في السكر خلال الأسبوع الماضي؟",
    options: [
      { value: true, label: ar.register.yes },
      { value: false, label: ar.register.no },
    ],
    structuredField: "hypoglycemia_episodes",
    flagRule: flagRules.hypoglycemia,
  },
  {
    id: "registration_foot_problem",
    key: "foot_problem",
    label: "هل توجد مشكلة في القدم أو التورم أو الألم؟",
    options: [
      { value: true, label: ar.yes },
      { value: false, label: ar.no },
    ],
    structuredField: "foot_problem",
    flagRule: flagRules.footProblem,
  },
  {
    id: "registration_vision_change",
    key: "vision_change",
    label: "هل حدث تغيير في الرؤية؟",
    options: [
      { value: true, label: ar.yes },
      { value: false, label: ar.no },
    ],
    structuredField: "vision_change",
    flagRule: flagRules.visionChange,
  },
];

export const followupQuestions: QuestionDefinition[] = [
  {
    id: "followup_missed_doses",
    key: "missed_doses",
    label: "هل نسيت تاخد الدوا الأسبوع ده؟",
    options: [
      { value: true, label: ar.yes },
      { value: false, label: ar.no },
    ],
    structuredField: "missed_doses",
    flagRule: flagRules.missedDoses,
  },
  {
    id: "followup_hypoglycemia_count",
    key: "hypoglycemia_episodes",
    label: "كام مرة حسيت بهبوط في السكر (دوخة، عرق، رعشة)؟",
    options: [
      { value: 0, label: ar.zero },
      { value: 1, label: ar.one },
      { value: 2, label: ar.two },
      { value: 3, label: ar.threeOrMore },
    ],
    structuredField: "hypoglycemia_episodes",
    flagRule: flagRules.hypoglycemia,
  },
  {
    id: "followup_foot_problem",
    key: "foot_problem",
    label: "في جرح أو ألم أو تنميل في رجلك؟",
    options: [
      { value: true, label: ar.yes },
      { value: false, label: ar.no },
    ],
    structuredField: "foot_problem",
    flagRule: flagRules.footProblem,
  },
  {
    id: "followup_vision_change",
    key: "vision_change",
    label: "حصل تغيير في نظرك؟",
    options: [
      { value: true, label: ar.yes },
      { value: false, label: ar.no },
    ],
    structuredField: "vision_change",
    flagRule: flagRules.visionChange,
  },
  {
    id: "followup_free_text",
    key: "raw_text",
    label: "عايز تقول حاجة تانية؟ (اختياري)",
    options: [],
    structuredField: "symptoms_text",
    flagRule: null,
  },
];

export const registrationTextQuestions = {
  selfDescription: {
    id: "registration_self_description",
    label: ar.register.selfDescription,
    field: "self_description",
  },
  notes: {
    id: "registration_notes",
    label: ar.register.notes,
    field: "notes",
  },
} as const;

export const intakeFieldLabels: Record<string, string> = {
  missed_doses: registrationQuestions[0].label,
  hypoglycemia_episodes: followupQuestions[1].label,
  hypoglycemia_symptoms: "أعراض هبوط السكر المذكورة",
  foot_problem: followupQuestions[2].label,
  vision_change: followupQuestions[3].label,
  emergency_symptoms_mentioned: "أعراض طارئة مذكورة",
  symptoms_text: followupQuestions[4].label,
};

export const flagLabels: Record<string, string> = {
  [flagRules.hypoglycemia]: "هبوط في السكر",
  [flagRules.hypoglycemiaSymptoms]: "أعراض هبوط محتملة مذكورة بالنص",
  [flagRules.footProblem]: "مشكلة في القدم",
  [flagRules.visionChange]: "تغيير في النظر",
  [flagRules.missedDoses]: "نسيان جرعات الدواء",
  [flagRules.possibleEmergency]: "احتمال حالة طارئة — يلزم مراجعة أولًا",
  survey_extreme_thirst: "استبيان: عطش شديد مُبلّغ عنه",
  survey_rapid_weight_loss: "استبيان: نقصان وزن سريع مُبلّغ عنه",
  survey_blurred_vision: "استبيان: تشوش نظر مُبلّغ عنه",
  survey_vomiting: "استبيان: قيء مُبلّغ عنه",
  survey_confusion: "استبيان: تشوش أو ارتباك مُبلّغ عنه",
};

export const unansweredLabels: Record<string, string> = {
  missed_doses: intakeFieldLabels.missed_doses,
  hypoglycemia_episodes: intakeFieldLabels.hypoglycemia_episodes,
  foot_problem: intakeFieldLabels.foot_problem,
  vision_change: intakeFieldLabels.vision_change,
};

export function questionLabel(field: string): string {
  return intakeFieldLabels[field] ?? field;
}

export function flagLabel(flag: string): string {
  return flagLabels[flag] ?? flag;
}
