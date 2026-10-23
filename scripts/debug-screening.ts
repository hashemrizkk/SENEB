import Database from "better-sqlite3";
import nextEnv from "@next/env";
import fs from "node:fs";
import path from "node:path";
import { scoreAssessment } from "../lib/screening/score.ts";
import { recommend } from "../lib/screening/recommend.ts";

nextEnv.loadEnvConfig(process.cwd());
type Locale = "ar" | "en";
const baseUrl = process.env.SCREENING_DEBUG_URL ?? "http://localhost:3000";
const dbPath = process.env.HACKATHON_DB_PATH ?? path.join(process.cwd(), "hackathon.db");
const positional = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const makeNew = process.argv.includes("--new");
const requestedSessionId = positional[0];
const short = (id: unknown) => typeof id === "string" ? id.slice(0, 6) : "none";
const report = (stage: string, ok: boolean, detail: string) => console.log(`${ok ? "PASS" : "FAIL"} ${stage}: ${detail}`);
const fail = (stage: string, code: string) => {
  report(stage, false, code);
  console.log(`FIRST_FAILURE stage=${stage} reason_code=${code}`);
};
const readJson = <T>(file: string): T => JSON.parse(fs.readFileSync(path.join(process.cwd(), "data", "screening", file), "utf8")) as T;
const symptoms = readJson<{ items: { id: string }[] }>("symptom-modifier.json");
const content = readJson<{ key: string; locale: Locale; body: string }[]>("content-blocks.json");
const instrumentStatic = readJson<{ items: { id: string; options: { id: string }[]; derived_input?: Record<string, unknown> }[] }>("findrisc-0.2.json");

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
  try { data = await response.json() as Record<string, unknown>; } catch { /* Response body is not used in the trace. */ }
  return { response, data };
};

if (makeNew) {
  const started = await request("POST", "/api/screening/start", { consent: true, locale: "en" });
  sessionId = typeof started.data.session_id === "string" ? started.data.session_id : undefined;
  report("session_start", started.response.ok && Boolean(sessionId), `http=${started.response.status} session=${short(sessionId)} cookie=${cookie ? "present" : "missing"}`);
  if (!sessionId || !cookie) process.exit(1);
  report("consent", started.response.ok, `consent route http=${started.response.status}`);
  const gate = await request("POST", "/api/screening/redflags", { rule_ids: [], source: "gate" });
  report("redflag_gate", gate.response.ok, `http=${gate.response.status}`);
  if (!gate.response.ok) process.exit(1);

  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  const session = db.prepare("SELECT scoring_version_id FROM anonymous_sessions WHERE id=?").get(sessionId) as { scoring_version_id: string | null } | undefined;
  const version = session?.scoring_version_id ? db.prepare("SELECT config_json,status FROM scoring_versions WHERE id=?").get(session.scoring_version_id) as { config_json: string; status: string } | undefined : undefined;
  db.close();
  if (!version) { fail("active_scoring_version", "no_active_scoring_version"); process.exit(1); }
  const config = JSON.parse(version.config_json) as typeof instrumentStatic & { status?: string };
  report("scoring_version", true, `id=${short(session?.scoring_version_id)} status=${version.status}`);
  const requiredIds = config.items.map((item) => item.id);
  const validConfig = Array.isArray(config.items) && requiredIds.length > 0 && requiredIds.every((id) => typeof id === "string");
  report("config_validated", validConfig, `items=${requiredIds.length} json=valid`);
  const rules = await request("GET", "/api/screening/rules");
  report("redflag_ruleset", rules.response.ok, `http=${rules.response.status} rules=${Array.isArray(rules.data.items) ? rules.data.items.length : 0}`);
  for (const item of config.items) {
    let body: Record<string, unknown> = { question_id: item.id, option_id: item.options[0]?.id };
    if (item.id === "bmi") {
      const derived = item.derived_input as { height_cm?: { min: number; max: number }; weight_kg?: { min: number; max: number } };
      body = { question_id: item.id, height_cm: (derived.height_cm!.min + derived.height_cm!.max) / 2, weight_kg: (derived.weight_kg!.min + derived.weight_kg!.max) / 2 };
    }
    if (item.id === "waist") {
      const derived = item.derived_input as { waist_cm?: { min: number; max: number } };
      body = { question_id: item.id, waist_cm: (derived.waist_cm!.min + derived.waist_cm!.max) / 2 };
    }
    const saved = await request("POST", "/api/screening/answers", body);
    if (!saved.response.ok) { fail("answer_saved", "answer_invalid_for_version"); process.exit(1); }
  }
  for (const item of symptoms.items) {
    const saved = await request("POST", "/api/screening/answers", { question_id: item.id, option_id: "no" });
    if (!saved.response.ok) { fail("answer_saved", "answer_invalid_for_version"); process.exit(1); }
  }
  report("answers_loaded", true, `instrument=${requiredIds.length} symptoms=${symptoms.items.length} total=${requiredIds.length + symptoms.items.length}`);
}

if (!sessionId) {
  console.error("Usage: npm run debug:screening -- --new | <existing-session-id>");
  process.exit(2);
}

