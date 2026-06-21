import type { VitalsTick } from "@drunk-buddy/shared";
import { config } from "../config";

// HR classification + a research-backed distress assessment that avoids false
// alarms (the #1 risk at a party where HR is naturally 120-160 from dancing +
// alcohol). Design, grounded in how Apple's own heart alerts work and what
// actually signals alcohol distress:
//   1. LOW HR (bradycardia) is the real alcohol-poisoning danger — flag it
//      regardless of movement.
//   2. HIGH HR only counts when they're STILL (not dancing) — high HR while
//      moving is normal and must NOT alarm.
//   3. Require it SUSTAINED across recent readings, not a single spike.
// The buddy's check-in is gentle (cheap if wrong); only a sustained + unanswered
// concern escalates to the emergency contact.

export type HrLevel = "low" | "high" | "normal";

export function classifyHr(hr: number): HrLevel {
  if (!Number.isFinite(hr) || hr <= 0) return "normal";
  if (hr <= config.guardian.hrLow) return "low";
  if (hr >= config.guardian.hrHigh) return "high";
  return "normal";
}

export interface VitalsAssessment {
  concerning: boolean;
  reason: string;
}

export function assessVitals(ticks: VitalsTick[]): VitalsAssessment {
  const recent = ticks.slice(-4).filter((t) => t.hr > 0);
  // Need a couple of readings so a single bad sample can't trip an alarm.
  if (recent.length < 2) return { concerning: false, reason: "" };

  const need = Math.ceil(recent.length / 2); // majority of the window = "sustained"
  const lows = recent.filter((t) => t.hr <= config.guardian.hrLow).length;
  const highs = recent.filter((t) => t.hr >= config.guardian.hrHigh).length;
  const avgHr = Math.round(recent.reduce((s, t) => s + t.hr, 0) / recent.length);
  const avgMotion = recent.reduce((s, t) => s + (t.motion ?? 0), 0) / recent.length;
  const still = avgMotion <= config.guardian.stillMotion;

  // (1) Sustained LOW heart rate — the genuine alcohol-poisoning danger sign.
  if (lows >= need) {
    return { concerning: true, reason: `their heart rate is dangerously low (~${avgHr} bpm)` };
  }
  // (2) Sustained HIGH heart rate ONLY while still — never alarm on dancing.
  if (highs >= need && still) {
    return {
      concerning: true,
      reason: `their heart rate's been very high (~${avgHr} bpm) and they're not moving`,
    };
  }
  return { concerning: false, reason: "" };
}
