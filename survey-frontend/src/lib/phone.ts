/**
 * Egyptian mobile phone handling.
 * Accepts Arabic-Indic digits (٠-٩), spaces and dashes.
 * Normalizes "+20 10...", "0020 10...", "20 10...", "10..." → 11-digit local format "01XXXXXXXXX".
 * Valid Egyptian mobile: 01[0125] followed by 8 digits.
 */

const ARABIC_INDIC = "٠١٢٣٤٥٦٧٨٩";
const EXTENDED_ARABIC_INDIC = "۰۱۲۳۴۵۶۷۸۹";

export function toWesternDigits(input: string): string {
  return input
    .replace(/[٠-٩]/g, (d) => String(ARABIC_INDIC.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String(EXTENDED_ARABIC_INDIC.indexOf(d)));
}

/** Returns the normalized 11-digit local number, or null when invalid. */
export function normalizeEgyptianPhone(raw: string): string | null {
  let s = toWesternDigits(raw).replace(/[\s\-().]/g, "");
  if (s.startsWith("+20")) s = s.slice(3);
  else if (s.startsWith("0020")) s = s.slice(4);
  else if (s.startsWith("20") && s.length === 12) s = s.slice(2);
  if (!/^01[0125]\d{8}$/.test(s)) return null;
  return s;
}

export function isValidEgyptianPhone(raw: string): boolean {
  return normalizeEgyptianPhone(raw) !== null;
}
