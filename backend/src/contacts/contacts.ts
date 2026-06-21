import type { Config } from "../config";

// Real contacts — so the buddy can resolve a name the user mentions ("call my
// roommate sam", "don't let me text jess") to an actual phone number from the
// user's real address book, instead of making them type numbers. Behind an
// interface: BlueBubbles reads the Mac's Contacts; stub returns nothing.
export interface ContactMatch {
  name: string;
  phone: string;
}

export interface Contacts {
  readonly name: string;
  lookup(query: string): Promise<ContactMatch[]>;
}

export const stubContacts: Contacts = {
  name: "stub",
  async lookup() {
    return [];
  },
};

export function createBlueBubblesContacts(serverUrl: string, password: string): Contacts {
  const base = serverUrl.replace(/\/$/, "");
  const pw = encodeURIComponent(password);
  let cache: { name: string; phones: string[] }[] | null = null;

  async function fetchAll() {
    if (cache) return cache;
    const res = await fetch(`${base}/api/v1/contact?password=${pw}`);
    if (!res.ok) throw new Error(`contacts -> ${res.status}`);
    const data: any = await res.json();
    const rows: any[] = data?.data ?? [];
    cache = rows
      .map((c) => ({
        name:
          c.displayName ||
          [c.firstName, c.lastName].filter(Boolean).join(" ") ||
          "",
        phones: (c.phoneNumbers ?? [])
          .map((p: any) => (typeof p === "string" ? p : p.address))
          .filter(Boolean),
      }))
      .filter((c) => c.name && c.phones.length);
    return cache;
  }

  return {
    name: "bluebubbles",
    async lookup(query: string) {
      const q = query.trim().toLowerCase();
      if (!q) return [];
      const all = await fetchAll();
      const out: ContactMatch[] = [];
      for (const c of all) {
        if (c.name.toLowerCase().includes(q)) {
          for (const phone of c.phones) out.push({ name: c.name, phone });
        }
      }
      return out.slice(0, 8);
    },
  };
}

export function createContacts(config: Config): Contacts {
  if (config.bluebubbles.serverUrl && config.bluebubbles.password) {
    return createBlueBubblesContacts(config.bluebubbles.serverUrl, config.bluebubbles.password);
  }
  return stubContacts;
}
