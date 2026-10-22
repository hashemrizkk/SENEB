import { execFileSync } from "node:child_process";

const base = process.env.UI_SCOPE_BASE ?? "UI-Implementation";
const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
let tracked;
try {
  tracked = git("diff", "--name-only", base);
} catch {
  console.error(`FAIL check:scope: base ref '${base}' is not available. Set UI_SCOPE_BASE to the branch this redesign started from.`);
  process.exit(2);
}
const untracked = git("ls-files", "--others", "--exclude-standard");
const changed = [...new Set(`${tracked}\n${untracked}`.split(/\r?\n/).filter(Boolean))];
const protectedPath = /^(?:lib\/|app\/api\/|scripts\/|tests?\/|__tests__\/|middleware(?:\/|\.)|.*\.(?:test|spec)\.[cm]?[jt]sx?$|.*(?:schema|migration|database|auth|db)[^/]*\.[cm]?[jt]sx?$|\.env(?:\..*)?$|AGENTS\.md$)/i;
const violations = changed.filter((path) => protectedPath.test(path.replaceAll("\\", "/")));
if (violations.length) {
  console.error("FAIL check:scope: protected paths differ from the base branch:");
  console.error(violations.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`PASS check:scope against ${base} (${changed.length} changed paths; no protected-path diffs)`);
}
