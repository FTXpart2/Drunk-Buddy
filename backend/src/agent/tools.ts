import type { UserProfile } from "@drunk-buddy/shared";
import type { Store } from "../store/store";
import type { Actions } from "../tools/actions";
import type { Contacts } from "../contacts/contacts";
import { config } from "../config";
import { makeHealthToken } from "../vitals/link";
import { classifyHr } from "../vitals/hr";

// Claude tool schema (brief §4). Each external tool is dispatched to the
// Actions interface (stub now, real later). update_profile / set_party_mode /
// remember / recall hit the Store directly.
export const TOOLS = [
  {
    name: "update_profile",
    description:
      "Save something you just learned about the user. Call this the moment you learn a fact — their name, home address, an emergency contact, or someone to keep them from drunk-texting.",
    input_schema: {
      type: "object",
      properties: {
        field: {
          type: "string",
          enum: ["name", "home_address", "rideshare", "emergency_contact", "blocklist_name"],
          description: "which fact you're saving",
        },
        value: {
          type: "string",
          description:
            "the value. for emergency_contact this is the contact's name; for blocklist_name it's the person's name.",
        },
        contact_phone: {
          type: "string",
          description: "phone number — only when field is emergency_contact",
        },
        is_emergency: {
          type: "boolean",
          description: "whether this contact should be alerted in an emergency (usually true)",
        },
      },
      required: ["field", "value"],
    },
  },
  {
    name: "set_party_mode",
    description:
      "Arm or disarm watching over the user for the night. Turn ON when they head out drinking; OFF when they're home safe.",
    input_schema: {
      type: "object",
      properties: {
        active: { type: "boolean" },
        end_time: { type: "string", description: "optional ISO time the night ends" },
      },
      required: ["active"],
    },
  },
  {
    name: "call_ride",
    description:
      "Get the user a ride (usually home). Call with confirm=false FIRST to pull a live price + ETA quote; tell them in your voice, and only call again with confirm=true once they say yes.",
    input_schema: {
      type: "object",
      properties: {
        destination: { type: "string" },
        confirm: {
          type: "boolean",
          description: "false = just quote; true = actually book (only after they said yes)",
        },
      },
      required: ["destination"],
    },
  },
  {
    name: "order_food",
    description:
      "Get the user food. Call with confirm=false FIRST to build the cart and pull the total + ETA; tell them in your voice, and only call again with confirm=true once they say yes.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string" },
        confirm: {
          type: "boolean",
          description: "false = just quote; true = actually order (only after they said yes)",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "alert_circle",
    description:
      "Emergency only: text the user's emergency contacts with their location. Use when vitals spike or they go silent and unresponsive.",
    input_schema: {
      type: "object",
      properties: { reason: { type: "string" }, location: { type: "string" } },
      required: ["reason"],
    },
  },
  {
    name: "block_intercept",
    description:
      "Guardian check before the user contacts someone risky (ex, boss, parents). Returns whether to allow it plus a talk-down line.",
    input_schema: {
      type: "object",
      properties: { target_name: { type: "string" }, draft: { type: "string" } },
      required: ["target_name"],
    },
  },
  {
    name: "get_vitals",
    description: "Read the user's latest vitals (heart rate, motion).",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_health_link",
    description:
      "Get the one-tap link to text the user so their Apple Watch heart rate streams to you. Share it in your voice right after they head out / you turn on party mode, so you can keep an eye on them.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "remember",
    description: "Save a long-term fact about the user or tonight's plan.",
    input_schema: {
      type: "object",
      properties: { fact: { type: "string" } },
      required: ["fact"],
    },
  },
  {
    name: "recall",
    description: "Look up something you remembered earlier.",
    input_schema: {
      type: "object",
      properties: { query: { type: "string" } },
    },
  },
  {
    name: "lookup_contact",
    description:
      "Look someone up in the user's REAL phone contacts by name to get their actual number. Use it whenever they mention a person (an emergency contact, someone to block, someone to call/text) and you need the real number — don't make them type it out.",
    input_schema: {
      type: "object",
      properties: { name: { type: "string", description: "the person's name to search for" } },
      required: ["name"],
    },
  },
];

export interface ToolContext {
  phone: string;
  store: Store;
  actions: Actions;
  contacts: Contacts;
  /** Send an iMessage/SMS to an arbitrary number (the user's emergency contact). */
  notifyContact: (number: string, text: string) => Promise<void>;
}

