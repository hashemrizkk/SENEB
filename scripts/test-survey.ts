import assert from "node:assert/strict";
import {
  AUSDRISK_ABNORMAL_GLYCEMIA_CUTOFF,
  AUSDRISK_DIABETES_CUTOFF,
  AUSDRISK_MAX_SCORE,
  ausdriskAnswersSchema,
  scoreAusdrisk,
  type AusdriskAnswers,
} from "../lib/survey/ausdrisk.ts";
import { prepareSurveyConversion, surveySubmissionSchema } from "../lib/survey/convert.ts";
import { intakeMetaSchema } from "../lib/intake.ts";
import { registrationSchema } from "../lib/registration.ts";

let assertions = 0;

function check(name: string, condition: boolean): void {
  assertions += 1;
  assert.equal(condition, true, name);
}

function base(overrides: Partial<AusdriskAnswers> = {}): AusdriskAnswers {
  return {
    age: 18,
    sex: "female",
    family_history: false,
    high_glucose: false,
    antihypertensive: false,
    daily_smoking: false,
    daily_fruit_veg: true,
    activity_150_minutes: true,
    waist_cm: 70,
    ...overrides,
  };
}

function itemPoints(answers: AusdriskAnswers, item: string): number {
  return scoreAusdrisk(answers).items.find((entry) => entry.item === item)?.points ?? -1;
}

