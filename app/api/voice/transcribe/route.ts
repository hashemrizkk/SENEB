import { NextResponse } from "next/server";
import {
  hasSameOrigin,
  isRateLimited,
} from "@/lib/requestGuards";
import {
  buildTranscriptionPrompt,
  isVoiceLanguage,
  isSupportedAudioType,
  mockVoiceTranscript,
  parseVoiceChunkMetadata,
  readGeminiTranscript,
  VoiceAudioValidationError,
  withValidatedGeminiWav,
} from "@/lib/gemini-audio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_AUDIO_BYTES = 4 * 1024 * 1024;
const MAX_REQUEST_BYTES = MAX_AUDIO_BYTES + 32 * 1024;
const GEMINI_MODEL = process.env.STT_GEMINI_MODEL || "gemini-3.8-flash";
const DEFAULT_MAX_OUTPUT_TOKENS = 1024;

function geminiGenerationConfig(): Record<string, unknown> {
  const configuredMaxTokens = Number(process.env.STT_GEMINI_MAX_OUTPUT_TOKENS);
  const maxOutputTokens = Number.isInteger(configuredMaxTokens) && configuredMaxTokens > 0
    ? configuredMaxTokens
    : DEFAULT_MAX_OUTPUT_TOKENS;
  const rawBudget = process.env.STT_GEMINI_THINKING_BUDGET;
  if (rawBudget !== undefined && /^-?\d+$/.test(rawBudget)) {
    return {
      maxOutputTokens,
      thinkingConfig: { thinkingBudget: Number(rawBudget) },
    };
  }
  const rawLevel = process.env.STT_GEMINI_THINKING_LEVEL;
  const thinkingLevel = ["minimal", "low", "medium", "high"].includes(rawLevel ?? "")
    ? rawLevel
    : "low";
  return { maxOutputTokens, thinkingConfig: { thinkingLevel } };
}

const GEMINI_GENERATION_CONFIG = geminiGenerationConfig();
let hasHandledVoiceRequest = false;

