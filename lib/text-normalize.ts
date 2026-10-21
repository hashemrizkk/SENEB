export type TextMatch = {
  start: number;
  end: number;
  kind: string;
};

export type HighlightSegment = {
  text: string;
  highlighted: boolean;
  kinds: string[];
};

type NormalizedText = {
  normalized: string;
  map: number[];
  ends: number[];
};

const arabicMarks = /[\u064B-\u065F\u0670\u0640]/;

function normalizeDetailed(text: string): NormalizedText {
  const chars: string[] = [];
  const map: number[] = [];
  const ends: number[] = [];
  let pendingWhitespace: { start: number; end: number } | null = null;
  let originalIndex = 0;

  for (const originalChar of text) {
    const originalEnd = originalIndex + originalChar.length;
    if (arabicMarks.test(originalChar)) {
      if (ends.length > 0 && chars[chars.length - 1] !== " ") {
        ends[ends.length - 1] = originalEnd;
      }
      originalIndex = originalEnd;
      continue;
    }

    if (/\s/u.test(originalChar)) {
      if (chars.length > 0) {
        pendingWhitespace ??= { start: originalIndex, end: originalEnd };
        pendingWhitespace.end = originalEnd;
      }
      originalIndex = originalEnd;
      continue;
    }

    if (pendingWhitespace) {
      chars.push(" ");
      map.push(pendingWhitespace.start);
      ends.push(pendingWhitespace.end);
      pendingWhitespace = null;
    }

    const normalizedChar = originalChar
      .replace(/[أإآ]/g, "ا")
      .replace(/ى/g, "ي")
      .replace(/ة/g, "ه")
      .replace(/[٠-٩]/g, (digit) =>
        String.fromCharCode(digit.charCodeAt(0) - 0x0660 + 0x30),
      )
      .replace(/[۰-۹]/g, (digit) =>
        String.fromCharCode(digit.charCodeAt(0) - 0x06f0 + 0x30),
      )
      .toLowerCase();

    for (let index = 0; index < normalizedChar.length; index += 1) {
      chars.push(normalizedChar[index]);
      map.push(originalIndex);
      ends.push(originalEnd);
    }
    originalIndex = originalEnd;
  }

  return { normalized: chars.join(""), map, ends };
}

export function normalizeWithMap(text: string): {
  normalized: string;
  map: number[];
} {
  const result = normalizeDetailed(text);
  return { normalized: result.normalized, map: result.map };
}

export function findAllOccurrences(
  originalText: string,
  term: string,
): { start: number; end: number }[] {
  const source = normalizeDetailed(originalText);
  const normalizedTerm = normalizeDetailed(term).normalized;
  if (normalizedTerm.length === 0) return [];

  const matches: { start: number; end: number }[] = [];
  let index = 0;
  while (index <= source.normalized.length - normalizedTerm.length) {
    const found = source.normalized.indexOf(normalizedTerm, index);
    if (found < 0) break;
    const last = found + normalizedTerm.length - 1;
    matches.push({
      start: source.map[found],
      end: source.ends[last],
    });
    index = found + 1;
  }
  return matches;
}

export function verifyQuote(originalText: string, quote: string): boolean {
  const normalizedQuote = normalizeDetailed(quote).normalized;
  if (normalizedQuote.length < 2) return false;
  return normalizeDetailed(originalText).normalized.includes(normalizedQuote);
}

export function highlightSegments(
  originalText: string,
  matches: TextMatch[],
): HighlightSegment[] {
  if (originalText.length === 0) return [];

  const validMatches = matches.filter(
    (match) =>
      Number.isInteger(match.start) &&
      Number.isInteger(match.end) &&
      match.start >= 0 &&
      match.end <= originalText.length &&
      match.start < match.end,
  );
  const boundaries = new Set<number>([0, originalText.length]);
  for (const match of validMatches) {
    boundaries.add(match.start);
    boundaries.add(match.end);
  }

  const orderedBoundaries = [...boundaries].sort((left, right) => left - right);
  const segments: HighlightSegment[] = [];
  for (let index = 0; index < orderedBoundaries.length - 1; index += 1) {
    const start = orderedBoundaries[index];
    const end = orderedBoundaries[index + 1];
    const kinds = [
      ...new Set(
        validMatches
          .filter((match) => match.start < end && match.end > start)
          .map((match) => match.kind),
      ),
    ].sort();
    const segment = {
      text: originalText.slice(start, end),
      highlighted: kinds.length > 0,
      kinds,
    };
    const previous = segments[segments.length - 1];
    if (
      previous &&
      previous.highlighted === segment.highlighted &&
      previous.kinds.join("\0") === segment.kinds.join("\0")
    ) {
      previous.text += segment.text;
    } else {
      segments.push(segment);
    }
  }
  return segments;
}
