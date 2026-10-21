import { findAllOccurrences, normalizeWithMap } from "./text-normalize.ts";

// STARTER LIST written by an AI assistant. Must be reviewed by a clinician before any real use. Edit freely.
export const lexicon = [
  {
    id: "loss_of_consciousness",
    tier: "critical",
    category: "loss of consciousness",
    terms: ["أغمى عليا", "اغماء", "فقدت الوعي", "fainted", "passed out"],
  },
  {
    id: "chest_pain",
    tier: "critical",
    category: "chest pain",
    terms: ["وجع في صدري", "الم في صدري", "الم في الصدر", "chest pain"],
  },
  {
    id: "breathing_difficulty",
    tier: "critical",
    category: "breathing difficulty",
    terms: ["ضيق نفس", "ضيق في التنفس", "مش قادر اتنفس", "short of breath"],
  },
  {
    id: "confusion",
    tier: "critical",
    category: "confusion",
    terms: ["مش مركز", "تشوش", "تايه", "confused"],
  },
  {
    id: "vomiting",
    tier: "critical",
    category: "vomiting",
    terms: ["استفراغ", "قيء", "رجعت", "بترجع", "vomiting"],
  },
  {
    id: "hypoglycemia_symptoms",
    tier: "warning",
    category: "hypoglycemia symptoms",
    terms: ["دوخه", "دوخة", "عرق", "رعشه", "رعشة", "رجفه", "dizzy", "sweating", "shaking"],
  },
  {
    id: "foot_wound",
    tier: "warning",
    category: "foot wound",
    terms: ["جرح في رجلي", "صديد", "غرغرينا", "رجلي ورمت", "foot wound", "pus"],
  },
  {
    id: "vision",
    tier: "warning",
    category: "vision change",
    terms: ["زغلله", "مش شايف", "نظري", "blurry vision"],
  },
  {
    id: "high_sugar",
    tier: "warning",
    category: "high sugar",
    terms: ["السكر عالي", "سكر عالي", "high sugar"],
  },
] as const;

export type LexiconTier = (typeof lexicon)[number]["tier"];
export type LexiconMatch = {
  id: string;
  tier: LexiconTier;
  category: string;
  term: string;
  start: number;
  end: number;
  negation_nearby: boolean;
};

const negationWords = [
  "مفيش",
  "مافيش",
  "ما",
  "مش",
  "لا",
  "بدون",
  "no",
  "not",
  "without",
  "mafish",
];
const normalizedNegations = new Set(
  negationWords.map((word) => normalizeWithMap(word).normalized),
);
const normalizedLexicon = lexicon.map((entry) => ({
  ...entry,
  terms: entry.terms.map((term) => ({
    term,
    normalized: normalizeWithMap(term).normalized,
  })),
}));

function hasNearbyNegation(text: string, matchStart: number): boolean {
  const precedingWords = normalizeWithMap(text.slice(0, matchStart))
    .normalized
    .split(" ")
    .filter(Boolean)
    .slice(-3);
  return precedingWords.some((word) => normalizedNegations.has(word));
}

export function matchLexicon(text: string): LexiconMatch[] {
  const matches = new Map<string, LexiconMatch>();
  for (const entry of normalizedLexicon) {
    for (const { normalized } of entry.terms) {
      for (const occurrence of findAllOccurrences(text, normalized)) {
        const key = `${entry.id}:${occurrence.start}:${occurrence.end}`;
        if (!matches.has(key)) {
          matches.set(key, {
            id: entry.id,
            tier: entry.tier,
            category: entry.category,
            term: text.slice(occurrence.start, occurrence.end),
            ...occurrence,
            negation_nearby: hasNearbyNegation(text, occurrence.start),
          });
        }
      }
    }
  }
  return [...matches.values()].sort(
    (left, right) =>
      left.start - right.start ||
      left.end - right.end ||
      left.id.localeCompare(right.id),
  );
}
