import { ar } from "../strings.ar.ts";
import { z } from "zod";
import type { FindriscBand, FindriscItem } from "./findrisc.ts";
import type { SurveyRedFlagSymptom } from "./redflags.ts";

export type SurveyExplanationInput = {
  band: FindriscBand;
  unknownItems: FindriscItem[];
  redFlagSymptoms: SurveyRedFlagSymptom[];
};

export const surveyExplanationRequestSchema = z.object({
  band: z.enum(["low", "slightly_elevated", "moderate", "high", "very_high"]),
  unknownItems: z.array(z.enum([
    "age",
    "bmi",
    "waist",
    "activity",
    "fruit_veg",
    "antihypertensive",
    "high_glucose",
    "family_history",
  ])),
  redFlagSymptoms: z.array(z.enum([
    "extreme_thirst",
    "rapid_weight_loss",
    "blurred_vision",
    "vomiting",
    "confusion",
  ])),
}).strict();

type ExplanationGenerator = (
  payload: {
    band: FindriscBand;
    unknownItems: FindriscItem[];
    redFlagSymptoms: SurveyRedFlagSymptom[];
    staticUrgentInstruction: string;
  },
) => Promise<{ output: { explanation: string }; model: string } | string>;

async function generateWithLlm(
  payload: Parameters<ExplanationGenerator>[0],
): ReturnType<ExplanationGenerator> {
  const { generateSurveyExplanation } = await import("../llm.ts");
  return generateSurveyExplanation(payload);
}

const bannedDiagnosisTerms = [
  /عندك\s+سكر/u,
  /(?:ما\s+عندكش|مش\s+عندك|مفيش|لا\s+يوجد\s+لديك|لا\s+تعاني\s+من).{0,24}(?:سكر|سكري|السكر|مرض)/u,
  /مصاب(?:ة)?/u,
  /مريض(?:ة)?\s+بالسكري/u,
  /تشخيص(?:ك|كِ)?\s+(?:هو|بـ)?/u,
  /(?:أنت|انت)(?:\s+)?(?:سليم|سليمة|بخير)/u,
  /(?:مفيش|لا\s+توجد?)\s+مشكلة/u,
];

export function isSafeSurveyExplanation(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 20 || trimmed.length > 900) return false;
  if (bannedDiagnosisTerms.some((term) => term.test(trimmed))) return false;
  const sentences = trimmed.split(/[.!؟]+/u).filter((sentence) => sentence.trim());
  return sentences.length >= 2 && sentences.length <= 3;
}

function explanationPayload(input: SurveyExplanationInput) {
  return {
    band: input.band,
    unknownItems: input.unknownItems,
    redFlagSymptoms: input.redFlagSymptoms,
    staticUrgentInstruction: ar.survey.urgentText,
  };
}

export async function explainSurvey(
  input: SurveyExplanationInput,
  generate: ExplanationGenerator = generateWithLlm,
): Promise<{ text: string; mode: "llm" | "mock" | "fallback" }> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const result = await generate(explanationPayload(input));
      const text = typeof result === "string" ? result : result.output.explanation;
      if (isSafeSurveyExplanation(text)) {
        return {
          text: text.trim(),
          mode: typeof result === "string" ? "mock" : "llm",
        };
      }
    } catch {
      break;
    }
  }
  return { text: ar.survey.explanationFallback, mode: "fallback" };
}
