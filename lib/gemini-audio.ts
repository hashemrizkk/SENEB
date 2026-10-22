const ALLOWED_AUDIO_TYPES = new Set(["audio/wav"]);
const WAV_HEADER_BYTES = 44;
const WAV_BYTES_PER_SECOND = 16_000 * 2;
const SUPPORTED_LANGUAGES = new Set(["auto", "ar-EG", "ar", "en-US"]);

export type VoiceAudioError = "audio-too-large" | "unsupported-audio" | "bad-audio";
export type VoiceLanguage = "auto" | "ar-EG" | "ar" | "en-US";
export type VoiceTranscriptionMode = "transcription" | "dictation";

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
