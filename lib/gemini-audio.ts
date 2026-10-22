const ALLOWED_AUDIO_TYPES = new Set(["audio/wav"]);
const WAV_HEADER_BYTES = 44;
const WAV_BYTES_PER_SECOND = 16_000 * 2;
const SUPPORTED_LANGUAGES = new Set(["auto", "ar-EG", "ar", "en-US"]);

export type VoiceAudioError = "audio-too-large" | "unsupported-audio" | "bad-audio";
export type VoiceLanguage = "auto" | "ar-EG" | "ar" | "en-US";
export type VoiceTranscriptionMode = "transcription" | "dictation";
export type SttProviderName = "Gemini" | "Groq";

export const DEFAULT_STT_TIMEOUT_MS = 90_000;
const MAX_STT_TIMEOUT_MS = 120_000;
const GROQ_MODEL = "whisper-large-v3";

export type SttTranscriptionResult =
  | { ok: true; transcript: string; provider: SttProviderName }
  | {
      ok: false;
      error: string;
      status: number;
      retryable: boolean;
      provider: SttProviderName;
      providerStatus?: number;
    };

class SttProviderError extends Error {
  readonly code: string;
  readonly status: number;
  readonly retryable: boolean;
  readonly providerStatus: number | undefined;

  constructor(
    code: string,
    status: number,
    retryable: boolean,
    providerStatus?: number,
  ) {
    super(code);
    this.code = code;
    this.status = status;
    this.retryable = retryable;
    this.providerStatus = providerStatus;
  }
}

class InvalidSttOutputError extends Error {}

export function getSttTimeoutMs(
  value: string | undefined = process.env.STT_TIMEOUT_MS,
): number {
  if (value === undefined) return DEFAULT_STT_TIMEOUT_MS;
  if (!/^\d+$/.test(value)) return DEFAULT_STT_TIMEOUT_MS;
  const timeoutMs = Number(value);
  return Number.isSafeInteger(timeoutMs) &&
    timeoutMs >= 1_000 &&
    timeoutMs <= MAX_STT_TIMEOUT_MS
    ? timeoutMs
    : DEFAULT_STT_TIMEOUT_MS;
}

export function classifySttFailure(
  error: unknown,
  signal?: AbortSignal,
): { error: string; status: number; retryable: boolean; providerStatus?: number } {
  if (error instanceof SttProviderError) {
    return {
      error: error.code,
      status: error.status,
      retryable: error.retryable,
      ...(error.providerStatus === undefined
        ? {}
        : { providerStatus: error.providerStatus }),
    };
  }
  if (
    signal?.aborted ||
    (error instanceof Error &&
      (error.name === "AbortError" || error.name === "TimeoutError"))
  ) {
    return { error: "transcription-timeout", status: 504, retryable: true };
  }
  if (error instanceof InvalidSttOutputError) {
    return { error: "transcription-failed", status: 502, retryable: true };
  }
  if (error instanceof TypeError) {
    return { error: "transcription-network-error", status: 503, retryable: true };
  }
  const status =
    error !== null && typeof error === "object" && "status" in error &&
    typeof error.status === "number"
      ? error.status
      : null;
  if (status === 408 || status === 429 || (status !== null && status >= 500)) {
    return {
      error: status === 429 ? "rate-limited" : "provider-unavailable",
      status: status === 429 ? 429 : 503,
      retryable: true,
    };
  }
  return {
    error: "transcription-failed",
    status: 502,
    retryable: status === null,
  };
}

function retryableStatus(status: number, body: string): boolean {
  if (status === 408 || status === 429 || status === 401 || status >= 500) {
    return true;
  }
  return status === 403 && /quota|resource[_ ]exhausted|rate.?limit/i.test(body);
}

function providerErrorCode(status: number): string {
  if (status === 400) return "unsupported-audio";
  if (status === 401 || status === 403) return "provider-auth-failed";
  if (status === 404) return "provider-unavailable";
  if (status === 429) return "rate-limited";
  if (status >= 500) return "provider-unavailable";
  return "transcription-failed";
}

function providerHttpStatus(status: number): number {
  if (status === 400) return 422;
  if (status === 429) return 429;
  return 502;
}

async function withProviderTimeout<T>(
  timeoutMs: number,
  request: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await request(controller.signal);
  } catch (error: unknown) {
    const failure = classifySttFailure(error, controller.signal);
    throw new SttProviderError(
      failure.error,
      failure.status,
      failure.retryable,
      failure.providerStatus,
    );
  } finally {
    clearTimeout(timeout);
  }
}

