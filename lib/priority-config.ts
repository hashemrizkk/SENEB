// PLACEHOLDER clinical rules written by an AI assistant. Must be reviewed by a clinician before any real use.
export const RULES_VERSION = "v1-placeholder";
export const HYPO_URGENT_AT = 3;
export const HBA1C_OVERDUE_DAYS = 180;
export const FOOT_EXAM_OVERDUE_DAYS = 365;
export const BP_OVERDUE_DAYS = 180;
export const BANNED_SUMMARY_TERMS = [
  "urgent",
  "emergency",
  "immediately",
  "diagnos",
  "prescrib",
  "recommend",
  "should",
  "severe",
  "critical",
  "high risk",
  "low risk",
] as const;
