// PLACEHOLDER priority tiers written by an AI assistant. Must be reviewed by a clinician before any real use.
import type { IntakeFields } from "./intake.ts";
import type { LexiconMatch } from "./lexicon.ts";
import { HYPO_URGENT_AT } from "./priority-config.ts";
import { findAllOccurrences } from "./text-normalize.ts";
import type { RedFlagResult } from "./rules.ts";

export type SuggestedPriority = "urgent" | "important" | "normal" | null;

export type PriorityReason = {
  rule_id: string;
  text: string;
};

export type PriorityInput = {
  hasIntake: boolean;
  needsReview: boolean;
  structured: Pick<
    IntakeFields,
    | "missed_doses"
    | "hypoglycemia_episodes"
    | "hypoglycemia_symptoms"
    | "foot_problem"
    | "vision_change"
  >;
  redFlags: RedFlagResult;
  unanswered: string[];
  lexiconMatches: LexiconMatch[];
};

export type PrioritySuggestion = {
  priority: SuggestedPriority;
  reasons: PriorityReason[];
};

export function suggestPriority(input: PriorityInput): PrioritySuggestion {
  if (!input.hasIntake || input.needsReview) {
    return {
      priority: null,
      reasons: [
        {
          rule_id: "R0",
          text: "Not enough information: no usable intake. Staff must decide.",
        },
      ],
    };
  }

  const reasons: PriorityReason[] = [];
  const criticalMatches = input.lexiconMatches.filter(
    (match) => match.tier === "critical",
  );
  const warningMatches = input.lexiconMatches.filter(
    (match) => match.tier === "warning",
  );

  for (const match of criticalMatches) {
    reasons.push({
      rule_id: "R1",
      text: `Text mentions '${match.term}' (${match.category}).`,
    });
  }

  if (
    input.structured.hypoglycemia_episodes !== null &&
    input.structured.hypoglycemia_episodes >= HYPO_URGENT_AT
  ) {
    reasons.push({
      rule_id: "R2",
      text: `${input.structured.hypoglycemia_episodes} low-sugar episodes reported (threshold ${HYPO_URGENT_AT}, placeholder).`,
    });
  }

  for (const flag of input.redFlags.flags) {
    reasons.push({
      rule_id: "R3",
      text: `Intake answer flagged: ${flag}.`,
    });
  }

  for (const match of warningMatches) {
    reasons.push({
      rule_id: "R4",
      text: `Text mentions '${match.term}' (${match.category}).`,
    });
  }

  if (reasons.some((reason) => reason.rule_id === "R1" || reason.rule_id === "R2")) {
    return { priority: "urgent", reasons };
  }
  if (reasons.length > 0) return { priority: "important", reasons };

  if (input.unanswered.length === 0) {
    return {
      priority: "normal",
      reasons: [
        {
          rule_id: "R5",
          text: "All four key questions were answered; no higher-priority rule was triggered.",
        },
      ],
    };
  }

  return {
    priority: null,
    reasons: [
      {
        rule_id: "R6",
        text: `Not enough information: ${input.unanswered.length} key question(s) unanswered. Staff must decide.`,
      },
    ],
  };
}

export type DetectedInconsistency = {
  description: string;
  quotes: string[];
};

export function detectInconsistencies(
  structured: PriorityInput["structured"],
  lexiconMatches: LexiconMatch[],
  originalText: string,
): DetectedInconsistency[] {
  const checks = [
    {
      answer: structured.hypoglycemia_episodes === 0,
      matchIds: ["hypoglycemia_symptoms"],
      description:
        "The intake reports 0 low-sugar episodes, but the text mentions a possible related symptom.",
    },
    {
      answer: structured.foot_problem === false,
      matchIds: ["foot_wound"],
      description:
        "The intake reports no foot problem, but the text mentions a possible foot wound.",
    },
    {
      answer: structured.vision_change === false,
      matchIds: ["vision"],
      description:
        "The intake reports no vision change, but the text mentions a possible vision symptom.",
    },
  ];

  return checks.flatMap((check) => {
    if (!check.answer) return [];
    const quotes = [
      ...new Set(
        lexiconMatches
          .filter((match) => check.matchIds.includes(match.id))
          .map(({ start, end }) => originalText.slice(start, end))
          .filter((quote) => findAllOccurrences(originalText, quote).length > 0),
      ),
    ];
    return quotes.length > 0
      ? [{ description: check.description, quotes }]
      : [];
  });
}
