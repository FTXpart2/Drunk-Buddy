import { describe, it, expect } from "vitest";
import { MemoryStore } from "../src/store/memory";

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

  it("persists the chatGuid so the guardian can reach the user out of band", async () => {
    const s = new MemoryStore();
    expect(await s.getChatGuid("+1")).toBeNull();
    await s.setChatGuid("+1", "iMessage;-;+1");
    expect(await s.getChatGuid("+1")).toBe("iMessage;-;+1");
  });

  it("caps the conversation buffer at 20", async () => {
    const s = new MemoryStore();
    for (let i = 0; i < 25; i++) await s.appendConversation("+1", { role: "user", content: String(i) });
    const c = await s.getConversation("+1");
    expect(c).toHaveLength(20);
    expect(c[0].content).toBe("5");
  });
});
