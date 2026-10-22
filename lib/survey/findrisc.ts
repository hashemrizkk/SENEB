import { z } from "zod";

export const findriscAnswersSchema = z.object({
  age: z.number().int().min(18).max(120).nullable(),
  sex: z.enum(["male", "female"]).nullable(),
  height_cm: z.number().min(100).max(250).nullable(),
  weight_kg: z.number().min(25).max(300).nullable(),
  waist_cm: z.number().min(40).max(200).nullable(),
  activity: z.boolean().nullable(),
  fruit_veg: z.boolean().nullable(),
  antihypertensive: z.boolean().nullable(),
  high_glucose: z.boolean().nullable(),
  family_history: z.enum(["none", "second_degree", "first_degree"]).nullable(),
}).strict();

export type FindriscAnswers = z.infer<typeof findriscAnswersSchema>;
export type FindriscBand =
  | "low"
  | "slightly_elevated"
  | "moderate"
  | "high"
  | "very_high";

export const FINDRISC_BAND_CUTS = {
  low: 6,
  slightly_elevated: 11,
  moderate: 14,
  high: 20,
} as const;

export type FindriscItem =
  | "age"
  | "bmi"
  | "waist"
  | "activity"
  | "fruit_veg"
  | "antihypertensive"
  | "high_glucose"
  | "family_history";

export type FindriscItemTrace = {
  item: FindriscItem;
  answer: number | boolean | string | null;
  points: number;
};

export type FindriscResult = {
  total: number;
  band: FindriscBand;
  bmi: number | null;
  items: FindriscItemTrace[];
  unknownItems: FindriscItem[];
};

export function findriscBand(total: number): FindriscBand {
  if (!Number.isInteger(total) || total < 0 || total > 26) {
    throw new RangeError("FINDRISC total must be an integer from 0 to 26.");
  }
  if (total <= FINDRISC_BAND_CUTS.low) return "low";
  if (total <= FINDRISC_BAND_CUTS.slightly_elevated) return "slightly_elevated";
  if (total <= FINDRISC_BAND_CUTS.moderate) return "moderate";
  if (total <= FINDRISC_BAND_CUTS.high) return "high";
  return "very_high";
}

function pointsForAge(age: number | null): number {
  if (age === null) return 0;
  if (age < 45) return 0;
  if (age < 55) return 2;
  if (age < 65) return 3;
  return 4;
}

function pointsForBmi(bmi: number | null): number {
  if (bmi === null || bmi < 25) return 0;
  if (bmi < 30) return 1;
  return 3;
}

function pointsForWaist(waist: number | null, sex: "male" | "female" | null): number {
  if (waist === null || sex === null) return 0;
  const lowLimit = sex === "male" ? 94 : 80;
  const highLimit = sex === "male" ? 102 : 88;
  if (waist < lowLimit) return 0;
  if (waist <= highLimit) return 3;
  return 4;
}

function assertInput(answers: FindriscAnswers): void {
  if (!findriscAnswersSchema.safeParse(answers).success) {
    throw new RangeError("FINDRISC answers are outside their supported ranges.");
  }
}

export function scoreFindrisc(answers: FindriscAnswers): FindriscResult {
  assertInput(answers);
  const bmi =
    answers.height_cm !== null && answers.weight_kg !== null
      ? answers.weight_kg / ((answers.height_cm / 100) ** 2)
      : null;
  const waistPoints = pointsForWaist(answers.waist_cm, answers.sex);
  const items: FindriscItemTrace[] = [
    { item: "age", answer: answers.age, points: pointsForAge(answers.age) },
    {
      item: "bmi",
      answer: bmi === null ? null : Number(bmi.toFixed(2)),
      points: pointsForBmi(bmi),
    },
    {
      item: "waist",
      answer:
        answers.waist_cm === null || answers.sex === null
          ? null
          : `${answers.sex}:${answers.waist_cm}`,
      points: waistPoints,
    },
    {
      item: "activity",
      answer: answers.activity,
      points: answers.activity === false ? 2 : 0,
    },
    {
      item: "fruit_veg",
      answer: answers.fruit_veg,
      points: answers.fruit_veg === false ? 1 : 0,
    },
    {
      item: "antihypertensive",
      answer: answers.antihypertensive,
      points: answers.antihypertensive === true ? 2 : 0,
    },
    {
      item: "high_glucose",
      answer: answers.high_glucose,
      points: answers.high_glucose === true ? 5 : 0,
    },
    {
      item: "family_history",
      answer: answers.family_history,
      points:
        answers.family_history === "first_degree"
          ? 5
          : answers.family_history === "second_degree"
            ? 3
            : 0,
    },
  ];

  const unknownItems: FindriscItem[] = [];
  if (answers.age === null) unknownItems.push("age");
  if (bmi === null) unknownItems.push("bmi");
  if (answers.waist_cm === null || answers.sex === null) unknownItems.push("waist");
  if (answers.activity === null) unknownItems.push("activity");
  if (answers.fruit_veg === null) unknownItems.push("fruit_veg");
  if (answers.antihypertensive === null) unknownItems.push("antihypertensive");
  if (answers.high_glucose === null) unknownItems.push("high_glucose");
  if (answers.family_history === null) unknownItems.push("family_history");

  const total = items.reduce((sum, item) => sum + item.points, 0);
  return { total, band: findriscBand(total), bmi, items, unknownItems };
}
