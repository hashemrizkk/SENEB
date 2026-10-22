import { ar } from "./strings.ar.ts";

export type InputMethod = "tap" | "typed" | "voice" | "mixed";

export function deriveInputMethod(input: {
  texts: readonly string[];
  transcriptPieces: readonly (readonly string[])[];
  editedAfterAppend: readonly boolean[];
  maxChars: readonly number[];
}): InputMethod {
  const hasText = input.texts.some((text) => text.trim().length > 0);
  if (!hasText) return "tap";

  const voiceUsed = input.transcriptPieces.some((pieces) => pieces.length > 0);
  if (!voiceUsed) return "typed";

  const allTextIsUneditedVoice = input.texts.every((text, index) => {
    const pieces = input.transcriptPieces[index] ?? [];
    const expected = pieces.reduce(
      (combined, piece) => appendTranscript(
        combined,
        piece,
        input.maxChars[index] ?? Number.MAX_SAFE_INTEGER,
      ),
      "",
    );
    return !input.editedAfterAppend[index] && text.trim() === expected.trim();
  });
  return allTextIsUneditedVoice ? "voice" : "mixed";
}

export function inputMethodLabel(value: string | null | undefined): string {
  switch (value) {
    case "tap": return ar.inputMethod.tap;
    case "typed": return ar.inputMethod.typed;
    case "voice": return ar.inputMethod.voice;
    case "mixed": return ar.inputMethod.mixed;
    default: return ar.inputMethod.unknown;
  }
}

export function inputMethodNote(value: string | null | undefined): string | null {
  return value === "voice" || value === "mixed" ? ar.inputMethod.voiceNote : null;
}

export function appendTranscript(
  existing: string,
  transcript: string,
  maxLength: number,
): string {
  const normalizedTranscript = transcript.trim();
  if (!normalizedTranscript) return existing;
  const separator = existing.trim()
    ? /\s$/.test(existing)
      ? ""
      : " "
    : "";
  return `${existing}${separator}${normalizedTranscript}`.slice(0, maxLength);
}

function normalizedCharacters(value: string): string[] {
  return Array.from(
    value
      .normalize("NFC")
      .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
      .replace(/[^\p{L}\p{N}]+/gu, ""),
  );
}

export function characterErrorRate(reference: string, hypothesis: string): number {
  const expected = normalizedCharacters(reference);
  const actual = normalizedCharacters(hypothesis);
  if (expected.length === 0) return actual.length === 0 ? 0 : 1;

  let previous = Array.from({ length: actual.length + 1 }, (_, index) => index);
  for (let row = 1; row <= expected.length; row += 1) {
    const current = [row];
    for (let column = 1; column <= actual.length; column += 1) {
      const substitutionCost =
        expected[row - 1] === actual[column - 1] ? 0 : 1;
      current[column] = Math.min(
        current[column - 1] + 1,
        previous[column] + 1,
        previous[column - 1] + substitutionCost,
      );
    }
    previous = current;
  }
  return previous[actual.length] / expected.length;
}
