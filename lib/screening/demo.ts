/** Placeholder scoring is a local demo default; production requires explicit opt-in. */
export function screeningDemoModeEnabled(): boolean {
  if (process.env.SCREENING_DEMO_MODE === "true") return true;
  return process.env.NODE_ENV !== "production" && process.env.SCREENING_DEMO_MODE !== "false";
}
