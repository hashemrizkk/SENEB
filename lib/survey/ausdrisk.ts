import { z } from "zod";

export const ausdriskAnswersSchema = z.object({
  age: z.number().int().min(18).max(120).nullable(),
  sex: z.enum(["male", "female"]).nullable(),
  family_history: z.boolean().nullable(),
  high_glucose: z.boolean().nullable(),
  antihypertensive: z.boolean().nullable(),
  daily_smoking: z.boolean().nullable(),
  daily_fruit_veg: z.boolean().nullable(),
  activity_150_minutes: z.boolean().nullable(),
  waist_cm: z.number().min(40).max(200).nullable(),
}).strict();

export type AusdriskAnswers = z.infer<typeof ausdriskAnswersSchema>;
export type AusdriskItem = keyof AusdriskAnswers;
export type AusdriskRiskBand = "mild" | "moderate" | "high";
export type AusdriskScreeningResult =
  | "below_cutoff"
  | "abnormal_glycemia_cutoff"
  | "diabetes_cutoff"
  | "incomplete";

export const AUSDRISK_MAX_SCORE = 34;
export const AUSDRISK_ABNORMAL_GLYCEMIA_CUTOFF = 9;
export const AUSDRISK_DIABETES_CUTOFF = 13;

export type AusdriskItemTrace = {
  item: AusdriskItem;
  answer: number | boolean | string | null;
  points: number;
};

export type AusdriskResult = {
  total: number;
  riskBand: AusdriskRiskBand;
  screeningResult: AusdriskScreeningResult;
  items: AusdriskItemTrace[];
  unknownItems: AusdriskItem[];
};

function pointsForAge(age: number | null): number {
  if (age === null || age < 35) return 0;
  if (age < 45) return 2;
  if (age < 55) return 4;
  if (age < 65) return 6;
  return 8;
}

function pointsForWaist(waist: number | null, sex: "male" | "female" | null): number {
  if (waist === null || sex === null) return 0;
  const low = sex === "male" ? 102 : 88;
  const high = sex === "male" ? 110 : 100;
  if (waist < low) return 0;
  if (waist <= high) return 4;
  return 7;
}

export function scoreAusdrisk(answers: AusdriskAnswers): AusdriskResult {
  if (!ausdriskAnswersSchema.safeParse(answers).success) {
    throw new RangeError("AUSDRISK answers are outside their supported ranges.");
  }

  const items: AusdriskItemTrace[] = [
    { item: "age", answer: answers.age, points: pointsForAge(answers.age) },
    { item: "sex", answer: answers.sex, points: answers.sex === "male" ? 3 : 0 },
    {
      item: "family_history",
      answer: answers.family_history,
      points: answers.family_history === true ? 3 : 0,
    },
    {
      item: "high_glucose",
      answer: answers.high_glucose,
      points: answers.high_glucose === true ? 6 : 0,
    },
    {
      item: "antihypertensive",
      answer: answers.antihypertensive,
      points: answers.antihypertensive === true ? 2 : 0,
    },
    {
      item: "daily_smoking",
      answer: answers.daily_smoking,
      points: answers.daily_smoking === true ? 2 : 0,
    },
    {
      item: "daily_fruit_veg",
      answer: answers.daily_fruit_veg,
      points: answers.daily_fruit_veg === false ? 1 : 0,
    },
    {
      item: "activity_150_minutes",
      answer: answers.activity_150_minutes,
      points: answers.activity_150_minutes === false ? 2 : 0,
    },
    {
      item: "waist_cm",
      answer:
        answers.waist_cm === null || answers.sex === null
          ? null
          : `${answers.sex}:${answers.waist_cm}`,
      points: pointsForWaist(answers.waist_cm, answers.sex),
    },
  ];

  const unknownItems = (Object.keys(answers) as AusdriskItem[]).filter(
    (item) => answers[item] === null ||
      (item === "waist_cm" && answers.sex === null),
  );
  const total = items.reduce((sum, item) => sum + item.points, 0);
  const riskBand: AusdriskRiskBand =
    total <= 4 ? "mild" : total <= 10 ? "moderate" : "high";
  const screeningResult: AusdriskScreeningResult =
    unknownItems.length > 0
      ? "incomplete"
      : total >= AUSDRISK_DIABETES_CUTOFF
        ? "diabetes_cutoff"
        : total >= AUSDRISK_ABNORMAL_GLYCEMIA_CUTOFF
          ? "abnormal_glycemia_cutoff"
          : "below_cutoff";

  return { total, riskBand, screeningResult, items, unknownItems };
}
