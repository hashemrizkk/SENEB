export type LlmProviderName = "Gemini" | "Groq";

export type ProviderAttempt = {
  provider: LlmProviderName;
  run: () => Promise<unknown>;
};

export class InvalidProviderOutputError extends Error {
  constructor() {
    super("The model returned no structured output.");
    this.name = "InvalidProviderOutputError";
  }
}

function providerStatus(error: unknown): number | null {
  if (error === null || typeof error !== "object") return null;
  if ("statusCode" in error && typeof error.statusCode === "number") {
    return error.statusCode;
  }
  if ("status" in error && typeof error.status === "number") {
    return error.status;
  }
  return null;
}

function quotaForbidden(error: unknown): boolean {
  if (error === null || typeof error !== "object" || !("responseBody" in error)) {
    return false;
  }
  const body =
    typeof error.responseBody === "string" ? error.responseBody : "";
  return /quota|resource[_ ]exhausted|rate.?limit/i.test(body);
}

export function canTryFallback(error: unknown): boolean {
  if (error instanceof InvalidProviderOutputError) return true;
  const status = providerStatus(error);
  if (status === null) return true;
  return (
    status === 408 ||
    status === 429 ||
    status === 401 ||
    status >= 500 ||
    (status === 403 && quotaForbidden(error))
  );
}

export async function firstValidProvider<T>(
  attempts: readonly ProviderAttempt[],
  validate: (output: unknown) => T | null,
): Promise<{ provider: LlmProviderName; value: T } | null> {
  for (const attempt of attempts) {
    try {
      const output = await attempt.run();
      const value = validate(output);
      if (value !== null) {
        console.info(`LLM request succeeded via ${attempt.provider}.`);
        return { provider: attempt.provider, value };
      }
      console.warn(
        `LLM response from ${attempt.provider} had invalid structured output; trying fallback.`,
      );
    } catch (error: unknown) {
      if (!canTryFallback(error)) throw error;
      const errorType =
        error instanceof Error ? error.constructor.name : "UnknownError";
      console.warn(
        `LLM request to ${attempt.provider} failed (${errorType}); trying fallback.`,
      );
    }
  }
  return null;
}
