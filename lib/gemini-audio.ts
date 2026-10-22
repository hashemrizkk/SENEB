const ALLOWED_AUDIO_TYPES = new Set(["audio/wav"]);
const WAV_HEADER_BYTES = 44;
const WAV_BYTES_PER_SECOND = 16_000 * 2;
const MAX_WAV_DURATION_MS = 30_500;

export type VoiceAudioError = "audio-too-large" | "unsupported-audio";

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
  if (durationMs > MAX_WAV_DURATION_MS) {
    throw new VoiceAudioValidationError("unsupported-audio");
  }
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