function errorResponse(error: string, status: number): Response {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function POST(request: Request): Promise<Response> {
  const coldStart = !hasHandledVoiceRequest;
  hasHandledVoiceRequest = true;
  console.info("Voice Gemini call context", {
    model: GEMINI_MODEL,
    generationConfig: GEMINI_GENERATION_CONFIG,
    retryOrFallback: false,
    region: process.env.VERCEL_REGION ?? "local/unknown",
    coldStart,
  });
  if (!hasSameOrigin(request)) return errorResponse("bad-origin", 403);
  if (isRateLimited(request, "voice-transcription")) {
    return errorResponse("rate-limited", 429);
  }

  const contentLengthHeader = request.headers.get("content-length");
  if (contentLengthHeader !== null) {
    if (!/^\d+$/.test(contentLengthHeader)) return errorResponse("bad-audio", 400);
    if (Number(contentLengthHeader) > MAX_REQUEST_BYTES) {
      return errorResponse("audio-too-large", 413);
    }
  }

  const apiKey =
    process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return errorResponse("bad-audio", 400);
  }

  let audio = form.get("audio");
  const language = form.get("language");
  const modeField = form.get("mode");
  const sequenceField = form.get("sequence");
  const totalField = form.get("total");
  if (
    (modeField !== null && typeof modeField !== "string") ||
    (sequenceField !== null && typeof sequenceField !== "string") ||
    (totalField !== null && typeof totalField !== "string")
  ) {
    return errorResponse("bad-audio", 400);
  }
  const mode = modeField === "dictation" ? "dictation" : "transcription";
  if (modeField !== null && modeField !== "dictation" && modeField !== "transcription") {
    return errorResponse("bad-audio", 400);
  }
  let chunkMetadata: { sequence: number | null; total: number | null };
  try {
    chunkMetadata = parseVoiceChunkMetadata(
      sequenceField,
      totalField,
    );
  } catch (error: unknown) {
    if (error instanceof VoiceAudioValidationError) {
      return errorResponse(error.code, 400);
    }
    throw error;
  }
  if (
    !(audio instanceof File) ||
    audio.size === 0 ||
    audio.size > MAX_AUDIO_BYTES ||
    !isSupportedAudioType(audio.type) ||
    typeof language !== "string" ||
    !isVoiceLanguage(language)
  ) {
    return errorResponse(
      audio instanceof File && audio.size > MAX_AUDIO_BYTES
        ? "audio-too-large"
        : "bad-audio",
      audio instanceof File && audio.size > MAX_AUDIO_BYTES ? 413 : 400,
    );
  }

  const validatedAudio = audio;
  try {
    return await withValidatedGeminiWav(
      validatedAudio,
      validatedAudio.type,
      MAX_AUDIO_BYTES,
      async () => {
        if (!apiKey) {
          return NextResponse.json({
            ok: true,
            transcript: mockVoiceTranscript(),
            mock: true,
            ...(chunkMetadata.sequence === null ? {} : { sequence: chunkMetadata.sequence }),
            ...(chunkMetadata.total === null ? {} : { total: chunkMetadata.total }),
          });
        }
        let audioBase64: string | null = Buffer.from(await validatedAudio.arrayBuffer()).toString("base64");
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 45_000);
        const providerStartedAt = performance.now();

        try {
          const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
            {
              method: "POST",
              headers: {
                "content-type": "application/json",
                "x-goog-api-key": apiKey,
              },
              body: JSON.stringify({
                contents: [
                  {
                    parts: [
                      {
                        text: buildTranscriptionPrompt(language, mode),
                      },
                      {
                        inline_data: {
                          mime_type: validatedAudio.type.split(";")[0].trim().toLowerCase(),
                          data: audioBase64,
                        },
                      },
                    ],
                  },
                ],
                generationConfig: GEMINI_GENERATION_CONFIG,
              }),
              signal: controller.signal,
            },
          );

          if (!response.ok) {
            console.error(`Gemini voice transcription failed (HTTP ${response.status}).`);
            if (response.status === 400) return errorResponse("unsupported-audio", 422);
            if (response.status === 401 || response.status === 403) {
              return errorResponse("gemini-auth-failed", 502);
            }
            if (response.status === 404) {
              return errorResponse("gemini-model-unavailable", 502);
            }
            if (response.status === 429) return errorResponse("rate-limited", 429);
            return errorResponse(
              response.status >= 500 ? "provider-unavailable" : "transcription-failed",
              502,
            );
          }

          let result: unknown;
          try {
            result = await response.json();
          } catch {
            console.error("Gemini voice transcription returned invalid JSON.");
            return errorResponse("transcription-failed", 502);
          }
          const providerMs = Math.round(performance.now() - providerStartedAt);
          console.info("Voice server-to-Gemini round trip ms", providerMs);
          if (result && typeof result === "object" && "usageMetadata" in result) {
            console.info("Voice Gemini usageMetadata", result.usageMetadata);
            const metadata = result.usageMetadata;
            if (metadata && typeof metadata === "object" && "thoughtsTokenCount" in metadata) {
              console.info("Voice Gemini thoughtsTokenCount", metadata.thoughtsTokenCount);
            }
          }
          const transcript = readGeminiTranscript(result);
          if (!transcript) return errorResponse("empty-transcript", 422);
          return NextResponse.json({
            ok: true,
            transcript,
            ...(chunkMetadata.sequence === null ? {} : { sequence: chunkMetadata.sequence }),
            ...(chunkMetadata.total === null ? {} : { total: chunkMetadata.total }),
            ...(process.env.NODE_ENV === "development"
              ? { timings: { providerMs } }
              : {}),
          });
        } catch (error: unknown) {
          const errorType =
            error instanceof Error ? error.constructor.name : "UnknownError";
          console.error(`Gemini voice transcription request failed (${errorType}).`);
          return errorResponse(
            controller.signal.aborted ? "transcription-timeout" : "transcription-failed",
            controller.signal.aborted ? 504 : 502,
          );
        } finally {
          audioBase64 = null;
          clearTimeout(timeout);
        }
      },
    );
  } catch (error: unknown) {
    if (error instanceof VoiceAudioValidationError) {
      return errorResponse(
        error.code,
        error.code === "audio-too-large" ? 413 : 422,
      );
    }
    const errorType = error instanceof Error ? error.constructor.name : "UnknownError";
    console.error(`Gemini voice transcription request failed (${errorType}).`);
    return errorResponse("transcription-failed", 502);
  } finally {
    form.delete("audio");
    audio = null;
  }
}
