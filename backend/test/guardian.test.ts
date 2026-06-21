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

describe("classifyHr", () => {
  it("flags high and low, passes normal (defaults 50/140)", () => {
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

  // Mimic the real pipeline: /vitals pushes the tick to the store, THEN feeds it
  // to the guardian — which assesses the whole recent window.
  async function feed(store: MemoryStore, g: any, phone: string, hr: number, motion = 0) {
    const t: VitalsTick = { ts: Date.now(), hr, hrv: 0, motion };
    await store.pushVitals(phone, t);
    await g.onTick(phone, t);
  }

  it("texts the user on SUSTAINED abnormal HR while still, during party mode", async () => {
    const { store, sent, g } = setup();
    await store.setParty("+1", { active: true });
    await feed(store, g, "+1", 155);
    await feed(store, g, "+1", 158);
    g.stop();
    expect(sent).toEqual(["you good?"]);
  });

  it("does NOT alarm on a single spike (needs it sustained)", async () => {
    const { store, sent, g } = setup();
    await store.setParty("+1", { active: true });
    await feed(store, g, "+1", 165);
    g.stop();
    expect(sent).toHaveLength(0);
  });

  it("does NOT alarm on high HR while MOVING (dancing)", async () => {
    const { store, sent, g } = setup();
    await store.setParty("+1", { active: true });
    await feed(store, g, "+1", 155, 40);
    await feed(store, g, "+1", 162, 55);
    g.stop();
    expect(sent).toHaveLength(0);
  });

  it("alarms on sustained LOW HR regardless of motion (bradycardia)", async () => {
    const { store, sent, g } = setup();
    await store.setParty("+1", { active: true });
    await feed(store, g, "+1", 44);
    await feed(store, g, "+1", 42);
    g.stop();
    expect(sent).toEqual(["you good?"]);
  });

  it("stays quiet when party mode is off", async () => {
    const { store, sent, g } = setup();
    await feed(store, g, "+1", 155);
    await feed(store, g, "+1", 158);
    g.stop();
    expect(sent).toHaveLength(0);
  });

  it("stays quiet when HR is normal", async () => {
    const { store, sent, g } = setup();
    await store.setParty("+1", { active: true });
    await feed(store, g, "+1", 78);
    await feed(store, g, "+1", 80);
    g.stop();
    expect(sent).toHaveLength(0);
  });

  it("does not text twice for the same ongoing episode", async () => {
    const { store, sent, g } = setup();
    await store.setParty("+1", { active: true });
    await feed(store, g, "+1", 150);
    await feed(store, g, "+1", 155);
    await feed(store, g, "+1", 158);
    g.stop();
    expect(sent).toHaveLength(1);
  });
});
