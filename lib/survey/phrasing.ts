import { ar } from "../strings.ar.ts";

export type SurveyPhrase = {
  key: string;
  question: string;
  options: string[];
};

export type SurveyPhrasing = {
  phrases: SurveyPhrase[];
  mode: "llm" | "mock";
};

type PhraseGenerator = (
  payload: { questions: { key: string; question: string; options: readonly string[] }[] },
) => Promise<{ output: { phrases: SurveyPhrase[] }; model: string }>;

async function generateWithLlm(
  payload: Parameters<PhraseGenerator>[0],
): ReturnType<PhraseGenerator> {
  const { generateSurveyPhrasing } = await import("../llm.ts");
  return generateSurveyPhrasing(payload);
}

const fallbackPhrases: SurveyPhrase[] = ar.survey.questions.map((question) => ({
  key: question.item,
  question: question.question,
  options: [...question.options],
}));

export async function resolveSurveyPhrasing(
  generate: PhraseGenerator = generateWithLlm,
): Promise<SurveyPhrasing> {
  const payload = {
    questions: fallbackPhrases.map(({ key, question, options }) => ({
      key,
      question,
      options,
    })),
  };
  try {
    const result = await generate(payload);
    const generated = result.output.phrases;
    const matches = generated.every((phrase, index) => {
      const fallback = fallbackPhrases[index];
      return (
        fallback !== undefined &&
        phrase.key === fallback.key &&
        phrase.options.length === fallback.options.length
      );
    });
    if (generated.length !== fallbackPhrases.length || !matches) {
      throw new Error("Survey question phrasing changed keys or option counts.");
    }
    return { phrases: generated, mode: "llm" };
  } catch {
    return { phrases: fallbackPhrases, mode: "mock" };
  }
}
