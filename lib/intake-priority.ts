import { assessIntake } from "./case-assessment.ts";
import type { IntakeFields } from "./intake.ts";
import type { SuggestedPriority } from "./priority-rules.ts";

export function priorityForIntake(
  fields: IntakeFields,
  rawText: string | null,
  needsReview: boolean,
) {
  return assessIntake({
    fields,
    rawText,
    hasIntake: true,
    needsReview,
  }).suggestion;
}

export function priorityIfUnset(
  existing: SuggestedPriority,
  suggested: SuggestedPriority,
): SuggestedPriority {
  return existing ?? suggested;
}

export function autoPriorityMetadata(
  fields: IntakeFields,
  rawText: string | null,
  needsReview: boolean,
) {
  const suggestion = priorityForIntake(fields, rawText, needsReview);
  const priority = priorityIfUnset(null, suggestion.priority);
  return {
    priority,
    revision_reason: priority ? "Priority source: auto (rules)." : null,
    suggestion,
  };
}
