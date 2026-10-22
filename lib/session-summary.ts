import { z } from "zod";
import { verifyQuote } from "./text-normalize.ts";
import { normalizeWithMap } from "./text-normalize.ts";
import { MAX_POINTS } from "./session-config.ts";

// Session categories, anchors and verification rules are placeholders requiring clinician review.
const categories = ["patient_symptom","patient_concern","patient_report_value","doctor_question","doctor_finding","doctor_explanation","plan_or_instruction_mentioned","follow_up_mentioned","medication_mentioned","other"] as const;
const assertions = ["present","negated","uncertain","hypothetical","history","other_person"] as const;
export const sessionOutputSchema = z.object({
  schema_version: z.literal(1),
  points: z.array(z.object({ text: z.string(), category: z.enum(categories), speaker_role: z.enum(["doctor","patient","other","unattributed"]), utterance_ids: z.array(z.number().int()), quotes: z.array(z.string()), assertion: z.enum(assertions) })),
  key_terms: z.array(z.object({ quote: z.string(), category: z.enum(categories), assertion: z.enum(assertions), utterance_id: z.number().int(), speaker_role: z.enum(["doctor","patient","other","unattributed"]), timeframe: z.string().nullable() })),
  key_values: z.array(z.object({ quote: z.string(), kind: z.string(), parts: z.array(z.object({ number: z.string(), unit: z.string().nullable() })), context: z.string(), utterance_id: z.number().int(), speaker_role: z.enum(["doctor","patient","other","unattributed"]) })),
  unclear_segments: z.array(z.object({ quote: z.string(), reason: z.string() })),
  inconsistencies: z.array(z.object({ description: z.string(), quotes: z.array(z.string()), utterance_ids: z.array(z.number().int()) })),
  overview: z.string().nullable(),
});
export type SessionOutput = z.infer<typeof sessionOutputSchema>;
export function redactSessionText(value: string): string {
  return value
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, "[REDACTED]")
    .replace(/\d{8,}/g, "[REDACTED]")
    .replace(/\b(?:ignore|disregard|forget)\s+(?:(?:all|the)\s+)?(?:previous|prior|above)\s+instructions?\b[^.!?\n]{0,240}[.!?]?/gi, "[INSTRUCTION TEXT OMITTED]");
}
export type SessionFallbackReason = "not_configured" | "auth_failed" | "model_not_found" | "rate_limited" | "timeout" | "network_error" | "truncated_output" | "invalid_json" | "schema_mismatch" | "no_verified_items" | "internal_error";
export function sessionFallbackReason(error: unknown): SessionFallbackReason {
  if (error instanceof Error && /SESSION_PROVIDER_NOT_CONFIGURED/.test(error.message)) return "not_configured";
  if (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")) return "timeout";
  if (error && typeof error === "object" && "statusCode" in error && typeof error.statusCode === "number") {
    if (error.statusCode === 401 || error.statusCode === 403) return "auth_failed";
    if (error.statusCode === 404) return "model_not_found";
    if (error.statusCode === 429) return "rate_limited";
    if (error.statusCode >= 500) return "network_error";
    if (error.statusCode === 400) return "invalid_json";
  }
  if (error instanceof Error && /truncat|max completion tokens/i.test(error.message)) return "truncated_output";
  if (error instanceof Error && /invalid.*json|JSON/i.test(error.message)) return "invalid_json";
  if (error instanceof Error && /schema|validation/i.test(error.message)) return "schema_mismatch";
  return "internal_error";
}
export function verifySessionOutput(raw: SessionOutput, utterances: { id: number; role: string; text: string }[]) {
  const lookup = new Map(utterances.map((u) => [u.id, u]));
  let dropped = 0;
  const points = raw.points.filter((point) => {
    if (!point.utterance_ids.length || !point.quotes.length) { dropped++; return false; }
    for (const id of point.utterance_ids) {
      const u = lookup.get(id);
      if (!u || u.role !== point.speaker_role || ((u.role === "other" || u.role === "unattributed") && point.category !== "other")) { dropped++; return false; }
      if ((point.category.startsWith("patient_") && u.role !== "patient") || ((point.category.startsWith("doctor_") || point.category === "plan_or_instruction_mentioned") && u.role !== "doctor")) { dropped++; return false; }
    }
    const ok = point.quotes.every((quote) => point.utterance_ids.some((id) => { const u = lookup.get(id); return !!u && verifyQuote(u.text, quote); }));
    const verifiedQuotes = point.quotes.map((quote) => normalizeWithMap(quote).normalized).join(" ");
    const pointNumbersMatch = [...point.text.matchAll(/[0-9٠-٩۰-۹]+/g)].every((match) => {
      const number = normalizeWithMap(match[0]).normalized;
      return new RegExp(`(?<![0-9])${number.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![0-9])`).test(verifiedQuotes);
    });
    if (!ok || !pointNumbersMatch) dropped++;
    return ok && pointNumbersMatch;
  }).slice(0, MAX_POINTS);
  const key_terms = raw.key_terms.filter((item) => { const u = lookup.get(item.utterance_id); const ok = !!u && u.role === item.speaker_role && verifyQuote(u.text, item.quote); if (!ok) dropped++; return ok; });
  const key_values = raw.key_values.filter((item) => { const u = lookup.get(item.utterance_id); const normalizedQuote = normalizeWithMap(item.quote).normalized; const ok = !!u && u.role === item.speaker_role && verifyQuote(u.text, item.quote) && item.parts.every((p) => (!/\d/.test(p.number) || normalizedQuote.includes(normalizeWithMap(p.number).normalized)) && (p.unit === null || normalizedQuote.includes(normalizeWithMap(p.unit).normalized))); if (!ok) dropped++; return ok; });
  for (const utterance of utterances) {
    const normalizedText = normalizeWithMap(utterance.text).normalized;
    for (const match of utterance.text.matchAll(/(?<![0-9٠-٩۰-۹])[0-9٠-٩۰-۹]{1,7}(?![0-9٠-٩۰-۹])/g)) {
      const number = match[0];
      const normalizedNumber = normalizeWithMap(number).normalized;
      const covered = key_values.some((value) => value.utterance_id === utterance.id && normalizeWithMap(value.quote).normalized.includes(normalizedNumber));
      if (!covered && normalizedText.includes(normalizedNumber)) key_values.push({ quote: number, kind: "unclassified_number", parts: [{ number, unit: null }], context: "Unit not stated; verify against transcript", utterance_id: utterance.id, speaker_role: utterance.role as "doctor" | "patient" | "other" | "unattributed" });
    }
  }
  const unclear_segments = raw.unclear_segments.filter((item) => {
    const ok = utterances.some((utterance) => verifyQuote(utterance.text, item.quote));
    if (!ok) dropped++;
    return ok;
  });
  for (const utterance of utterances) for (const match of utterance.text.matchAll(/\[غير واضح\]/g)) {
    if (!unclear_segments.some((item) => item.quote === match[0])) unclear_segments.push({ quote: match[0], reason: "Unclear marker found in transcript" });
  }
  const inconsistencies = raw.inconsistencies.filter((item) => {
    const ok = item.utterance_ids.length > 0 && item.utterance_ids.every((id) => lookup.has(id)) && item.quotes.length > 0 && item.quotes.every((quote) => item.utterance_ids.some((id) => { const utterance = lookup.get(id); return !!utterance && verifyQuote(utterance.text, quote); }));
    if (!ok) dropped++;
    return ok;
  });
  const transcript = utterances.map((u) => u.text).join(" ").normalize("NFKC").toLocaleLowerCase();
  const normalizedOverview = raw.overview ? normalizeWithMap(raw.overview).normalized : "";
  const normalizedTranscript = normalizeWithMap(transcript).normalized;
  const overviewOk = !raw.overview || [...normalizedOverview.matchAll(/\d+|[a-z]+/g)].every((m) => m[0].match(/^\d/) ? new RegExp(`(?<![0-9])${m[0]}(?![0-9])`).test(normalizedTranscript) : new RegExp(`(?<![a-z])${m[0]}(?![a-z])`).test(normalizedTranscript));
  if (!overviewOk) dropped++;
  return { output: { ...raw, points, key_terms, key_values, unclear_segments, inconsistencies, overview: overviewOk ? raw.overview : null }, dropped };
}
