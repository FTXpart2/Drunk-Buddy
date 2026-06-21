import { describe, it, expect } from "vitest";
import { MemoryStore } from "../src/store/memory";
import { classifyHr } from "../src/vitals/hr";
import { makeHealthToken, verifyHealthToken } from "../src/vitals/link";
import { createGuardian } from "../src/vitals/guardian";
import { stubActions } from "../src/tools/actions";
import type { VitalsTick } from "@drunk-buddy/shared";

// Fake LLM that always answers in one text turn (no tools) — lets us assert the
// guardian reaches out without hitting the real model.
const fakeLlm: any = {
  model: "test",
  async createMessage() {
    return { stop_reason: "end_turn", content: [{ type: "text", text: "you good?" }] };
  },
};

const tick = (hr: number): VitalsTick => ({ ts: Date.now(), hr, hrv: 0, motion: 0 });

describe("classifyHr", () => {
  it("flags high and low, passes normal (defaults 45/130)", () => {
    expect(classifyHr(150)).toBe("high");
    expect(classifyHr(40)).toBe("low");
    expect(classifyHr(78)).toBe("normal");
    expect(classifyHr(0)).toBe("normal");
  });
});

describe("health link token", () => {
  it("round-trips the phone and rejects tampering", () => {
    const t = makeHealthToken("+14155550199");
    expect(verifyHealthToken(t)).toBe("+14155550199");
    expect(verifyHealthToken(t + "x")).toBeNull();
    expect(verifyHealthToken("garbage")).toBeNull();
  });
});

describe("guardian", () => {
  function setup() {
    const store = new MemoryStore();
    const sent: string[] = [];
    const deps: any = { store, llm: fakeLlm, actions: stubActions, maxSteps: 3 };
    const g = createGuardian({ store, deps, send: async (_p, t) => void sent.push(t) });
    return { store, sent, g };
  }

  it("texts the user when HR is abnormal during party mode", async () => {
    const { store, sent, g } = setup();
    await store.setParty("+1", { active: true });
    await g.onTick("+1", tick(155));
    g.stop();
    expect(sent).toEqual(["you good?"]);
  });

  it("stays quiet when party mode is off", async () => {
    const { sent, g } = setup();
    await g.onTick("+1", tick(155));
    g.stop();
    expect(sent).toHaveLength(0);
  });

  it("stays quiet when HR is normal", async () => {
    const { store, sent, g } = setup();
    await store.setParty("+1", { active: true });
    await g.onTick("+1", tick(78));
    g.stop();
    expect(sent).toHaveLength(0);
  });

  it("does not text twice for the same ongoing episode", async () => {
    const { store, sent, g } = setup();
    await store.setParty("+1", { active: true });
    await g.onTick("+1", tick(150));
    await g.onTick("+1", tick(158));
    g.stop();
    expect(sent).toHaveLength(1);
  });
});
