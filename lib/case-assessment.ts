import { redFlags } from "./rules.ts";
import type { IntakeFields } from "./intake.ts";
import { matchLexicon } from "./lexicon.ts";
import {
  detectInconsistencies,
  suggestPriority,
} from "./priority-rules.ts";

export function assessIntake(input: {
  fields: IntakeFields;
  rawText: string | null;
  hasIntake: boolean;
  needsReview: boolean;
}) {
  const text = input.rawText ?? "";
  const flags = redFlags(input.fields);
  const lexiconMatches = matchLexicon(text);
  const structured = {
    missed_doses: input.fields.missed_doses,
    hypoglycemia_episodes: input.fields.hypoglycemia_episodes,
    hypoglycemia_symptoms: input.fields.hypoglycemia_symptoms,
    foot_problem: input.fields.foot_problem,
    vision_change: input.fields.vision_change,
  };
  return {
    flags,
    lexiconMatches,
    inconsistencies: detectInconsistencies(
      structured,
      lexiconMatches,
      text,
    ),
    suggestion: suggestPriority({
      hasIntake: input.hasIntake,
      needsReview: input.needsReview,
      structured,
      redFlags: flags,
      unanswered: flags.unanswered,
      lexiconMatches,
    }),
  };
}
