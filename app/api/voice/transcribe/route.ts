import { NextResponse } from "next/server";
import {
  hasSameOrigin,
  isRateLimited,
} from "@/lib/requestGuards";
import {
  isSupportedAudioType,
  readGeminiTranscript,
  VoiceAudioValidationError,
  withValidatedGeminiWav,
} from "@/lib/gemini-audio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_AUDIO_BYTES = 1024 * 1024;
const MAX_REQUEST_BYTES = MAX_AUDIO_BYTES + 16 * 1024;
const GEMINI_MODEL = "gemini-3.8-flash";

function errorResponse(error: string, status: number): Response {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function POST(request: Request): Promise<Response> {
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
  if (!apiKey) return errorResponse("gemini-not-configured", 503);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return errorResponse("bad-audio", 400);
  }

  const audio = form.get("audio");
  const language = form.get("language");
  if (
    !(audio instanceof File) ||
    audio.size === 0 ||
    audio.size > MAX_AUDIO_BYTES ||
    !isSupportedAudioType(audio.type) ||
    typeof language !== "string" ||
    !["ar-EG", "ar", "en-US"].includes(language)
  ) {
    return errorResponse(
      audio instanceof File && audio.size > MAX_AUDIO_BYTES
        ? "audio-too-large"
        : "bad-audio",
      audio instanceof File && audio.size > MAX_AUDIO_BYTES ? 413 : 400,
    );
  }

  try {
    return await withValidatedGeminiWav(
      audio,
      audio.type,
      MAX_AUDIO_BYTES,
      async () => {
        const audioBase64 = Buffer.from(await audio.arrayBuffer()).toString("base64");
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
                        text: `Transcribe the spoken words verbatim in the original language. Do not translate, summarize, interpret, or add commentary. Language hint: ${language}. Return only the transcription.`,
                      },
                      {
                        inline_data: {
                          mime_type: audio.type.split(";")[0].trim().toLowerCase(),
                          data: audioBase64,
                        },
                      },
                    ],
                  },
                ],
                generationConfig: { temperature: 0 },
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
          const transcript = readGeminiTranscript(result);
          if (!transcript) return errorResponse("empty-transcript", 422);
          return NextResponse.json({
            ok: true,
            transcript,
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
  }
}