async function assertProviderResponse(response: Response): Promise<void> {
  if (response.ok) return;
  let body = "";
  try {
    body = await response.text();
  } catch {
    // The status alone is enough to classify an unreadable provider response.
  }
  throw new SttProviderError(
    providerErrorCode(response.status),
    providerHttpStatus(response.status),
    retryableStatus(response.status, body),
    response.status,
  );
}

async function transcribeGemini(input: {
  audio: Blob;
  apiKey: string;
  prompt: string;
  model: string;
  generationConfig: Record<string, unknown>;
  timeoutMs: number;
  fetchImpl: typeof fetch;
}): Promise<string> {
  const audioBase64 = Buffer.from(await input.audio.arrayBuffer()).toString("base64");
  return withProviderTimeout(input.timeoutMs, async (signal) => {
    const response = await input.fetchImpl(
      `https://generativelanguage.googleapis.com/v1beta/models/${input.model}:generateContent`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": input.apiKey,
        },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: input.prompt },
              {
                inline_data: {
                  mime_type: input.audio.type.split(";")[0].trim().toLowerCase(),
                  data: audioBase64,
                },
              },
            ],
          }],
          generationConfig: input.generationConfig,
        }),
        signal,
      },
    );
    await assertProviderResponse(response);
    let result: unknown;
    try {
      result = await response.json();
    } catch {
      throw new InvalidSttOutputError();
    }
    const transcript = readGeminiTranscript(result);
    if (!transcript) throw new InvalidSttOutputError();
    return transcript;
  });
}

