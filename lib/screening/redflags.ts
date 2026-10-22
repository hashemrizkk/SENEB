export type RedFlagRule = { id: string; en: string; ar: string };
export function matchRedFlags(selected: unknown, rules: RedFlagRule[]): string[] {
  if (!Array.isArray(selected) || selected.some((item) => typeof item !== "string")) throw new TypeError("Red-flag answers must be a list of rule ids.");
  const allowed = new Set(rules.map((rule) => rule.id));
  if (selected.some((item) => !allowed.has(item))) throw new RangeError("Unknown red-flag rule.");
  return [...new Set(selected as string[])];
}
