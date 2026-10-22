import assert from "node:assert/strict";
import {
  canTryFallback,
  firstValidProvider,
  InvalidProviderOutputError,
  type ProviderAttempt,
} from "../lib/provider-fallback.ts";

let failures = 0;
let total = 0;

function report(name: string, run: () => void): void {
  total += 1;
  try {
    run();
    console.log(`PASS  ${name}`);
  } catch (error: unknown) {
    failures += 1;
    console.error(`FAIL  ${name}`, error);
  }
}

function providerError(statusCode: number, responseBody?: string): Error & {
  statusCode: number;
  responseBody?: string;
} {
  return Object.assign(new Error("provider error"), { statusCode, responseBody });
}

async function main(): Promise<void> {
  let groqCalls = 0;
  const primarySuccess: ProviderAttempt[] = [
    { provider: "Gemini", run: async () => ({ value: 1 }) },
    {
      provider: "Groq",
      run: async () => {
        groqCalls += 1;
        return { value: 2 };
      },
    },
  ];
  const success = await firstValidProvider(primarySuccess, (output) =>
    output !== null && typeof output === "object" && "value" in output
      ? output.value
      : null,
  );
  report("successful Gemini response avoids fallback", () => {
    assert.deepEqual(success, { provider: "Gemini", value: 1 });
    assert.equal(groqCalls, 0);
  });

  let fallbackCalls = 0;
  const rateLimited = await firstValidProvider(
    [
      { provider: "Gemini", run: async () => { throw providerError(429); } },
      {
        provider: "Groq",
        run: async () => {
          fallbackCalls += 1;
          return "valid";
        },
      },
    ],
    (output) => (output === "valid" ? output : null),
  );
  report("rate limits use the configured fallback", () => {
    assert.deepEqual(rateLimited, { provider: "Groq", value: "valid" });
    assert.equal(fallbackCalls, 1);
  });

  report("quota-related 403 is retryable but unrelated 403 is not", () => {
    assert.equal(
      canTryFallback(providerError(403, '{"message":"quota exceeded"}')),
      true,
    );
    assert.equal(
      canTryFallback(providerError(403, '{"message":"permission denied"}')),
      false,
    );
  });

  report("client errors do not trigger provider fallback", () => {
    assert.equal(canTryFallback(providerError(400)), false);
    assert.equal(canTryFallback(providerError(404)), false);
  });

  report("network and timeout failures are retryable", () => {
    assert.equal(canTryFallback(new TypeError("network failure")), true);
    assert.equal(canTryFallback(new DOMException("timed out", "TimeoutError")), true);
  });

  let malformedFallbackCalls = 0;
  const malformed = await firstValidProvider(
    [
      { provider: "Gemini", run: async () => ({ value: "invalid" }) },
      {
        provider: "Groq",
        run: async () => {
          malformedFallbackCalls += 1;
          return { value: 3 };
        },
      },
    ],
    (output) => {
      if (
        output !== null &&
        typeof output === "object" &&
        "value" in output &&
        typeof output.value === "number"
      ) {
        return output.value;
      }
      return null;
    },
  );
  report("invalid structured output uses the fallback", () => {
    assert.deepEqual(malformed, { provider: "Groq", value: 3 });
    assert.equal(malformedFallbackCalls, 1);
  });

  report("missing model output is retryable", () => {
    assert.equal(canTryFallback(new InvalidProviderOutputError()), true);
  });

  const exhausted = await firstValidProvider(
    [
      { provider: "Gemini", run: async () => { throw providerError(503); } },
      { provider: "Groq", run: async () => { throw new Error("network failure"); } },
    ],
    () => null,
  );
  report("all provider failures return no result", () => {
    assert.equal(exhausted, null);
  });

  const previousProviderEnvironment = {
    gemini: process.env.GEMINI_API_KEY,
    google: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
    groq: process.env.GROQ_API_KEY,
    groqModel: process.env.GROQ_MODEL,
  };
  try {
    delete process.env.GEMINI_API_KEY;
    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    process.env.GROQ_API_KEY = "synthetic-test-key";
    delete process.env.GROQ_MODEL;
    const { extractIntake } = await import("../lib/llm.ts");
    const extraction = await extractIntake("حصل هبوط مرتين");
    report("Groq key without a model uses labeled mock extraction", () => {
      assert.equal(extraction.meta.llm_mode, "mock");
      assert.equal(extraction.meta.needs_review, true);
      assert.equal(extraction.fields.hypoglycemia_episodes, 2);
    });
  } finally {
    for (const [key, value] of [
      ["GEMINI_API_KEY", previousProviderEnvironment.gemini],
      ["GOOGLE_GENERATIVE_AI_API_KEY", previousProviderEnvironment.google],
      ["GROQ_API_KEY", previousProviderEnvironment.groq],
      ["GROQ_MODEL", previousProviderEnvironment.groqModel],
    ] as const) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }

  console.log(`\n${total - failures}/${total} provider fallback tests passed.`);
  if (failures > 0) process.exitCode = 1;
}

await main();
