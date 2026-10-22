import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const css = readFileSync(fileURLToPath(new URL("./tokens.css", import.meta.url)), "utf8");
const token = (name) => {
  const match = css.match(new RegExp(`--${name}:\\s*(#[0-9A-Fa-f]{6})`));
  if (!match) throw new Error(`Missing color token --${name}`);
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
  ["Body text / background", "text", "bg", 4.5],
  ["Body text / surface", "text", "surface", 4.5],
  ["Secondary text / background", "text-secondary", "bg", 4.5],
  ["Secondary text / surface", "text-secondary", "surface", 4.5],
  ["Primary button text / strong", "surface", "primary-strong", 4.5],
  ["Primary button text / hover", "surface", "primary-hover", 4.5],
  ["Control border / background", "control-border", "bg", 3],
  ["Control border / surface", "control-border", "surface", 3],
  ["Focus ring / background", "focus-ring", "bg", 3],
  ["Focus ring / surface", "focus-ring", "surface", 3],
  ["Focus gap / primary button", "focus-gap", "primary-strong", 3],
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
