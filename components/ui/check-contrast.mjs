import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const css = readFileSync(fileURLToPath(new URL("./tokens.css", import.meta.url)), "utf8");
const token = (name) => {
  const match = css.match(new RegExp(`--${name}:\\s*(#[0-9A-Fa-f]{6})`));
  if (!match) throw new Error(`Missing literal color token --${name}`);
  return match[1];
};
const luminance = (hex) => {
  const channels = hex.slice(1).match(/.{2}/g).map((value) => parseInt(value, 16) / 255);
  const [r, g, b] = channels.map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
};

const checks = [
  ["Ink / limestone", "ink", "bg", 4.5],
  ["Ink / surface", "ink", "surface", 4.5],
  ["Home muted text / limestone", "ink-muted", "bg", 4.5],
  ["Demo banner text / background", "demo-ink", "demo-bg", 4.5],
  ["Secondary ink / limestone", "ink-secondary", "bg", 4.5],
  ["Secondary ink / surface", "ink-secondary", "surface", 4.5],
  ["Primary button / surface", "surface", "primary", 4.5],
  ["Primary button / hover", "surface", "primary-hover", 4.5],
  ["Pressed selected text / tint", "primary-press", "primary-tint", 4.5],
  ["Control border / limestone", "control-border", "bg", 3],
  ["Control border / surface", "control-border", "surface", 3],
  ["Focus ring / limestone", "focus-ring", "bg", 3],
  ["Focus ring / surface", "focus-ring", "surface", 3],
  ["Primary progress fill / track", "primary", "track", 3],
  ...["urgent", "important", "normal", "info", "success"].flatMap((status) => [
    [`${status} text / tint`, `${status}-text`, `${status}-bg`, 4.5],
    [`${status} border / tint`, `${status}-border`, `${status}-bg`, 3],
  ]),
];

let failed = false;
console.log("Contrast pair | foreground | background | ratio | minimum | result");
for (const [label, foregroundToken, backgroundToken, minimum] of checks) {
  const foreground = token(foregroundToken);
  const background = token(backgroundToken);
  const value = ratio(foreground, background);
  const pass = value >= minimum;
  failed ||= !pass;
  console.log(`${label} | ${foreground} | ${background} | ${value.toFixed(2)}:1 | ${minimum}:1 | ${pass ? "PASS" : "FAIL"}`);
}
if (failed) process.exitCode = 1;
