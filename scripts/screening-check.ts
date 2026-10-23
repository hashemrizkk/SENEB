import nextEnv from "@next/env";
import path from "node:path";
import instrument from "../data/screening/findrisc-0.2.json" with { type: "json" };
import content from "../data/screening/content-blocks.json" with { type: "json" };
import { minimumAndMaximumPossible } from "../lib/screening/score.ts";
import { screeningDemoModeEnabled } from "../lib/screening/demo.ts";

nextEnv.loadEnvConfig(process.cwd());
const db = await import("../lib/db.ts");
const snapshot = db.screeningPreflightSnapshot();
type Version = { id: string; instrument_key: string; version_label: string; status: string; config_json: string };
type Ruleset = { id: string; version_label: string; status: string; rules_json: string };
type ContentRow = { key: string; locale: string; status: string };
const versions = snapshot.versions as Version[];
const rulesets = snapshot.rulesets as Ruleset[];
const contentRows = snapshot.contentBlocks as ContentRow[];
const failures: string[] = [];
const demo = screeningDemoModeEnabled();
const check = (name: string, pass: boolean, detail: string, fix?: string) => {
  console.log(`${pass ? "PASS" : "FAIL"} ${name}: ${detail}`);
  if (!pass) { failures.push(name); if (fix) console.log(`  Fix: ${fix}`); }
};
const redact = (id: string) => id.slice(0, 6);
const configuredPath = process.env.HACKATHON_DB_PATH ? path.resolve(process.env.HACKATHON_DB_PATH) : path.join(process.cwd(), "hackathon.db");
check("database path", path.resolve(String(snapshot.databasePath)) === configuredPath, `app database=${snapshot.databasePath}`, "Set HACKATHON_DB_PATH to the same file for the app and this check.");

const schema = snapshot.schema as { table: string; missingTable: boolean; missingColumns: string[] }[];
const missingSchema = schema.filter((table) => table.missingTable || table.missingColumns.length);
check("screening schema", missingSchema.length === 0, missingSchema.length ? missingSchema.map((table) => `${table.table}:${table.missingTable ? "table" : table.missingColumns.join(",")}`).join("; ") : `${schema.length} tables and required columns present`, "Restart the app so its guarded database migrations can create missing screening columns.");

const validVersion = (version: Version) => {
  try {
    const parsed = JSON.parse(version.config_json) as typeof instrument;
    return parsed.key === instrument.key && parsed.version === instrument.version
      && parsed.total_min === instrument.total_min && parsed.total_max === instrument.total_max
      && parsed.items.length === instrument.items.length
      && instrument.items.every((item, index) => item.id === parsed.items[index]?.id
        && item.options.length === parsed.items[index]?.options.length
        && item.options.every((option, optionIndex) => option.id === parsed.items[index]?.options[optionIndex]?.id && option.points === parsed.items[index]?.options[optionIndex]?.points));
  } catch { return false; }
};
const activeVersions = versions.filter((version) => version.status === "active");
const demoVersions = versions.filter((version) => version.status === "draft" && validVersion(version));
const chosenVersion = activeVersions.length === 1 ? activeVersions[0] : demo && activeVersions.length === 0 && demoVersions.length === 1 ? demoVersions[0] : undefined;
check("scoring version", Boolean(chosenVersion), chosenVersion ? `id=${redact(chosenVersion.id)} status=${chosenVersion.status}${chosenVersion.status === "draft" ? " demo-only" : ""}` : `active=${activeVersions.length}; valid draft demo candidates=${demoVersions.length}; demo mode=${demo}`, activeVersions.length === 0 ? `Review/approve through the clinic process, then run npm run scoring:activate <version-id> <admin-username>${demo ? "; demo mode can use exactly one valid draft for local demos" : "; or set SCREENING_DEMO_MODE=true for a clearly labeled demo"}` : "Retire extras so exactly one scoring version is active.");
if (chosenVersion) {
  let parsed: typeof instrument | undefined;
  try { parsed = JSON.parse(chosenVersion.config_json) as typeof instrument; } catch { /* Report below. */ }
  check("scoring config", Boolean(parsed && validVersion(chosenVersion)), `JSON and canonical questionnaire ${parsed ? "match" : "do not match"}`, `Run npm run seed:screening only if this database has not been seeded; inspect the version before activation.`);
  if (parsed) {
    const possible = minimumAndMaximumPossible(parsed as Parameters<typeof minimumAndMaximumPossible>[0]);
    check("score range", possible.min === parsed.total_min && possible.max === parsed.total_max, `computed=${possible.min}–${possible.max}; stated=${parsed.total_min}–${parsed.total_max}`, "Correct the draft config from its documented source, then review it clinically before activation.");
    check("questionnaire items", parsed.items.map((item) => item.id).join("|") === instrument.items.map((item) => item.id).join("|"), `item count=${parsed.items.length}`, "Use the approved instrument version that matches the questionnaire shown to participants.");
  }
}

const activeRulesets = rulesets.filter((ruleset) => ruleset.status === "active");
const demoRulesets = rulesets.filter((ruleset) => ruleset.status === "draft" && (() => { try { return Array.isArray((JSON.parse(ruleset.rules_json) as { items?: unknown }).items); } catch { return false; } })());
const chosenRuleset = activeRulesets.length === 1 ? activeRulesets[0] : demo && activeRulesets.length === 0 && demoRulesets.length === 1 ? demoRulesets[0] : undefined;
check("red-flag ruleset", Boolean(chosenRuleset), chosenRuleset ? `id=${redact(chosenRuleset.id)} status=${chosenRuleset.status}${chosenRuleset.status === "draft" ? " demo-only" : ""}` : `active=${activeRulesets.length}; valid draft demo candidates=${demoRulesets.length}`, activeRulesets.length === 0 ? `Run npm run seed:screening if absent, then follow clinic approval before activation; local demo uses a draft only when SCREENING_DEMO_MODE permits it.` : "Retire extras so exactly one red-flag ruleset is active.");

const expectedKeys = [...new Set((content as { key: string }[]).map((item) => item.key))];
const missingContent = expectedKeys.flatMap((key) => (["en", "ar"] as const).filter((locale) => !contentRows.some((row) => row.key === key && row.locale === locale)).map((locale) => `${key}/${locale}`));
check("content blocks", missingContent.length === 0, missingContent.length ? `missing ${missingContent.join(",")}` : `${expectedKeys.length} keys available in en and ar`, "Run npm run seed:screening if these placeholder blocks are absent; wording and approval status are not changed by this check.");

const audit = snapshot.audit as { ok: boolean; checked: number };
check("audit hash chain", audit.ok, `verified=${audit.checked}`, "Inspect the audit chain before continuing; do not edit or remove audit rows.");
if (failures.length) {
  console.log(`SCREENING CHECK FAIL (${failures.length} prerequisite${failures.length === 1 ? "" : "s"})`);
  if (process.argv.includes("--warn")) { console.warn("Development continues; screening may remain unavailable until prerequisites are fixed."); process.exit(0); }
  process.exitCode = 1;
} else console.log(`SCREENING CHECK PASS${demo && chosenVersion?.status === "draft" ? " (demo-only; warning must remain visible)" : ""}`);
