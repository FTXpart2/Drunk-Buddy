import { describe, it, expect } from "vitest";
import { MemoryStore } from "../src/store/memory";
import { CONVO_CAP } from "../src/store/store";

describe("MemoryStore", () => {
  it("saves and reads a profile", async () => {
    const s = new MemoryStore();
    await s.setProfile("+1", { phone: "+1", name: "Harsh", created_at: 1 });
    expect((await s.getProfile("+1"))?.name).toBe("Harsh");
  });

  it("adds friends and blocklist names", async () => {
    const s = new MemoryStore();
    await s.addFriend("+1", { name: "Sam", phone: "+2", is_emergency: true });
    await s.addBlocklist("+1", "jordan");
    await s.addBlocklist("+1", "jordan"); // dedupes
    expect(await s.getFriends("+1")).toHaveLength(1);
    expect(await s.getBlocklist("+1")).toEqual(["jordan"]);
  });

  it("caps the conversation buffer at CONVO_CAP", async () => {
    const s = new MemoryStore();
    const n = CONVO_CAP + 5;
    for (let i = 0; i < n; i++) await s.appendConversation("+1", { role: "user", content: String(i) });
    const c = await s.getConversation("+1");
    expect(c).toHaveLength(CONVO_CAP);
    expect(c[0].content).toBe(String(n - CONVO_CAP));
  });
});
