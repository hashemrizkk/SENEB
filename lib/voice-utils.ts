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
