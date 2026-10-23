import nextEnv from "@next/env";
import fs from "node:fs";
import path from "node:path";
import { scoreAssessment } from "../lib/screening/score.ts";
import { recommend } from "../lib/screening/recommend.ts";

nextEnv.loadEnvConfig(process.cwd());
const db = await import("../lib/db.ts");
type Locale = "ar" | "en";
type Trace = {
  session: { id: string; status: string; locale: Locale; scoring_version_id: string | null; redflag_ruleset_id: string | null };
  consentPresent: boolean;
  version?: { id: string; status: string; config_json: string };
  ruleset?: { status: string; rules_json: string };
  responses: { question_id: string; option_id: string }[];
  assessmentPresent: boolean;
  recommendationPresent: boolean;
  unavailableEventCount: number;
  audit: { ok: boolean; checked: number };
  auditAction?: string;
  analyticsEvents: string[];
  contentBlocks: { key: string; locale: string }[];
};
const baseUrl = process.env.SCREENING_DEBUG_URL ?? "http://localhost:3000";
const positional = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const makeNew = process.argv.includes("--new");
const requestedSessionId = positional[0];
const short = (id: unknown) => typeof id === "string" ? id.slice(0, 6) : "none";
const report = (stage: string, ok: boolean, detail: string) => console.log(`${ok ? "PASS" : "FAIL"} ${stage}: ${detail}`);
let firstFailure = false;
const fail = (stage: string, code: string) => {
  if (firstFailure) return;
  firstFailure = true;
  console.log(`FIRST_FAILURE stage=${stage} reason_code=${code}`);
};
const readJson = <T>(file: string): T => JSON.parse(fs.readFileSync(path.join(process.cwd(), "data", "screening", file), "utf8")) as T;
const symptoms = readJson<{ items: { id: string }[] }>("symptom-modifier.json");
const content = readJson<{ key: string; locale: Locale; body: string }[]>("content-blocks.json");
const staticConfig = readJson<{ items: { id: string; options: { id: string; points: number }[]; derived_input?: { height_cm?: { min: number; max: number }; weight_kg?: { min: number; max: number }; waist_cm?: { min: number; max: number } } }[] }>("findrisc-0.2.json");
let sessionId: string | undefined = requestedSessionId;
let cookie = "";
const request = async (method: string, endpoint: string, body?: unknown) => {
  const response = await fetch(new URL(endpoint, baseUrl), {
    method,
    headers: { Origin: baseUrl, ...(cookie ? { Cookie: cookie } : {}), ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!cookie) cookie = (response.headers.getSetCookie?.()[0] ?? "").split(";")[0];
  let data: Record<string, unknown> = {};
  try { data = await response.json() as Record<string, unknown>; } catch { /* Do not print response bodies. */ }
  return { response, data };
};

if (makeNew) {
  const started = await request("POST", "/api/screening/start", { consent: true, locale: "en" });
  sessionId = typeof started.data.session_id === "string" ? started.data.session_id : undefined;
  report("session_start", started.response.ok && Boolean(sessionId), `http=${started.response.status} session=${short(sessionId)} cookie=${cookie ? "present" : "missing"}`);
  if (!sessionId || !cookie) process.exit(1);
  report("consent", started.response.ok, `start http=${started.response.status}`);
  const gate = await request("POST", "/api/screening/redflags", { rule_ids: [], source: "gate" });
  report("redflag_gate", gate.response.ok, `http=${gate.response.status}`);
  if (!gate.response.ok) process.exit(1);
  const snapshot = db.getScreeningDebugTrace(sessionId) as Trace | undefined;
  if (!snapshot?.version) { report("scoring_version", false, "no scoring version selected"); fail("scoring_version", "no_active_scoring_version"); process.exit(1); }
  let config: typeof staticConfig;
  try { config = JSON.parse(snapshot.version.config_json) as typeof staticConfig; }
  catch { report("config_validated", false, "invalid JSON"); fail("config_validated", "scoring_config_invalid"); process.exit(1); }
  report("scoring_version", true, `id=${short(snapshot.version.id)} status=${snapshot.version.status}${snapshot.version.status === "draft" ? " (demo fallback)" : ""}`);
  const sameItems = config.items.length === staticConfig.items.length && staticConfig.items.every((item, index) => item.id === config.items[index]?.id && item.options.every((option, optionIndex) => option.id === config.items[index]?.options[optionIndex]?.id && option.points === config.items[index]?.options[optionIndex]?.points));
  report("config_validated", sameItems, `json=valid items=${config.items.length}`);
  if (!sameItems) { fail("config_validated", "scoring_config_invalid"); process.exit(1); }
  const rules = await request("GET", "/api/screening/rules");
  report("redflag_ruleset", rules.response.ok, `http=${rules.response.status} rule_count=${Array.isArray(rules.data.items) ? rules.data.items.length : 0}`);
  for (const item of config.items) {
    let answer: Record<string, unknown> = { question_id: item.id, option_id: item.options[0]?.id };
    if (item.id === "bmi") {
      const derived = item.derived_input!;
      answer = { question_id: item.id, height_cm: (derived.height_cm!.min + derived.height_cm!.max) / 2, weight_kg: (derived.weight_kg!.min + derived.weight_kg!.max) / 2 };
    } else if (item.id === "waist") {
      const derived = item.derived_input!;
      answer = { question_id: item.id, waist_cm: (derived.waist_cm!.min + derived.waist_cm!.max) / 2 };
    }
    const saved = await request("POST", "/api/screening/answers", answer);
    if (!saved.response.ok) { report("answer_saved", false, `http=${saved.response.status}`); fail("answer_saved", "answer_invalid_for_version"); process.exit(1); }
  }
  for (const symptom of symptoms.items) {
    const saved = await request("POST", "/api/screening/answers", { question_id: symptom.id, option_id: "no" });
    if (!saved.response.ok) { report("answer_saved", false, `http=${saved.response.status}`); fail("answer_saved", "answer_invalid_for_version"); process.exit(1); }
  }
  report("answers_saved", true, `instrument=${config.items.length} symptoms=${symptoms.items.length}`);
}

if (!sessionId) {
  console.error("Usage: npm run debug:screening -- --new | <existing-session-id>");
  process.exit(2);
}

const trace = db.getScreeningDebugTrace(sessionId) as Trace | undefined;
if (!trace) { report("session_lookup", false, `session=${short(sessionId)} missing`); fail("session_lookup", "session_not_found"); process.exit(1); }
report("session_lookup", true, `id=${short(trace.session.id)} status=${trace.session.status} locale=${trace.session.locale}`);
report("consent_present", trace.consentPresent, trace.consentPresent ? "granted" : "missing");
if (!trace.version) { report("scoring_version", false, "none selected"); fail("scoring_version", "no_active_scoring_version"); process.exit(1); }
report("active_scoring_version_loaded", trace.version.status === "active" || trace.version.status === "draft", `id=${short(trace.version.id)} status=${trace.version.status}${trace.version.status === "draft" ? "; draft selected for demo" : ""}`);
let config: typeof staticConfig;
try { config = JSON.parse(trace.version.config_json) as typeof staticConfig; report("config_validated", true, `json=valid items=${config.items.length}`); }
catch { report("config_validated", false, "invalid JSON"); fail("config_validated", "scoring_config_invalid"); process.exit(1); }
let rulesValid = false;
try { rulesValid = Boolean(trace.ruleset && Array.isArray((JSON.parse(trace.ruleset.rules_json) as { items?: unknown }).items)); } catch { /* Report failure below. */ }
report("redflag_ruleset_loaded", rulesValid, trace.ruleset ? `status=${trace.ruleset.status} json=${rulesValid ? "valid" : "invalid"}` : "missing");
if (!rulesValid) fail("redflag_ruleset_loaded", "redflag_ruleset_missing");
const answerMap = Object.fromEntries(trace.responses.map((answer) => [answer.question_id, answer.option_id]));
const expectedIds = [...config.items.map((item) => item.id), ...symptoms.items.map((item) => item.id)];
const allPresent = expectedIds.every((id) => typeof answerMap[id] === "string");
report("answers_loaded", allPresent, `saved=${trace.responses.length} required=${expectedIds.length}`);
if (!allPresent) fail("answers_loaded", "answers_incomplete");
const allOptionsValid = allPresent && config.items.every((item) => item.options.some((option) => option.id === answerMap[item.id])) && symptoms.items.every((item) => answerMap[item.id] === "yes" || answerMap[item.id] === "no");
report("answer_options_valid", allOptionsValid, `valid=${allOptionsValid ? expectedIds.length : "no"}; option ids omitted`);
if (allPresent && !allOptionsValid) fail("answer_options_valid", "answer_invalid_for_version");
const derivedValid = Boolean(answerMap.bmi && answerMap.waist && answerMap.sex);
report("derived_inputs", derivedValid, `BMI=${answerMap.bmi ? "computed" : "missing"} waist=${answerMap.waist ? "computed" : "missing"}`);
if (!derivedValid) fail("derived_inputs", "derived_input_invalid");
let scored: ReturnType<typeof scoreAssessment> | undefined;
try {
  const scoreAnswers = Object.fromEntries(config.items.map((item) => [item.id, answerMap[item.id]]));
  const symptomModifier = symptoms.items.some((item) => answerMap[item.id] === "yes");
  scored = scoreAssessment(scoreAnswers, config as Parameters<typeof scoreAssessment>[1], symptomModifier);
  report("score_and_band", true, `total=${scored.total} band=${scored.band} symptom_modifier=${symptomModifier}`);
} catch { report("score_and_band", false, "scoring rejected the validated answers"); fail("score_and_band", "scoring_error"); }
if (scored) {
  const recommendation = recommend(scored.band, scored.symptom_modifier_triggered);
  report("recommendation", true, `kind=${recommendation.kind} content_keys=${recommendation.content_block_keys.join(",")}`);
  const blocksFound = recommendation.content_block_keys.every((key) => trace.contentBlocks.some((block) => block.key === key && block.locale === trace.session.locale));
  report("content_blocks", blocksFound, `locale=${trace.session.locale} found=${blocksFound}`);
  if (!blocksFound) fail("content_blocks", "content_block_missing");
}
if (makeNew) console.log(`INFO database_write: completion request pending; before assessment=${trace.assessmentPresent} recommendation=${trace.recommendationPresent}`);
else report("database_write", trace.assessmentPresent && trace.recommendationPresent, `assessment=${trace.assessmentPresent} recommendation=${trace.recommendationPresent}`);
report("audit_chain", trace.audit.ok, `hash_chain=${trace.audit.ok ? "valid" : "invalid"} checked=${trace.audit.checked}`);
report("analytics_events_before_completion", trace.analyticsEvents.length > 0, `session_events=${trace.analyticsEvents.length}`);
if (makeNew && cookie) {
  const completion = await request("POST", "/api/screening/result", {});
  report("completion_response", completion.response.ok && completion.data.fallback !== true, `http=${completion.response.status} band=${completion.data.band ?? "none"} fallback=${completion.data.fallback === true}`);
  if (!completion.response.ok || completion.data.fallback === true) fail("completion_response", "scoring_error");
  const result = await request("GET", "/api/screening/result");
  report("result_response", result.response.ok, `http=${result.response.status} body_keys=${Object.keys(result.data).join(",")}`);
  if (!result.response.ok) fail("result_response", "database_error");
  const completedTrace = db.getScreeningDebugTrace(sessionId) as Trace | undefined;
  report("database_write", Boolean(completedTrace?.assessmentPresent && completedTrace?.recommendationPresent), `assessment=${Boolean(completedTrace?.assessmentPresent)} recommendation=${Boolean(completedTrace?.recommendationPresent)}`);
  report("audit_append", Boolean(completedTrace?.audit.ok && completedTrace.auditAction === "screening_completed"), `completion_audit=${completedTrace?.auditAction === "screening_completed"} hash_chain=${completedTrace?.audit.ok ? "valid" : "invalid"}`);
  report("analytics_event", Boolean(completedTrace?.analyticsEvents.includes("screening_completed")), `completion_event=${Boolean(completedTrace?.analyticsEvents.includes("screening_completed"))}`);
}
if (!firstFailure) console.log("TRACE_COMPLETE all observed stages passed");
