import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const sourceRoots = ["app", "components"];
const files = [];
for (const sourceRoot of sourceRoots) {
  const visit = (path) => {
    for (const name of readdirSync(path)) {
      const full = join(path, name);
      if (statSync(full).isDirectory()) visit(full);
      else if (/\.(?:css|tsx|ts)$/.test(name)) files.push(full);
    }
  };
  visit(join(root, sourceRoot));
}

const failures = [];
const keyframes = new Map();
const readBalancedBlock = (source, openIndex) => {
  let depth = 0;
  for (let index = openIndex; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) return { body: source.slice(openIndex + 1, index), end: index + 1 };
    }
  }
  return { body: "", end: source.length };
};
const mediaContains = (source, mediaPattern, targetIndex) => {
  const pattern = new RegExp(mediaPattern, "gi");
  for (const match of source.matchAll(pattern)) {
    const openIndex = source.indexOf("{", match.index + match[0].length);
    if (openIndex < 0 || openIndex > targetIndex) continue;
    const block = readBalancedBlock(source, openIndex);
    if (targetIndex < block.end) return true;
  }
  return false;
};

const sourceByFile = new Map();
for (const file of files) {
  const source = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  sourceByFile.set(file, source);
  for (const match of source.matchAll(/@keyframes\s+([\w-]+)\s*\{/g)) {
    const block = readBalancedBlock(source, source.indexOf("{", match.index));
    const declarations = [...block.body.matchAll(/(?:^|[;{\n])\s*([\w-]+)\s*:\s*([^;}\n]+)/g)];
    for (const declaration of declarations) {
      if (!["transform", "opacity"].includes(declaration[1].toLowerCase())) {
        failures.push(`${relative(root, file)}: @keyframes ${match[1]} animates disallowed property ${declaration[1]}`);
      }
    }
    keyframes.set(match[1], file);
  }
}

for (const [file, source] of sourceByFile) {
  const display = relative(root, file);
  for (const match of source.matchAll(/(?:^|[;{\n])\s*(transition|animation)\s*:\s*([^;}\n]+)/g)) {
    const kind = match[1].toLowerCase();
    const value = match[2].trim().replace(/["']/g, "").replace(/\s*!important\s*$/i, "").trim();
    if (value === "none") continue;
    if (!mediaContains(source, /@media\s*\(\s*prefers-reduced-motion\s*:\s*no-preference\s*\)/i, match.index)) {
      failures.push(`${display}: ${kind} must be inside prefers-reduced-motion: no-preference`);
    }
    if (kind === "transition") {
      for (const part of value.split(",")) {
        const property = part.trim().split(/\s+/)[0];
        if (!["transform", "opacity"].includes(property)) {
          failures.push(`${display}: transition may animate only transform or opacity (${property})`);
        }
      }
    } else {
      const names = [...value.matchAll(/(?:^|\s)([\w-]+)(?=\s|$)/g)].map((item) => item[1]);
      const name = names.find((item) => keyframes.has(item));
      if (!name) failures.push(`${display}: animation must reference a checked @keyframes rule`);
    }
  }

  for (const match of source.matchAll(/:hover\b/g)) {
    if (!mediaContains(source, /@media\s*\([^)]*hover\s*:\s*hover[^)]*\)/i, match.index)) {
      failures.push(`${display}: :hover styles must be inside @media (hover: hover)`);
    }
  }

  for (const match of source.matchAll(/(?:^|[;{\n])\s*(transition-property|animation-timing-function|animation-fill-mode|animation-direction|animation-iteration-count|animation-play-state|animation-composition)\s*:\s*([^;}\n]+)/g)) {
    const [property, value] = [match[1].toLowerCase(), match[2].trim()];
    if (property === "transition-property" && value !== "none" && value.split(",").some((name) => !["transform", "opacity"].includes(name.trim()))) {
      failures.push(`${display}: transition-property may contain only transform or opacity`);
    }
  }
}

if (failures.length) {
  console.error(`FAIL check:animations (${failures.length})`);
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`PASS check:animations (${files.length} source files checked; ${keyframes.size} keyframes use only transform/opacity)`);
}
