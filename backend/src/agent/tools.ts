import type { UserProfile } from "@drunk-buddy/shared";
import type { Store } from "../store/store";
import type { Actions } from "../tools/actions";
import { config } from "../config";
import { classifyHr } from "../vitals/hr";
import { makeHealthToken } from "../vitals/link";

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
    description: "Book a ride to get the user somewhere (usually home). Just do it.",
    input_schema: {
      type: "object",
      properties: { destination: { type: "string" } },
      required: ["destination"],
    },
  },
  {
    name: "order_food",
    description: "Order food for the user.",
    input_schema: {
      type: "object",
      properties: { query: { type: "string" } },
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
      "Get the one-tap link the user opens so you can watch their heart rate from their Apple Watch tonight. Share it (in your voice) right after they head out / you turn on party mode.",
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
];

export interface ToolContext {
  phone: string;
  store: Store;
  actions: Actions;
}

export async function dispatchTool(
  name: string,
  input: any,
  ctx: ToolContext,
): Promise<string> {
  const { phone, store, actions } = ctx;
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

    case "call_ride":
      return actions.callRide({ phone, destination: String(input.destination ?? "home") });

    case "order_food":
      return actions.orderFood({ phone, query: String(input.query ?? "") });

    case "alert_circle": {
      const friends = await store.getFriends(phone);
      return actions.alertCircle({
        phone,
        reason: String(input.reason ?? "unresponsive"),
        location: input.location,
        contacts: friends.filter((f) => f.is_emergency),
      });
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
      return `share this one-tap link so they can open it: ${config.publicUrl ?? "http://localhost:" + config.port}/watch?t=${makeHealthToken(phone)}`;

    case "remember":
      await store.addMemory(phone, String(input.fact ?? ""));
      return "noted.";

    case "recall": {
      const items = await store.recallMemory(phone, input.query);
      return items.length ? items.map((i) => i.fact).join("; ") : "nothing on that yet.";
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
