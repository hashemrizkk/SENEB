import { NextResponse } from "next/server";
import {
  hasSameOrigin,
  isRateLimited,
} from "@/lib/requestGuards";
import {
  classifySttFailure,
  getSttTimeoutMs,
  isVoiceLanguage,
  isSupportedAudioType,
  mockVoiceTranscript,
  parseVoiceChunkMetadata,
  transcribeWithSttProviders,
  VoiceAudioValidationError,
  withValidatedGeminiWav,
} from "@/lib/gemini-audio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 260;

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

function errorResponse(
  error: string,
  status: number,
  retryable = false,
  providerStatus?: number,
): Response {
  return NextResponse.json({
    ok: false,
    error,
    retryable,
    ...(providerStatus === undefined ? {} : { providerStatus }),
  }, { status });
}

export async function POST(request: Request): Promise<Response> {
  const coldStart = !hasHandledVoiceRequest;
  hasHandledVoiceRequest = true;
  const timeoutMs = getSttTimeoutMs();
  console.info("Voice transcription call context", {
    model: GEMINI_MODEL,
    generationConfig: GEMINI_GENERATION_CONFIG,
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY),
    groqConfigured: Boolean(process.env.GROQ_API_KEY),
    timeoutMs,
    retryOrFallback: true,
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

  const geminiApiKey =
    process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  const groqApiKey = process.env.GROQ_API_KEY;

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
        if (!geminiApiKey && !groqApiKey) {
          return NextResponse.json({
            ok: true,
            transcript: mockVoiceTranscript(),
            mock: true,
            ...(chunkMetadata.sequence === null ? {} : { sequence: chunkMetadata.sequence }),
            ...(chunkMetadata.total === null ? {} : { total: chunkMetadata.total }),
          });
        }
        const providerStartedAt = performance.now();
        const result = await transcribeWithSttProviders({
          audio: validatedAudio,
          language,
          mode,
          geminiApiKey,
          groqApiKey,
          model: GEMINI_MODEL,
          generationConfig: GEMINI_GENERATION_CONFIG,
          timeoutMs,
        });
        const providerMs = Math.round(performance.now() - providerStartedAt);
        if (!result.ok) {
          console.error(
            `${result.provider} voice transcription failed (${result.error}, retryable=${result.retryable}).`,
          );
          return errorResponse(
            result.error,
            result.status,
            result.retryable,
            result.providerStatus,
          );
        }
        console.info(`Voice transcription succeeded via ${result.provider} in ${providerMs}ms.`);
        return NextResponse.json({
          ok: true,
          transcript: result.transcript,
          ...(chunkMetadata.sequence === null ? {} : { sequence: chunkMetadata.sequence }),
          ...(chunkMetadata.total === null ? {} : { total: chunkMetadata.total }),
          ...(process.env.NODE_ENV === "development" ? { timings: { providerMs } } : {}),
        });
      },
    );
  } catch (error: unknown) {
    if (error instanceof VoiceAudioValidationError) {
      return errorResponse(
        error.code,
        error.code === "audio-too-large" ? 413 : 422,
      );
    }
    const failure = classifySttFailure(error);
    console.error(`Voice transcription request failed (${failure.error}).`);
    return errorResponse(
      failure.error,
      failure.status,
      failure.retryable,
      failure.providerStatus,
    );
  } finally {
    form.delete("audio");
    audio = null;
  }
}