const db = new Database(dbPath, { readonly: true, fileMustExist: true });
const session = db.prepare("SELECT id,status,locale,scoring_version_id,redflag_ruleset_id FROM anonymous_sessions WHERE id=?").get(sessionId) as { id: string; status: string; locale: Locale; scoring_version_id: string | null; redflag_ruleset_id: string | null } | undefined;
if (!session) { fail("session_lookup", "session_not_found"); db.close(); process.exit(1); }
report("session_lookup", true, `id=${short(session.id)} status=${session.status} locale=${session.locale}`);
const consent = db.prepare("SELECT 1 FROM consent_records WHERE session_id=? AND granted=1 LIMIT 1").get(sessionId);
report("consent_present", Boolean(consent), consent ? "granted" : "missing");
const version = session.scoring_version_id ? db.prepare("SELECT id,status,config_json FROM scoring_versions WHERE id=?").get(session.scoring_version_id) as { id: string; status: string; config_json: string } | undefined : undefined;
if (!version) { fail("active_scoring_version", "no_active_scoring_version"); db.close(); process.exit(1); }
report("active_scoring_version", true, `id=${short(version.id)} status=${version.status}`);
let config: typeof instrumentStatic;
try { config = JSON.parse(version.config_json) as typeof instrumentStatic; report("config_validated", true, `json=valid items=${config.items.length}`); }
catch { fail("config_validated", "scoring_config_invalid"); db.close(); process.exit(1); }
const ruleset = session.redflag_ruleset_id ? db.prepare("SELECT status,rules_json FROM redflag_rulesets WHERE id=?").get(session.redflag_ruleset_id) as { status: string; rules_json: string } | undefined : undefined;
let rulesOk = false;
try { rulesOk = Boolean(ruleset && Array.isArray((JSON.parse(ruleset.rules_json) as { items?: unknown }).items)); } catch { /* Report below. */ }
report("redflag_ruleset", rulesOk, ruleset ? `status=${ruleset.status} json=${rulesOk ? "valid" : "invalid"}` : "missing");
const responses = db.prepare("SELECT question_id,option_id FROM survey_responses WHERE session_id=?").all(sessionId) as { question_id: string; option_id: string }[];
const answerMap = Object.fromEntries(responses.map((answer) => [answer.question_id, answer.option_id]));
const expectedIds = [...config.items.map((item) => item.id), ...symptoms.items.map((item) => item.id)];
report("answers_loaded", true, `saved=${responses.length} required=${expectedIds.length}`);
const answersValid = expectedIds.every((id) => typeof answerMap[id] === "string") && config.items.every((item) => item.options.some((option) => option.id === answerMap[item.id]) || item.id === "bmi" || item.id === "waist") && symptoms.items.every((item) => answerMap[item.id] === "yes" || answerMap[item.id] === "no");
report("answer_options_valid", answersValid, `valid=${answersValid ? expectedIds.length : "no"} option_ids=not_printed`);
report("derived_inputs", Boolean(answerMap.bmi && answerMap.waist && answerMap.sex), `bmi_category=${answerMap.bmi ? "computed" : "missing"} waist_category=${answerMap.waist ? "computed" : "missing"}`);
const symptomTriggered = symptoms.items.some((item) => answerMap[item.id] === "yes");
let scoreResult: ReturnType<typeof scoreAssessment> | undefined;
try {
  scoreResult = scoreAssessment(answerMap, config as Parameters<typeof scoreAssessment>[1], symptomTriggered);
  report("score_computed", true, `total=${scoreResult.total} band=${scoreResult.band}`);
} catch (error) {
  const message = error instanceof Error ? error.message : "unknown";
  const code = message.startsWith("Unexpected answer:") ? "scoring_error" : "scoring_error";
  fail("score_computed", code);
  console.log(`score_exception=${message.replace(/Unexpected answer: [a-z0-9_-]+\./, "Unexpected answer: <symptom-field>.")}`);
}
let suggestion: ReturnType<typeof recommend> | undefined;
if (scoreResult) {
  suggestion = recommend(scoreResult.band, scoreResult.symptom_modifier_triggered);
  report("band_and_recommendation", true, `band=${scoreResult.band} kind=${suggestion.kind}`);
  const present = suggestion.content_block_keys.every((key) => content.some((block) => block.key === key && block.locale === session.locale));
  report("content_blocks", present, `keys=${suggestion.content_block_keys.join(",")} locale=${session.locale}`);
} else report("band_and_recommendation", false, "not reached");
const storedAssessment = db.prepare("SELECT 1 FROM risk_assessments WHERE session_id=? LIMIT 1").get(sessionId);
const storedRecommendation = db.prepare("SELECT 1 FROM recommendations r JOIN risk_assessments a ON a.id=r.assessment_id WHERE a.session_id=? LIMIT 1").get(sessionId);
report("database_write", Boolean(storedAssessment && storedRecommendation), `assessment=${Boolean(storedAssessment)} recommendation=${Boolean(storedRecommendation)}`);
const chain = db.prepare("SELECT COUNT(*) n FROM audit_log").get() as { n: number };
const audit = db.prepare("SELECT action FROM audit_log WHERE entity_id=? ORDER BY id DESC LIMIT 1").get(sessionId) as { action: string } | undefined;
report("audit_and_analytics", Boolean(audit) && chain.n > 0, `chain_rows=${chain.n} session_last_action=${audit?.action ?? "none"}`);
db.close();

if (makeNew && cookie) {
  const completion = await request("POST", "/api/screening/result", {});
  report("result_post", completion.response.ok, `http=${completion.response.status} fallback=${completion.data.fallback === true} band=${completion.data.band ?? "none"}`);
  const result = await request("GET", "/api/screening/result");
  report("result_response", result.response.ok, `http=${result.response.status} error=${typeof result.data.error === "string" ? result.data.error : "none"}`);
}

if (makeNew && !cookie) process.exit(1);
