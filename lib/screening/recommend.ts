import type { ScreeningBand } from "./score.ts";

export type RecommendationKind = "test_recommended_soon" | "test_recommended" | "routine_info";
export function recommend(band: ScreeningBand, symptomModifierTriggered: boolean): { kind: RecommendationKind; content_block_keys: string[] } {
  if (symptomModifierTriggered) return { kind: "test_recommended_soon", content_block_keys: ["test_recommended_soon"] };
  if (band === "low") return { kind: "routine_info", content_block_keys: ["low_explanation"] };
  return { kind: "test_recommended", content_block_keys: ["test_recommended"] };
}