export async function dispatchTool(
  name: string,
  input: any,
  ctx: ToolContext,
): Promise<string> {
  const { phone, store, actions, contacts, notifyContact } = ctx;
  switch (name) {
    case "update_profile":
      return updateProfile(phone, input, store);

    case "set_party_mode": {
      const active = !!input.active;
      await store.setParty(phone, {
        active,
        started_at: active ? Date.now() : undefined,
        end_time: input.end_time ? Date.parse(input.end_time) : undefined,
      });
      return active ? "party mode ON — watching over them" : "party mode off";
    }

    case "call_ride": {
      const here = await store.getLocation(phone);
      return actions.callRide({
        phone,
        destination: String(input.destination ?? "home"),
        pickup: here?.address,
        confirm: !!input.confirm,
      });
    }

    case "order_food":
      return actions.orderFood({
        phone,
        query: String(input.query ?? ""),
        confirm: !!input.confirm,
      });

    case "alert_circle": {
      const friends = await store.getFriends(phone);
      const ec = friends.filter((f) => f.is_emergency && f.phone);
      if (!ec.length) {
        return "no emergency contact with a number saved yet — can't reach anyone. ask them who to call.";
      }
      const who = (await store.getProfile(phone))?.name ?? "your friend";
      const where = await store.getLocation(phone);
      const locText = input.location
        ? ` they're at ${input.location}.`
        : where?.address
          ? ` they're near ${where.address}.`
          : "";
      const pin = where ? ` 📍 https://maps.google.com/?q=${where.lat},${where.lon}` : "";
      const msg = `hey — it's ${who}'s drunk buddy. ${String(input.reason ?? "i can't reach them and i'm worried.")}${locText}${pin} can you check on them?`;
      const sent: string[] = [];
      for (const c of ec) {
        try {
          await notifyContact(c.phone, msg);
          sent.push(c.name);
        } catch {
          // keep trying the other contacts
        }
      }
      return sent.length
        ? `texted ${sent.join(", ")} directly: "${msg}"`
        : "tried to alert your emergency contacts but the texts didn't go through.";
    }

    case "block_intercept": {
      const blocklist = await store.getBlocklist(phone);
      const result = await actions.blockIntercept({
        phone,
        target_name: String(input.target_name ?? ""),
        draft: input.draft,
        blocklist,
      });
      return JSON.stringify(result);
    }

    case "get_vitals": {
      const ticks = await store.getVitals(phone);
      const latest = ticks[ticks.length - 1];
      if (!latest) return actions.getVitals({ phone });
      const level = classifyHr(latest.hr);
      const tag = level === "high" ? " — running hot" : level === "low" ? " — running low" : " — looks normal";
      const age = Math.round((Date.now() - latest.ts) / 1000);
      return `hr ${latest.hr}${tag} (${age}s ago)`;
    }

    case "get_health_link":
      return `text them this one-tap link so their watch streams to you: ${config.publicUrl ?? "http://localhost:8787"}/watch?t=${makeHealthToken(phone)}`;

    case "remember":
      await store.addMemory(phone, String(input.fact ?? ""));
      return "noted.";

    case "recall": {
      const items = await store.recallMemory(phone, input.query);
      return items.length ? items.map((i) => i.fact).join("; ") : "nothing on that yet.";
    }

    case "lookup_contact": {
      const matches = await contacts.lookup(String(input.name ?? ""));
      if (!matches.length) return `no contact found matching "${input.name ?? ""}".`;
      return matches.map((m) => `${m.name}: ${m.phone}`).join("; ");
    }

    default:
      return `unknown tool: ${name}`;
  }
}

async function updateProfile(phone: string, input: any, store: Store): Promise<string> {
  const field = String(input.field ?? "");
  const value = String(input.value ?? "").trim();

  if (field === "name" || field === "home_address" || field === "rideshare") {
    const profile: UserProfile = (await store.getProfile(phone)) ?? {
      phone,
      created_at: Date.now(),
    };
    (profile as any)[field] = value;
    await store.setProfile(phone, profile);
    return `saved ${field}`;
  }

  if (field === "emergency_contact") {
    await store.addFriend(phone, {
      name: value,
      phone: String(input.contact_phone ?? ""),
      is_emergency: input.is_emergency ?? true,
    });
    return `saved emergency contact ${value}`;
  }

  if (field === "blocklist_name") {
    await store.addBlocklist(phone, value.toLowerCase());
    return `added ${value} to the blocklist`;
  }

  return `unknown field: ${field}`;
}
