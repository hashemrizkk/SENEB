import type { SurveyAnswers, RiskTier, WaistAnswer, Sex } from "./types";

/**
 * FINDRISC (Finnish Diabetes Risk Score) — validated, 8 questions, plain code.
 * Reference point bands:
 *   age <45=0, 45-54=2, 55-64=3, 65+=4
 *   BMI <25=0, 25-30=1, >30=3
 *   waist M <94=0 / 94-102=3 / >102=4 ; F <80=0 / 80-88=3 / >88=4
 *   activity >=30min daily: yes=0 no=2
 *   fruit/veg daily: yes=0 no=1
 *   BP medication ever: no=0 yes=2
 *   high glucose ever: no=0 yes=5
 *   family history: none=0 second-degree=3 first-degree=5
 */

export function computeBmi(heightCm: number | null, weightKg: number | null): number | null {
  if (!heightCm || !weightKg || heightCm < 100 || heightCm > 230 || weightKg < 25 || weightKg > 350) {
    return null;
  }
  const m = heightCm / 100;
  return Math.round((weightKg / (m * m)) * 10) / 10;
}

function bmiPoints(bmi: number | null): number {
  if (bmi === null) return 0;
  if (bmi < 25) return 0;
  if (bmi <= 30) return 1;
  return 3;
}

function waistPoints(waist: WaistAnswer | null, sex: Sex | null): number {
  if (!waist) return 0;
  if (waist.kind === "shape") {
    // Fallback body-shape picker maps onto the same bands
    return waist.value === "slim" ? 0 : waist.value === "some_belly" ? 3 : 4;
  }
  const v = waist.value;
  if (sex === "female") {
    return v < 80 ? 0 : v <= 88 ? 3 : 4;
  }
  return v < 94 ? 0 : v <= 102 ? 3 : 4;
}

export function scoreSurvey(a: SurveyAnswers): { score: number; tier: RiskTier } {
  let score = 0;

  if (a.ageBand === "45_54") score += 2;
  else if (a.ageBand === "55_64") score += 3;
  else if (a.ageBand === "gte65") score += 4;

  score += bmiPoints(computeBmi(a.heightCm, a.weightKg));
  score += waistPoints(a.waist, a.sex);

  if (a.activity30 === false) score += 2;
  if (a.fruitVegDaily === false) score += 1;
  if (a.bpMedsEver === true) score += 2;
  if (a.highGlucoseEver === true) score += 5;
  if (a.familyHistory === "second") score += 3;
  else if (a.familyHistory === "first") score += 5;

  // Three plain-language tiers mapped from FINDRISC bands
  const tier: RiskTier = score < 7 ? "low" : score < 15 ? "moderate" : "high";
  return { score, tier };
}

export function hasEmergency(a: SurveyAnswers): boolean {
  return a.severeSymptoms.length > 0;
}
