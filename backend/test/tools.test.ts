import { describe, it, expect } from "vitest";
import { MemoryStore } from "../src/store/memory";
import { dispatchTool } from "../src/agent/tools";
import { stubActions } from "../src/tools/actions";
import { stubContacts } from "../src/contacts/contacts";

describe("dispatchTool", () => {
  it("update_profile writes the name to the store", async () => {
    const store = new MemoryStore();
    await dispatchTool("update_profile", { field: "name", value: "Harsh" }, { phone: "+1", store, actions: stubActions, contacts: stubContacts, notifyContact: async () => {} });
    expect((await store.getProfile("+1"))?.name).toBe("Harsh");
  });

  it("update_profile saves an emergency contact", async () => {
    const store = new MemoryStore();
    await dispatchTool(
      "update_profile",
      { field: "emergency_contact", value: "Sam", contact_phone: "+2", is_emergency: true },
      { phone: "+1", store, actions: stubActions, contacts: stubContacts, notifyContact: async () => {} },
    );
    expect(await store.getFriends("+1")).toEqual([{ name: "Sam", phone: "+2", is_emergency: true }]);
  });

  it("block_intercept denies a blocklisted name", async () => {
    const store = new MemoryStore();
    await store.addBlocklist("+1", "jordan");
    const raw = await dispatchTool("block_intercept", { target_name: "Jordan" }, { phone: "+1", store, actions: stubActions, contacts: stubContacts, notifyContact: async () => {} });
    expect(JSON.parse(raw).allow).toBe(false);
  });

  it("set_party_mode arms the night", async () => {
    const store = new MemoryStore();
    await dispatchTool("set_party_mode", { active: true }, { phone: "+1", store, actions: stubActions, contacts: stubContacts, notifyContact: async () => {} });
    expect((await store.getParty("+1")).active).toBe(true);
  });

  it("alert_circle texts the emergency contact's real number", async () => {
    const store = new MemoryStore();
    await store.setProfile("+1", { phone: "+1", name: "Harsh", created_at: 1 });
    await store.addFriend("+1", { name: "Sam", phone: "+15551234567", is_emergency: true });
    const sentTo: string[] = [];
    await dispatchTool(
      "alert_circle",
      { reason: "they went quiet for 10 min" },
      {
        phone: "+1",
        store,
        actions: stubActions,
        contacts: stubContacts,
        notifyContact: async (n) => {
          sentTo.push(n);
        },
      },
    );
    expect(sentTo).toEqual(["+15551234567"]);
  });
});
