// Placeholder. Must be reviewed by a clinician before any real use.
import type { IntakeFields } from "./intake.ts";
import { BP_OVERDUE_DAYS, FOOT_EXAM_OVERDUE_DAYS, HBA1C_OVERDUE_DAYS } from "./priority-config.ts";
import { lexicon, matchLexicon, type LexiconMatch } from "./lexicon.ts";

export const NOTE_RULES_VERSION = "note-v1-placeholder";

export type NoteChecklistItem = {
  id: string;
  label: string;
  severity_if_missing: "red" | "yellow";
  reason: string;
  anchors: string[];
};

export type NoteChecklistInput = {
  intake: {
    fields: IntakeFields;
    rawText: string | null;
    redFlags?: unknown;
    lexiconMatches?: LexiconMatch[];
  } | null;
  patientDates: {
    last_foot_exam_date: string | null;
    last_bp_date: string | null;
    last_hba1c_date: string | null;
  };
  today: Date;
};

const BASE_ANCHORS = {
  hypoglycemia: ["هبوط", "سكر", "hypoglycemia", "hypo", "glucose", "low sugar", "دوخة", "dizziness", "insulin", "انسولين", "جرعة"],
  foot: ["رجل", "قدم", "foot", "feet", "ulcer", "wound", "جرح", "neuropathy", "monofilament", "تنميل"],
  vision: ["نظر", "عين", "vision", "eye", "retina", "شبكية", "زغللة"],
  medication: ["دوا", "علاج", "medication", "adherence", "compliance", "الجرعة", "التزام"],
  bp: ["ضغط", "BP", "blood pressure", "mmHg"],
  hba1c: ["HbA1c", "A1c", "سكر تراكمي", "التراكمي"],
  followup: ["متابعة", "زيارة", "موعد", "follow-up", "follow up", "next visit", "review", "بعد"],
} as const;

const CATEGORY_EXTRAS: Record<string, string[]> = {
  "chest pain": ["صدر", "chest", "ECG", "رسم قلب"],
  "loss of consciousness": ["إغماء", "اغماء", "وعي", "fainted", "passed out"],
  "breathing difficulty": ["تنفس", "نفس", "breathing", "short of breath"],
  confusion: ["تشوش", "مش مركز", "confused"],
  vomiting: ["قيء", "استفراغ", "vomiting"],
};

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function lexiconAnchors(id: string): string[] {
  const entry = lexicon.find((item) => item.id === id);
  return unique([...(entry?.terms ?? []), ...(CATEGORY_EXTRAS[entry?.category ?? ""] ?? [])]);
}

function isOverdue(date: string | null, threshold: number, today: Date): boolean {
  if (!date) return true;
  const dateMs = Date.parse(`${date.slice(0, 10)}T00:00:00.000Z`);
  if (!Number.isFinite(dateMs)) return true;
  const todayMs = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return Math.floor((todayMs - dateMs) / 86_400_000) > threshold;
}

