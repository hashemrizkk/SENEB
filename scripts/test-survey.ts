import assert from "node:assert/strict";
import {
  findriscBand,
  scoreFindrisc,
  type FindriscAnswers,
} from "../lib/survey/findrisc.ts";
import {
  surveyRedFlags,
  type SurveySymptoms,
} from "../lib/survey/redflags.ts";
import {
  prepareSurveyConversion,
  surveyPriority,
} from "../lib/survey/convert.ts";
import {
  explainSurvey,
  isSafeSurveyExplanation,
} from "../lib/survey/explain.ts";
import { resolveSurveyPhrasing } from "../lib/survey/phrasing.ts";
import { ar } from "../lib/strings.ar.ts";
import { registrationSchema } from "../lib/registration.ts";

let assertions = 0;

function check(name: string, condition: boolean): void {
  assertions += 1;
  assert.equal(condition, true, name);
}

function base(overrides: Partial<FindriscAnswers> = {}): FindriscAnswers {
  return {
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
    ...overrides,
  };
}

function itemPoints(
  answers: FindriscAnswers,
  item: string,
): number {
  return scoreFindrisc(answers).items.find((entry) => entry.item === item)?.points ?? -1;
}

function symptomSet(key: keyof SurveySymptoms): SurveySymptoms {
  return {
    extreme_thirst: false,
    rapid_weight_loss: false,
    blurred_vision: false,
    vomiting: false,
    confusion: false,
    [key]: true,
  };
}

