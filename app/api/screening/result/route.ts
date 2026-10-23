import { NextResponse } from "next/server";
import { z } from "zod";
import instrument from "@/data/screening/findrisc-0.2.json";
import symptoms from "@/data/screening/symptom-modifier.json";
import blocks from "@/data/screening/content-blocks.json";
import {
  completeScreeningAssessment,
  getContentBlock,
  getScreeningResponses,
  getScreeningSummary,
  redflagRulesetById,
  recordScreeningEventQuietly,
  recordScreeningResultUnavailable,
  scoringVersionById,
  type ScreeningUnavailableReason,
} from "@/lib/db";
import { recommend } from "@/lib/screening/recommend";
import { scoreAssessment } from "@/lib/screening/score";
import { getSessionFromRequest, tokenFromRequest } from "@/lib/screening/session-auth";
import { hasSameOrigin } from "@/lib/requestGuards";

const emptySchema = z.object({}).strict();
const optionSchema = z.object({ id: z.string(), points: z.number() }).passthrough();
const configSchema = z.object({
  key: z.string(),
  version: z.string(),
  status: z.string(),
  total_min: z.number(),
  total_max: z.number(),
  bands: z.array(z.object({ id: z.string(), min: z.number(), max: z.number() }).passthrough()),
  product_band_map: z.record(z.string(), z.array(z.string())),
  items: z.array(z.object({ id: z.string(), options: z.array(optionSchema) }).passthrough()),
}).passthrough();
type Locale = "ar" | "en";
type Band = "low" | "elevated" | "high";

