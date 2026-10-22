// Placeholder. Must be reviewed by a clinician before any real use.
import { findAllOccurrences } from "./text-normalize.ts";
import type { NoteChecklistItem } from "./note-checklist.ts";
import { NOTE_RULES_VERSION } from "./note-checklist.ts";

export { NOTE_RULES_VERSION };
export type NoteCheckStatus = "documented" | "declined_or_deferred" | "not_documented" | "unclear";
export type NoteCheckMode = "llm" | "mock" | "fallback";
export type NoteVerifiedResult = { id: string; status: NoteCheckStatus; evidence_quote: string | null };
export type NoteReason = NoteVerifiedResult & Pick<NoteChecklistItem, "label" | "severity_if_missing" | "reason">;

export function lightFromChecklist(
  requiredItems: NoteChecklistItem[],
  verifiedResults: NoteVerifiedResult[],
  mode: NoteCheckMode,
  noteText = "",
): { light: "green" | "yellow" | "red" | null; reasons: NoteReason[] } {
  const resultById = new Map(verifiedResults.map((result) => [result.id, result]));
  const normalizedNote = noteText.trim();
  const reasons: NoteReason[] = requiredItems.map((item) => {
    let result = resultById.get(item.id) ?? { id: item.id, status: "unclear" as const, evidence_quote: null };
    if (normalizedNote.length < 10) result = { id: item.id, status: "not_documented", evidence_quote: null };
    if (mode !== "llm") {
      const containsAnchor = normalizedNote.length >= 10 && item.anchors.some((anchor) => findAllOccurrences(noteText, anchor).length > 0);
      result = containsAnchor
        ? { id: item.id, status: "unclear", evidence_quote: null }
        : { id: item.id, status: "not_documented", evidence_quote: null };
    }
    return { ...result, label: item.label, severity_if_missing: item.severity_if_missing, reason: item.reason };
  });

  if (mode !== "llm") {
    if (reasons.some((result) => result.status === "not_documented" && result.severity_if_missing === "red")) return { light: "red", reasons };
    if (reasons.some((result) => result.status === "not_documented" && result.severity_if_missing === "yellow")) return { light: "yellow", reasons };
    return { light: null, reasons };
  }
  if (reasons.some((result) => (result.status === "not_documented" || result.status === "unclear") && result.severity_if_missing === "red")) return { light: "red", reasons };
  if (reasons.some((result) => (result.status === "not_documented" || result.status === "unclear") && result.severity_if_missing === "yellow")) return { light: "yellow", reasons };
  if (reasons.some((result) => result.status === "declined_or_deferred" && result.severity_if_missing === "red")) return { light: "yellow", reasons };
  return { light: "green", reasons };
}