async function transcribeGroq(input: {
  audio: Blob;
  apiKey: string;
  prompt: string;
  language: VoiceLanguage;
  timeoutMs: number;
  fetchImpl: typeof fetch;
}): Promise<string> {
  const form = new FormData();
  form.append("file", input.audio, "voice.wav");
  form.append("model", GROQ_MODEL);
  form.append("prompt", input.prompt);
  if (input.language === "ar" || input.language === "ar-EG") {
    form.append("language", "ar");
  } else if (input.language === "en-US") {
    form.append("language", "en");
  }
  return withProviderTimeout(input.timeoutMs, async (signal) => {
    const response = await input.fetchImpl(
      "https://api.groq.com/openai/v1/audio/transcriptions",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${input.apiKey}` },
        body: form,
        signal,
      },
    );
    await assertProviderResponse(response);
    let result: unknown;
    try {
      result = await response.json();
    } catch {
      throw new InvalidSttOutputError();
    }
    if (
      result === null ||
      typeof result !== "object" ||
      !("text" in result) ||
      typeof result.text !== "string"
    ) {
      throw new InvalidSttOutputError();
    }
    const transcript = result.text.trim();
    if (!transcript || transcript.length > 2_000) {
      throw new InvalidSttOutputError();
    }
    return transcript;
  });
}

export async function transcribeWithSttProviders(input: {
  audio: Blob;
  language: VoiceLanguage;
  mode: VoiceTranscriptionMode;
  geminiApiKey?: string;
  groqApiKey?: string;
  model: string;
  generationConfig: Record<string, unknown>;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}): Promise<SttTranscriptionResult> {
  const prompt = buildTranscriptionPrompt(input.language, input.mode);
  const timeoutMs = input.timeoutMs ?? getSttTimeoutMs();
  const fetchImpl = input.fetchImpl ?? fetch;
  const providers = [
    ...(input.geminiApiKey ? [{ provider: "Gemini" as const, apiKey: input.geminiApiKey }] : []),
    ...(input.groqApiKey ? [{ provider: "Groq" as const, apiKey: input.groqApiKey }] : []),
  ];

  for (const { provider, apiKey } of providers) {
    try {
      const transcript = provider === "Gemini"
        ? await transcribeGemini({
            audio: input.audio,
            apiKey,
            prompt,
            model: input.model,
            generationConfig: input.generationConfig,
            timeoutMs,
            fetchImpl,
          })
        : await transcribeGroq({
            audio: input.audio,
            apiKey,
            prompt,
            language: input.language,
            timeoutMs,
            fetchImpl,
          });
      return { ok: true, transcript, provider };
    } catch (error: unknown) {
      const failure = classifySttFailure(error);
      if (failure.retryable && provider === "Gemini" && providers.some((item) => item.provider === "Groq")) {
        continue;
      }
      return { ok: false, ...failure, provider };
    }
  }
  return {
    ok: false,
    error: "provider-unavailable",
    status: 503,
    retryable: true,
    provider: "Gemini",
  };
}

export function mockVoiceTranscript(): string {
  return "[MOCK] Dictation unavailable — transcription service is not configured.";
}

export function buildTranscriptionPrompt(
  language: VoiceLanguage,
  mode: VoiceTranscriptionMode = "transcription",
): string {
  if (language === "auto") {
    return "Transcribe the audio verbatim in the language(s) spoken (Egyptian Arabic and/or English). Keep medication and medical terms in the original language. Clean punctuation, no filler words, numbers and dosages verbatim.";
  }
  const languageName = language === "en-US" ? "English" : "Egyptian Arabic";
  if (mode === "transcription") {
    return `Transcribe the spoken words verbatim in ${languageName} only. Return only the spoken words as plain text. Do not translate, summarize, interpret, or add commentary.`;
  }
  return `Transcribe the audio verbatim in ${languageName} only. Keep medication and medical terms in the original language. Clean punctuation, no filler words, numbers and dosages verbatim.`;
}

export function parseVoiceChunkMetadata(
  sequenceValue: string | null,
  totalValue: string | null,
): { sequence: number | null; total: number | null } {
  if (sequenceValue === null && totalValue === null) {
    return { sequence: null, total: null };
  }
  if (
    sequenceValue === null ||
    !/^\d+$/.test(sequenceValue) ||
    (totalValue !== null && !/^\d+$/.test(totalValue))
  ) {
    throw new VoiceAudioValidationError("bad-audio");
  }
  const sequence = Number(sequenceValue);
  const total = totalValue === null ? null : Number(totalValue);
  if (
    !Number.isSafeInteger(sequence) ||
    sequence < 0 ||
    (total !== null &&
      (!Number.isSafeInteger(total) || total < 1 || sequence >= total))
  ) {
    throw new VoiceAudioValidationError("bad-audio");
  }
  return { sequence, total };
}

export function isVoiceLanguage(value: string): value is VoiceLanguage {
  return SUPPORTED_LANGUAGES.has(value);
}

export class VoiceAudioValidationError extends Error {
  readonly code: VoiceAudioError;

  constructor(code: VoiceAudioError) {
    super(code);
    this.code = code;
    this.name = "VoiceAudioValidationError";
  }
}

export function isSupportedAudioType(type: string): boolean {
  return ALLOWED_AUDIO_TYPES.has(type.split(";")[0].trim().toLowerCase());
}

export async function withValidatedGeminiWav<T>(
  audio: Blob,
  mimeType: string,
  maxBytes: number,
  invokeProvider: (durationMs: number) => Promise<T>,
): Promise<T> {
  if (audio.size > maxBytes) {
    throw new VoiceAudioValidationError("audio-too-large");
  }
  if (!isSupportedAudioType(mimeType) || audio.size < WAV_HEADER_BYTES) {
    throw new VoiceAudioValidationError("unsupported-audio");
  }

  const buffer = await audio.arrayBuffer();
  const view = new DataView(buffer);
  const text = (offset: number, length: number) =>
    String.fromCharCode(...new Uint8Array(buffer, offset, length));
  const isValid =
    text(0, 4) === "RIFF" &&
    text(8, 4) === "WAVE" &&
    view.getUint32(4, true) === buffer.byteLength - 8 &&
    text(12, 4) === "fmt " &&
    view.getUint32(16, true) === 16 &&
    view.getUint16(20, true) === 1 &&
    view.getUint16(22, true) === 1 &&
    view.getUint32(24, true) === 16_000 &&
    view.getUint32(28, true) === WAV_BYTES_PER_SECOND &&
    view.getUint16(32, true) === 2 &&
    view.getUint16(34, true) === 16 &&
    text(36, 4) === "data";
  if (!isValid) throw new VoiceAudioValidationError("unsupported-audio");

  const dataBytes = view.getUint32(40, true);
  if (
    dataBytes <= 0 ||
    dataBytes % 2 !== 0 ||
    dataBytes !== buffer.byteLength - WAV_HEADER_BYTES
  ) {
    throw new VoiceAudioValidationError("unsupported-audio");
  }
  const durationMs = (dataBytes / WAV_BYTES_PER_SECOND) * 1_000;
  return invokeProvider(durationMs);
}

export function readGeminiTranscript(value: unknown): string | null {
  if (!value || typeof value !== "object" || !("candidates" in value)) {
    return null;
  }
  const candidates = value.candidates;
  if (!Array.isArray(candidates) || candidates.length === 0) return null;
  const content = candidates[0]?.content;
  if (!content || typeof content !== "object" || !("parts" in content)) {
    return null;
  }
  const parts = content.parts;
  if (!Array.isArray(parts)) return null;
  const text = parts
    .map((part: unknown) =>
      part &&
      typeof part === "object" &&
      "text" in part &&
      typeof part.text === "string"
        ? part.text
        : "",
    )
    .join("")
    .trim();
  return text && text.length <= 2000 ? text : null;
}