function safeFallback(locale: Locale): string {
  return blocks.find((block) => block.key === "safe_fallback" && block.locale === locale)?.body
    ?? "A blood test is the way to check. If you feel very unwell, seek urgent care.";
}
function failure(locale: Locale, stage: string, code: ScreeningUnavailableReason, status = 200): Response {
  recordScreeningResultUnavailable(stage, code);
  return NextResponse.json({ ok: true, band: null, guidance: safeFallback(locale), fallback: true }, { status });
}
function unavailable(stage: string, code: ScreeningUnavailableReason): Response {
  recordScreeningResultUnavailable(stage, code);
  return NextResponse.json({ error: "Screening result is unavailable." }, { status: 404 });
}
function isLocale(value: unknown): Locale { return value === "ar" ? "ar" : "en"; }
function bandLabel(band: string, locale: Locale): string {
  if (band === "low") return locale === "ar" ? "فئة خطر أقل" : "Lower risk band";
  if (band === "elevated") return locale === "ar" ? "فئة خطر مرتفع" : "Elevated risk band";
  return locale === "ar" ? "فئة خطر أعلى" : "Higher risk band";
}
function getRequiredContent(key: string, locale: Locale): string | undefined {
  return getContentBlock(key, locale)?.body;
}
function isCanonicalConfig(config: z.infer<typeof configSchema>): boolean {
  if (config.key !== instrument.key || config.items.length !== instrument.items.length) return false;
  return instrument.items.every((expected, index) => {
    const actual = config.items[index];
    return actual.id === expected.id
      && actual.options.length === expected.options.length
      && expected.options.every((option, optionIndex) => actual.options[optionIndex]?.id === option.id && actual.options[optionIndex]?.points === option.points);
  });
}
function errorReason(stage: string, error: unknown): ScreeningUnavailableReason {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (error instanceof Error && error.name === "ScreeningAuditWriteError") return "audit_error";
  if (typeof error === "object" && error !== null && "code" in error && String(error.code).startsWith("SQLITE")) return "database_error";
  if (stage === "assessment_write" && message.includes("audit")) return "audit_error";
  if (stage === "assessment_write") return "database_error";
  if (stage === "config_parse" || stage === "config_validation") return "scoring_config_invalid";
  if (message.includes("derived") || message.includes("bmi") || message.includes("waist")) return "derived_input_invalid";
  if (stage === "scoring") return "scoring_error";
  return "internal_error";
}
function responseFromSummary(summary: Record<string, unknown>, locale: Locale, includeOk = false, sessionId: string | null = null): Response {
  let keys: string[];
  try { keys = JSON.parse(String(summary.content_block_keys_json)) as string[]; }
  catch { return unavailable("recommendation_keys", "database_error"); }
  const key = keys[0];
  const guidance = key ? getRequiredContent(key, locale) : undefined;
  if (!guidance) return unavailable("content_lookup", "content_block_missing");
  recordScreeningEventQuietly({ sessionId, event: "result_viewed", step: "result" });
  const band = String(summary.band);
  return NextResponse.json({
    ...(includeOk ? { ok: true } : {}),
    band,
    band_label: bandLabel(band, locale),
    recommendation_kind: summary.recommendation_kind,
    guidance,
    version_label: summary.version_label,
    placeholder: summary.version_status !== "active",
    session_date: String(summary.computed_at).slice(0, 10),
  });
}
export async function POST(request: Request): Promise<Response> {
  if (!hasSameOrigin(request)) return NextResponse.json({ error: "Request origin was not accepted." }, { status: 403 });
  const localeHint = isLocale(request.headers.get("accept-language")?.startsWith("ar") ? "ar" : "en");
  const session = getSessionFromRequest(request);
  if (!session) {
    const code = tokenFromRequest(request) ? "session_not_found" : "session_cookie_missing";
    return failure(localeHint, "session_lookup", code, 409);
  }
  const locale = isLocale(session.locale);
  if (!emptySchema.safeParse(await request.json().catch(() => null)).success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  if (session.status === "completed") {
    const existing = getScreeningSummary(String(session.id));
    return existing ? responseFromSummary(existing, locale, true, String(session.id)) : failure(locale, "completed_summary", "database_error");
  }
  if (session.status !== "in_progress") return NextResponse.json({ error: "Complete the safety gate and questions first." }, { status: 409 });

  try {
  const versionId = typeof session.scoring_version_id === "string" ? session.scoring_version_id : null;
  const version = versionId ? scoringVersionById(versionId) : undefined;
  if (!version) return failure(locale, "scoring_version_lookup", "no_active_scoring_version");

  let clinicalConfig: z.infer<typeof configSchema>;
  try { clinicalConfig = configSchema.parse(JSON.parse(version.config_json)); }
  catch { return failure(locale, "config_validation", "scoring_config_invalid"); }
  if (!isCanonicalConfig(clinicalConfig)) return failure(locale, "config_validation", "scoring_config_invalid");

  const rulesetId = typeof session.redflag_ruleset_id === "string" ? session.redflag_ruleset_id : null;
  if (!rulesetId) return failure(locale, "redflag_ruleset_lookup", "redflag_ruleset_missing");
  const ruleset = redflagRulesetById(rulesetId);
  try {
    if (!ruleset || !Array.isArray((JSON.parse(ruleset.rules_json) as { items?: unknown }).items)) return failure(locale, "redflag_ruleset_validation", "redflag_ruleset_missing");
  } catch { return failure(locale, "redflag_ruleset_validation", "redflag_ruleset_missing"); }
  const stored = getScreeningResponses(String(session.id));
  const map = Object.fromEntries(stored.map((answer) => [answer.question_id, answer.option_id]));
  const requiredIds = [...clinicalConfig.items.map((item) => item.id), ...symptoms.items.map((item) => item.id)];
  if (requiredIds.some((id) => typeof map[id] !== "string")) return failure(locale, "answers_loaded", "answers_incomplete");
  const expectedIds = new Set(requiredIds);
  if (stored.some((answer) => !expectedIds.has(answer.question_id))) return failure(locale, "answer_validation", "answer_invalid_for_version");
  const invalidInstrumentAnswer = clinicalConfig.items.find((item) => !item.options.some((option) => option.id === map[item.id]));
  if (invalidInstrumentAnswer) {
    const code = invalidInstrumentAnswer.id === "bmi" || invalidInstrumentAnswer.id === "waist" ? "derived_input_invalid" : "answer_invalid_for_version";
    return failure(locale, "answer_validation", code);
  }
  if (!clinicalConfig.items.some((item) => item.id === "sex" && item.options.some((option) => option.id === map.sex))) return failure(locale, "derived_inputs", "derived_input_invalid");
  if (symptoms.items.some((item) => map[item.id] !== "yes" && map[item.id] !== "no")) return failure(locale, "answer_validation", "answer_invalid_for_version");

  const symptomModifier = symptoms.items.some((item) => map[item.id] === "yes");
  const scoringAnswers = Object.fromEntries(clinicalConfig.items.map((item) => [item.id, map[item.id]]));
  let result: ReturnType<typeof scoreAssessment>;
  try { result = scoreAssessment(scoringAnswers, clinicalConfig as Parameters<typeof scoreAssessment>[1], symptomModifier); }
  catch (error) { return failure(locale, "scoring", errorReason("scoring", error)); }
  const suggestion = recommend(result.band, result.symptom_modifier_triggered);
  const guidance = getRequiredContent(suggestion.content_block_keys[0], locale);
  if (!guidance) return failure(locale, "content_lookup", "content_block_missing");

  try {
    completeScreeningAssessment({
      sessionId: String(session.id),
      scoringVersionId: version.id,
      total: result.total,
      band: result.band,
      breakdown: result.breakdown,
      symptomModifier: result.symptom_modifier_triggered,
      recommendationKind: suggestion.kind,
      contentKeys: suggestion.content_block_keys,
    });
  } catch (error) { return failure(locale, "assessment_write", errorReason("assessment_write", error)); }
  recordScreeningEventQuietly({ sessionId: String(session.id), event: "screening_completed", step: "result" });
  return NextResponse.json({
    ok: true,
    band: result.band,
    band_label: bandLabel(result.band, locale),
    guidance,
    version_label: version.version_label,
    placeholder: version.status !== "active" || clinicalConfig.status === "placeholder",
  });
  } catch (error) {
    return failure(locale, "result_processing", errorReason("result_processing", error));
  }
}

export async function GET(request: Request): Promise<Response> {
  const session = getSessionFromRequest(request);
  if (!session) {
    const code = tokenFromRequest(request) ? "session_not_found" : "session_cookie_missing";
    return unavailable("session_lookup", code);
  }
  if (session.status !== "completed") return unavailable("session_completion", "answers_incomplete");
  try {
    const summary = getScreeningSummary(String(session.id));
    if (!summary) return unavailable("summary_lookup", "database_error");
    return responseFromSummary(summary, isLocale(session.locale), false, String(session.id));
  } catch (error) {
    return unavailable("result_response", errorReason("result_response", error));
  }
}
