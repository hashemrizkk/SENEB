"use client";

import type { SurveySubmission } from "./convert";

export type SurveyHandoff = {
  survey: SurveySubmission;
  clarification: string;
};

let pendingHandoff: SurveyHandoff | null = null;
const listeners = new Set<() => void>();

export function subscribeSurveyHandoff(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSurveyHandoff(): SurveyHandoff | null {
  return pendingHandoff;
}

export function getServerSurveyHandoff(): null {
  return null;
}

export function setSurveyHandoff(handoff: SurveyHandoff): void {
  pendingHandoff = handoff;
  listeners.forEach((listener) => listener());
}

export function clearSurveyHandoff(): void {
  pendingHandoff = null;
  listeners.forEach((listener) => listener());
}
