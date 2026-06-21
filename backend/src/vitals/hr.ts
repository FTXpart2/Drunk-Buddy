import { config } from "../config";

// Pure HR classification, shared by the guardian and the get_vitals tool. Kept
// standalone so neither has to import the other (avoids an import cycle).
export type HrLevel = "low" | "high" | "normal";

export function classifyHr(hr: number): HrLevel {
  if (!Number.isFinite(hr) || hr <= 0) return "normal";
  if (hr <= config.guardian.hrLow) return "low";
  if (hr >= config.guardian.hrHigh) return "high";
  return "normal";
}
