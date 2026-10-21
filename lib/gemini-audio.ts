const ALLOWED_AUDIO_TYPES = new Set(["audio/wav"]);

export function isSupportedAudioType(type: string): boolean {
  return ALLOWED_AUDIO_TYPES.has(type.split(";")[0].trim().toLowerCase());
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
