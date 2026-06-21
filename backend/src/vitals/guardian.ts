import type { VitalsTick } from "@drunk-buddy/shared";
import type { Store } from "../store/store";
import { runGuardianCheck, type Deps } from "../agent/loop";
import { assessVitals } from "./hr";
import { config } from "../config";
import { log } from "../log";

// The guardian turns the raw vitals feed into care. When party mode is on and the
// vitals look genuinely concerning (see assessVitals — low HR, or sustained high
// HR while STILL, never just "racing on the dance floor"), the buddy reaches out
// UNPROMPTED ("you ok?"); if the user stays silent, it escalates to their
// emergency contacts. Episode state is in-memory: one open concern per phone so
// the user is never spammed (brief §6, Phase 3).

interface Concern {
  openedAt: number;
  reason: string;
  lastHr: number;
  escalated: boolean;
}

export interface Guardian {
  /** Feed a freshly ingested vitals tick through the guardian. */
  onTick(phone: string, tick: VitalsTick): Promise<void>;
  stop(): void;
}

export interface GuardianDeps {
  store: Store;
  /** Agent deps, used to generate the in-voice check-in / escalation. */
  deps: Deps;
  /** Deliver an unprompted message to the user (looks up chatGuid + sends). */
  send: (phone: string, text: string) => Promise<void>;
}

export function createGuardian(gd: GuardianDeps): Guardian {
  const concerns = new Map<string, Concern>();

  async function reach(phone: string, note: string): Promise<void> {
    const text = await runGuardianCheck({ phone, note }, gd.deps);
    if (text) await gd.send(phone, text);
  }

  async function handleTick(phone: string, tick: VitalsTick): Promise<void> {
    const party = await gd.store.getParty(phone);
    if (!party.active) {
      concerns.delete(phone);
      return;
    }

    // Assess the recent WINDOW (sustained + stillness), not a single reading —
    // a high HR while moving must never alarm. The just-pushed tick is included.
    const { concerning, reason } = assessVitals(await gd.store.getVitals(phone));
    const open = concerns.get(phone);

    if (!concerning) {
      if (open) {
        concerns.delete(phone);
        log("guardian.recovered", { phone, hr: tick.hr });
      }
      return;
    }

    if (open) {
      open.lastHr = tick.hr;
      open.reason = reason;
      return; // already concerned — don't text again, wait it out / escalate
    }

    concerns.set(phone, { openedAt: Date.now(), reason, lastHr: tick.hr, escalated: false });
    log("guardian.concern", { phone, hr: tick.hr, reason });
    await reach(
      phone,
      `[guardian] ${reason}, and party mode is on. reach out RIGHT NOW in your voice: short, warm, a little worried. ask if they're ok.`,
    );
  }

  const timer = setInterval(() => {
    void sweep();
  }, config.guardian.heartbeatMs);
  if (typeof timer.unref === "function") timer.unref();

  async function sweep(): Promise<void> {
    const now = Date.now();
    for (const [phone, c] of concerns) {
      if (c.escalated) continue;
      const lastSeen = await gd.store.getLastSeen(phone);
      if (lastSeen != null && lastSeen >= c.openedAt) {
        concerns.delete(phone); // they answered — they're responsive
        log("guardian.answered", { phone });
        continue;
      }
      if (now - c.openedAt >= config.guardian.escalateAfterMs) {
        c.escalated = true;
        log("guardian.escalate", { phone, reason: c.reason });
        await reach(
          phone,
          `[guardian] you already checked in because ${c.reason}, and they STILL have not replied. this is serious now — alert their emergency contacts with their location and get them help. drop the jokes.`,
        ).catch((e) => log("guardian.error", { phone, err: String(e) }));
      }
    }
  }

  return {
    onTick: (phone, tick) =>
      handleTick(phone, tick).catch((e) => log("guardian.error", { phone, err: String(e) })),
    stop: () => clearInterval(timer),
  };
}