async function main(): Promise<void> {
  for (const [age, points] of [
    [44, 0], [45, 2], [54, 2], [55, 3], [64, 3], [65, 4],
  ] as const) {
    check(`age ${age} boundary`, itemPoints(base({ age }), "age") === points);
  }

  for (const [weight_kg, points] of [
    [71.961, 0], [72.25, 1], [86.411, 1], [86.7, 3],
  ] as const) {
    check(
      `BMI boundary ${weight_kg}`,
      itemPoints(base({ height_cm: 170, weight_kg }), "bmi") === points,
    );
  }

  for (const [sex, waist_cm, points] of [
    ["male", 93, 0], ["male", 94, 3], ["male", 102, 3], ["male", 103, 4],
    ["female", 79, 0], ["female", 80, 3], ["female", 88, 3], ["female", 89, 4],
  ] as const) {
    check(
      `${sex} waist ${waist_cm} boundary`,
      itemPoints(base({ sex, waist_cm }), "waist") === points,
    );
  }

  const yesNoCases: [string, Partial<FindriscAnswers>, number, number][] = [
    ["activity", { activity: true }, 0, 2],
    ["fruit_veg", { fruit_veg: true }, 0, 1],
    ["antihypertensive", { antihypertensive: false }, 0, 2],
    ["high_glucose", { high_glucose: false }, 0, 5],
    ["family_history", { family_history: "none" }, 0, 5],
  ];
  for (const [item, healthy, noPoints, yesPoints] of yesNoCases) {
    const noAnswer =
      item === "family_history"
        ? { family_history: "first_degree" as const }
        : item === "activity" || item === "fruit_veg"
          ? { [item]: false }
          : { [item]: true };
    check(`${item} lower answer`, itemPoints(base(healthy), item) === noPoints);
    check(`${item} higher answer`, itemPoints(base(noAnswer), item) === yesPoints);
  }
  check(
    "family history second-degree relative scores 3",
    itemPoints(base({ family_history: "second_degree" }), "family_history") === 3,
  );

  for (const [total, band] of [
    [6, "low"], [7, "slightly_elevated"], [11, "slightly_elevated"],
    [12, "moderate"], [14, "moderate"], [15, "high"], [20, "high"],
    [21, "very_high"], [26, "very_high"],
  ] as const) {
    check(`band boundary ${total}`, findriscBand(total) === band);
  }

  const trace = scoreFindrisc(base({
    age: 66,
    weight_kg: 90,
    waist_cm: 105,
    activity: false,
    fruit_veg: false,
    antihypertensive: true,
    high_glucose: true,
    family_history: "first_degree",
  }));
  check("all eight audit items are present", trace.items.length === 8);
  check(
    "item trace sums to total",
    trace.items.reduce((sum, item) => sum + item.points, 0) === trace.total,
  );
  check("score stays within 0-26", trace.total >= 0 && trace.total <= 26);

  const unknown = scoreFindrisc(base({
    activity: null,
    fruit_veg: null,
    antihypertensive: null,
    family_history: null,
  }));
  check("unknown items score zero", unknown.items
    .filter((entry) => unknown.unknownItems.includes(entry.item))
    .every((entry) => entry.points === 0));
  check("unknown items are reported", unknown.unknownItems.length === 4);

  const registrationBase = {
    full_name: "محمود تجريبي",
    phone: "01012345678",
    email: "",
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
    survey: {
      answers: base(),
      symptoms: {
        extreme_thirst: false,
        rapid_weight_loss: false,
        blurred_vision: false,
        vomiting: false,
        confusion: false,
      },
    },
  };
  check(
    "survey conversion requires email",
    !registrationSchema.safeParse(registrationBase).success,
  );
  check(
    "normal registration keeps existing optional email behavior",
    registrationSchema.safeParse({ ...registrationBase, survey: undefined }).success,
  );
  check(
    "survey registration accepts supplied email",
    registrationSchema.safeParse({
      ...registrationBase,
      email: "survey@example.com",
    }).success,
  );

  const symptomKeys: (keyof SurveySymptoms)[] = [
    "extreme_thirst",
    "rapid_weight_loss",
    "blurred_vision",
    "vomiting",
    "confusion",
  ];
  for (const key of symptomKeys) {
    check(`${key} triggers urgent red flag`, surveyRedFlags(symptomSet(key)).urgent);
  }
  check(
    "no positive symptom is not urgent",
    !surveyRedFlags({
      extreme_thirst: false,
      rapid_weight_loss: false,
      blurred_vision: false,
      vomiting: false,
      confusion: false,
    }).urgent,
  );
  check("red-flag urgency overrides low band", surveyPriority("low", true) === "urgent");
  check("very high band is important without symptoms", surveyPriority("very_high", false) === "important");
  check("low band defers to normal rules", surveyPriority("low", false) === null);
  const converted = prepareSurveyConversion({
    answers: base({ age: 55, family_history: "first_degree", waist_cm: 103 }),
    symptoms: {
      extreme_thirst: true,
      rapid_weight_loss: false,
      blurred_vision: false,
      vomiting: false,
      confusion: false,
    },
  });
  check("conversion recomputes the score from answers", converted.metadata.band === "moderate");
  check("conversion maps age for deterministic patient prefill", converted.metadata.answers.age === 55);
  check("conversion stores symptom keys as deterministic flags", converted.redFlagCodes.includes("survey_extreme_thirst"));
  check("symptom flag selects urgent before score priority", converted.priorityOverride === "urgent");
  check("conversion maps blur answer into structured intake field", converted.intakeAnswers.vision_change === false);
  check("conversion maps vomiting/confusion into emergency field", converted.intakeAnswers.emergency_symptoms_mentioned === false);

  const phrasePayload: {
    value: { questions: { key: string; options: readonly string[] }[] } | null;
  } = { value: null };
  const fallbackPhrasing = await resolveSurveyPhrasing(async (payload) => {
    phrasePayload.value = payload;
    throw new Error("mock provider unavailable");
  });
  check("phrasing failure uses static Arabic fallback", fallbackPhrasing.mode === "mock");
  check(
    "fallback has one phrasing per scored item",
    fallbackPhrasing.phrases.length === ar.survey.questions.length,
  );
  check(
    "LLM phrasing payload contains no scoring fields",
    phrasePayload.value?.questions.length === 8 &&
      phrasePayload.value.questions.every((question) => !("points" in question) && !("score" in question)),
  );

  const safe = "النتيجة تشير إلى مستوى منخفض في هذا الاستبيان. يظل إجراء تحليل دم خطوة مفيدة.";
  check("safe Arabic explanation is accepted", isSafeSurveyExplanation(safe));
  check(
    "diagnosis wording is rejected",
    !isSafeSurveyExplanation("عندك سكر ويجب أن تبدأ العلاج."),
  );
  check(
    "false reassurance wording is rejected",
    !isSafeSurveyExplanation("مفيش سكر عندك. كل شيء طبيعي."),
  );
  let explanationAttempts = 0;
  const retried = await explainSurvey(
    { band: "low", unknownItems: [], redFlagSymptoms: [] },
    async () => {
      explanationAttempts += 1;
      return explanationAttempts === 1
        ? "أنت مصاب بالسكري."
        : safe;
    },
  );
  check("banned-term output is retried once", explanationAttempts === 2);
  check("safe retry is displayed", retried.text === safe && retried.mode === "mock");
  const fallbackExplanation = await explainSurvey(
    { band: "low", unknownItems: [], redFlagSymptoms: [] },
    async () => "عندك سكر.",
  );
  check("unsafe retry uses safe template fallback", fallbackExplanation.mode === "fallback");
  check("fallback explanation has no diagnosis wording", isSafeSurveyExplanation(fallbackExplanation.text));

  console.log(`PASS survey scoring, red flags, conversion priority, and language safeguards (${assertions} assertions)`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