export function buildRequiredItems(input: NoteChecklistInput): NoteChecklistItem[] {
  const items = new Map<string, NoteChecklistItem>();
  const add = (item: NoteChecklistItem) => items.set(item.id, item);
  const intake = input.intake;
  const matches = intake
    ? intake.lexiconMatches ?? matchLexicon(intake.rawText ?? "")
    : [];
  const matchedIds = new Set(matches.map((match) => match.id));
  const fields = intake?.fields;

  if (fields && (fields.hypoglycemia_episodes !== null && fields.hypoglycemia_episodes > 0 || fields.hypoglycemia_symptoms === true || matchedIds.has("hypoglycemia_symptoms"))) {
    add({ id: "intake_hypoglycemia", label: "Low-sugar episodes or symptoms", severity_if_missing: "red", reason: fields.hypoglycemia_episodes && fields.hypoglycemia_episodes > 0 ? `Patient reported ${fields.hypoglycemia_episodes} low-sugar episodes` : "Low-sugar symptoms were reported", anchors: [...BASE_ANCHORS.hypoglycemia] });
  }
  if (fields && (fields.foot_problem === true || matchedIds.has("foot_wound"))) {
    add({ id: "intake_foot_problem", label: "Reported foot problem", severity_if_missing: "red", reason: "Patient data reports a foot problem", anchors: unique([...BASE_ANCHORS.foot, ...lexiconAnchors("foot_wound")]) });
  }
  if (fields && (fields.vision_change === true || matchedIds.has("vision"))) {
    add({ id: "intake_vision_change", label: "Reported vision change", severity_if_missing: "red", reason: "Patient data reports a vision change", anchors: unique([...BASE_ANCHORS.vision, ...lexiconAnchors("vision")]) });
  }

  if (intake) {
    const critical = new Set(matches.filter((match) => match.tier === "critical").map((match) => match.id));
    for (const id of critical) {
      const entry = lexicon.find((item) => item.id === id);
      if (!entry) continue;
      const categoryId = entry.category.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
      add({ id: `intake_critical_${categoryId}`, label: `Patient-mentioned ${entry.category}`, severity_if_missing: "red", reason: `The patient's submitted text matched the ${entry.category} keyword category`, anchors: lexiconAnchors(id) });
    }
    const warning = new Set(matches.filter((match) => match.tier === "warning").map((match) => match.id));
    for (const id of warning) {
      if ((id === "hypoglycemia_symptoms" && items.has("intake_hypoglycemia")) || (id === "foot_wound" && items.has("intake_foot_problem")) || (id === "vision" && items.has("intake_vision_change"))) continue;
      const entry = lexicon.find((item) => item.id === id);
      if (!entry) continue;
      const categoryId = entry.category.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
      add({ id: `intake_warning_${categoryId}`, label: `Patient-mentioned ${entry.category}`, severity_if_missing: "yellow", reason: `The patient's submitted text matched the ${entry.category} keyword category`, anchors: lexiconAnchors(id) });
    }
    if (fields?.missed_doses === true) add({ id: "intake_missed_doses", label: "Missed medication doses", severity_if_missing: "yellow", reason: "Patient reported missed medication doses", anchors: [...BASE_ANCHORS.medication] });
  }

  if (isOverdue(input.patientDates.last_foot_exam_date, FOOT_EXAM_OVERDUE_DAYS, input.today) && !items.has("intake_foot_problem")) {
    add({ id: "foot_exam", label: "Foot examination follow-up", severity_if_missing: "yellow", reason: input.patientDates.last_foot_exam_date ? `Last foot examination was more than ${FOOT_EXAM_OVERDUE_DAYS} days ago` : "No foot examination date is recorded", anchors: [...BASE_ANCHORS.foot] });
  }
  if (isOverdue(input.patientDates.last_bp_date, BP_OVERDUE_DAYS, input.today)) add({ id: "bp", label: "Blood pressure follow-up", severity_if_missing: "yellow", reason: input.patientDates.last_bp_date ? `Last blood pressure date was more than ${BP_OVERDUE_DAYS} days ago` : "No blood pressure date is recorded", anchors: [...BASE_ANCHORS.bp] });
  if (isOverdue(input.patientDates.last_hba1c_date, HBA1C_OVERDUE_DAYS, input.today)) add({ id: "hba1c", label: "HbA1c follow-up", severity_if_missing: "yellow", reason: input.patientDates.last_hba1c_date ? `Last HbA1c date was more than ${HBA1C_OVERDUE_DAYS} days ago` : "No HbA1c date is recorded", anchors: [...BASE_ANCHORS.hba1c] });
  add({ id: "followup_plan", label: "Follow-up plan", severity_if_missing: "yellow", reason: "A follow-up plan is always recorded for this visit", anchors: [...BASE_ANCHORS.followup] });
  return [...items.values()];
}