async function main(): Promise<void> {
  for (const [age, points] of [
    [34, 0], [35, 2], [44, 2], [45, 4], [54, 4],
    [55, 6], [64, 6], [65, 8],
  ] as const) {
    check(`AUSDRISK age ${age} boundary`, itemPoints(base({ age }), "age") === points);
  }

  check("male gender scores 3", itemPoints(base({ sex: "male" }), "sex") === 3);
  check("female gender scores 0", itemPoints(base({ sex: "female" }), "sex") === 0);

  for (const [sex, waist_cm, points] of [
    ["male", 101, 0], ["male", 102, 4], ["male", 110, 4], ["male", 111, 7],
    ["female", 87, 0], ["female", 88, 4], ["female", 100, 4], ["female", 101, 7],
  ] as const) {
    check(
      `${sex} waist ${waist_cm} boundary`,
      itemPoints(base({ sex, waist_cm }), "waist_cm") === points,
    );
  }

  const factors: [keyof AusdriskAnswers, boolean, number][] = [
    ["family_history", true, 3],
    ["high_glucose", true, 6],
    ["antihypertensive", true, 2],
    ["daily_smoking", true, 2],
    ["daily_fruit_veg", false, 1],
    ["activity_150_minutes", false, 2],
  ];
  for (const [item, positive, points] of factors) {
    check(`${item} positive score`, itemPoints(base({ [item]: positive }), item) === points);
    check(`${item} negative score`, itemPoints(base({ [item]: !positive }), item) === 0);
  }

  const below = scoreAusdrisk(base());
  check("complete score below 9 is below cutoff", below.screeningResult === "below_cutoff");
  check("low score band is mild", below.riskBand === "mild");

  const atNine = scoreAusdrisk(base({ age: 55, sex: "male" }));
  check("score 9 meets the abnormal-glycemia cutoff", atNine.total === AUSDRISK_ABNORMAL_GLYCEMIA_CUTOFF);
  check(atNine.screeningResult, atNine.screeningResult === "abnormal_glycemia_cutoff");

  const atThirteen = scoreAusdrisk(base({
    age: 45,
    sex: "male",
    high_glucose: true,
  }));
  check("score 13 meets the diabetes-screening cutoff", atThirteen.total === AUSDRISK_DIABETES_CUTOFF);
  check(atThirteen.screeningResult, atThirteen.screeningResult === "diabetes_cutoff");

  const unknown = scoreAusdrisk(base({ high_glucose: null }));
  check("unanswered remains null", unknown.items.find((item) => item.item === "high_glucose")?.answer === null);
  check("unanswered screen is marked incomplete, not low risk", unknown.screeningResult === "incomplete");
  check("unknown response remains in unknown item list", unknown.unknownItems.includes("high_glucose"));

  const maximum = scoreAusdrisk(base({
    age: 65,
    sex: "male",
    family_history: true,
    high_glucose: true,
    antihypertensive: true,
    daily_smoking: true,
    daily_fruit_veg: false,
    activity_150_minutes: false,
    waist_cm: 111,
  }));
  check("maximum valid score is 34", maximum.total === AUSDRISK_MAX_SCORE);
  check("item scores sum to total", maximum.items.reduce((sum, item) => sum + item.points, 0) === maximum.total);

  check("AUSDRISK answer schema rejects out-of-range age", !ausdriskAnswersSchema.safeParse(base({ age: 17 })).success);
  check("survey schema rejects added clinical/urgent fields", !surveySubmissionSchema.safeParse({
    answers: base(),
    symptoms: { confusion: true },
  }).success);

  const conversion = prepareSurveyConversion({ answers: base({ age: 55 }) });
  check("conversion recomputes AUSDRISK on the server", conversion.metadata.total === 6);
  check("conversion stores tool version and answers", conversion.metadata.tool === "ausdrisk_ar_v1" &&
    conversion.metadata.answers.age === 55);
  check("conversion has no ER flags or priority override", !("priorityOverride" in conversion) &&
    !("redFlagCodes" in conversion));
  const metadata = intakeMetaSchema.safeParse({
    llm_mode: "mock",
    model: null,
    needs_review: true,
    contradiction: false,
    survey: conversion.metadata,
  });
  check("new AUSDRISK metadata validates for doctor review", metadata.success);

  const legacyMetadata = intakeMetaSchema.safeParse({
    llm_mode: "mock",
    model: null,
    needs_review: true,
    contradiction: false,
    survey: {
      total: 0,
      band: "low",
      bmi: 24.22,
      items: [
        { item: "age", answer: 44, points: 0 },
        { item: "bmi", answer: 24.22, points: 0 },
        { item: "waist", answer: "male:90", points: 0 },
        { item: "activity", answer: true, points: 0 },
        { item: "fruit_veg", answer: true, points: 0 },
        { item: "antihypertensive", answer: false, points: 0 },
        { item: "high_glucose", answer: false, points: 0 },
        { item: "family_history", answer: "none", points: 0 },
      ],
      unknownItems: [],
      answers: {
        age: 44,
        sex: "male",
        height_cm: 170,
        weight_kg: 70,
        waist_cm: 90,
        activity: true,
        fruit_veg: true,
        antihypertensive: false,
        high_glucose: false,
        family_history: "none",
      },
      symptoms: {
        extreme_thirst: false,
        rapid_weight_loss: false,
        blurred_vision: false,
        vomiting: false,
        confusion: false,
      },
      redFlagSymptoms: [],
    },
  });
  check("saved FINDRISC survey metadata remains readable", legacyMetadata.success);

  const registrationBase = {
    full_name: "محمود تجريبي",
    phone: "01012345678",
    email: "survey@example.com",
    self_description: "",
    answers: {
      missed_doses: null,
      hypo_episodes: null,
      foot_problem: null,
      vision_change: null,
    },
    notes: "",
    input_method: "typed",
    consent: true,
    website: "",
    request_id: crypto.randomUUID(),
  };
  check("survey registration accepts AUSDRISK answers", registrationSchema.safeParse({
    ...registrationBase,
    survey: { answers: base() },
  }).success);
  check("survey registration rejects legacy symptom triage input", !registrationSchema.safeParse({
    ...registrationBase,
    survey: {
      answers: base(),
      symptoms: {
        extreme_thirst: true,
        rapid_weight_loss: false,
        blurred_vision: false,
        vomiting: false,
        confusion: false,
      },
    },
  }).success);

  console.log(`PASS AUSDRISK scoring, cutoffs, incomplete answers, and conversion (${assertions} assertions)`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
