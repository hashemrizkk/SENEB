import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

const root = process.cwd();
const buildRoot = join(root, ".next");
const baselinePath = join(root, "ui-evidence", "bundle-budget-baseline.json");
const recordBaseline = process.argv.includes("--record-baseline");
const recordCurrent = process.argv.includes("--record-current");
const visitFiles = (directory, predicate) => {
  const files = [];
  const visit = (path) => {
    for (const name of readdirSync(path)) {
      const full = join(path, name);
      if (statSync(full).isDirectory()) visit(full);
      else if (predicate(name, full)) files.push(full);
    }
  };
  visit(directory);
  return files;
};
const normalizeAsset = (asset) => asset.replace(/^\/+/, "").replace(/^_next\//, "");
const assetSize = (assets) => [...new Set(assets)].reduce((total, asset) => {
  const path = join(buildRoot, normalizeAsset(asset));
  return total + (statSync(path, { throwIfNoEntry: false })?.size ?? 0);
}, 0);

const routeManifests = visitFiles(join(buildRoot, "server", "app"), (name) => name === "page_client-reference-manifest.js");
if (!routeManifests.length) {
  console.error("FAIL check:budget: run npm run build first so Next.js route manifests exist.");
  process.exit(2);
}

const current = {};
for (const manifestPath of routeManifests) {
  const routeFolder = relative(join(buildRoot, "server", "app"), manifestPath).split(sep).slice(0, -1);
  const route = routeFolder.length === 1 && routeFolder[0] === "page" ? "/" : `/${routeFolder.filter((part) => part !== "page").join("/")}`;
  const source = readFileSync(manifestPath, "utf8");
  const assignment = source.match(/=\s*(\{[\s\S]*\});/);
  if (!assignment) throw new Error(`Cannot parse Next build manifest: ${relative(root, manifestPath)}`);
  const manifest = JSON.parse(assignment[1]);
  const jsAssets = Object.values(manifest.entryJSFiles ?? {}).flat();
  const cssAssets = Object.values(manifest.entryCSSFiles ?? {}).flat().map((entry) => entry.path);
  const fontManifestPath = join(manifestPath, "..", "page", "next-font-manifest.json");
  const alternativeFontManifestPath = join(manifestPath, "..", "next-font-manifest.json");
  const fontManifest = [fontManifestPath, alternativeFontManifestPath]
    .find((path) => statSync(path, { throwIfNoEntry: false })?.isFile());
  const fontAssets = fontManifest
    ? Object.values(JSON.parse(readFileSync(fontManifest, "utf8")).app ?? {}).flat()
    : [];
  current[route] = {
    jsBytes: assetSize(jsAssets),
    cssBytes: assetSize(cssAssets),
    fontBytes: assetSize(fontAssets),
  };
}

if (recordBaseline) {
  writeFileSync(baselinePath, `${JSON.stringify({ source: "existing coral-theme production build before Nile theme migration", routes: current }, null, 2)}\n`);
  console.log(`Recorded pre-change bundle sizes for ${Object.keys(current).length} routes in ${relative(root, baselinePath)}.`);
  for (const [route, size] of Object.entries(current)) console.log(`${route} | JS ${size.jsBytes} B | CSS ${size.cssBytes} B | fonts ${size.fontBytes} B`);
  process.exit(0);
}

if (recordCurrent) {
  const reportPath = join(root, "ui-evidence", "bundle-budget-current.json");
  writeFileSync(reportPath, `${JSON.stringify({ source: "Nile teal Phase 1 production build", routes: current }, null, 2)}\n`);
  console.log(`Recorded current bundle sizes for ${Object.keys(current).length} routes in ${relative(root, reportPath)}.`);
  for (const [route, size] of Object.entries(current)) console.log(`${route} | JS ${size.jsBytes} B | CSS ${size.cssBytes} B | fonts ${size.fontBytes} B`);
  process.exit(0);
}

const baseline = JSON.parse(readFileSync(baselinePath, "utf8")).routes;
const failures = [];
console.log("Route | JS before → after | change | CSS after | font after | result");
for (const [route, after] of Object.entries(current).sort(([a], [b]) => a.localeCompare(b))) {
  const before = baseline[route];
  if (!before) {
    console.log(`${route} | no baseline | — | ${after.cssBytes} B | ${after.fontBytes} B | NEW`);
    continue;
  }
  const change = before.jsBytes === 0 ? 0 : ((after.jsBytes - before.jsBytes) / before.jsBytes) * 100;
  const pass = change <= 10;
  if (!pass) failures.push(`${route}: client JS grew ${change.toFixed(1)}% (limit 10%)`);
  console.log(`${route} | ${before.jsBytes} B → ${after.jsBytes} B | ${change >= 0 ? "+" : ""}${change.toFixed(1)}% | ${after.cssBytes} B | ${after.fontBytes} B | ${pass ? "PASS" : "FAIL"}`);
}
for (const route of Object.keys(baseline)) if (!current[route]) console.log(`${route} | route is no longer in the production build`);
if (failures.length) {
  console.error(`FAIL check:budget (${failures.length} route(s) exceed the 10% JS growth limit)`);
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`PASS check:budget (${Object.keys(current).length} route manifests; client JS growth at or below 10%)`);
}
