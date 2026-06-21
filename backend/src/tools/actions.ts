// External real-world actions sit behind this interface (brief §5: "mock the
// edges, nail the spine"). Phase 1 ships stubs; Phase 2/3 swap in Browserbase,
// deep links, ElevenLabs, the vitals sim, etc. without touching the agent.
import { config } from "../config";
import { log } from "../log";
import { bookUber } from "../rides/uber";
import { orderEats } from "../food/ubereats";

export interface AlertContact {
  name: string;
  phone: string;
}

export interface Actions {
  callRide(input: { phone: string; destination: string; pickup?: string; confirm?: boolean }): Promise<string>;
  orderFood(input: { phone: string; query: string; confirm?: boolean }): Promise<string>;
  alertCircle(input: {
    phone: string;
    reason: string;
    location?: string;
    contacts: AlertContact[];
  }): Promise<string>;
  blockIntercept(input: {
    phone: string;
    target_name: string;
    draft?: string;
    blocklist: string[];
  }): Promise<{ allow: boolean; line: string }>;
  getVitals(input: { phone: string }): Promise<string>;
}

export const stubActions: Actions = {
  async callRide({ destination, confirm }) {
    return confirm
      ? `[stub] booked — uberX to ${destination}, blue Civic, 4 min out, $14.20`
      : `[stub] quote — uberX to ${destination}, $14.20, 4 min away (not booked; show them and ask to confirm)`;
  },
  async orderFood({ query, confirm }) {
    return confirm
      ? `[stub] ordered — ${query} from Lucky's Diner, $18.40, ~25 min`
      : `[stub] quote — ${query} from Lucky's Diner, $18.40, ~25 min (not ordered; show them and ask to confirm)`;
  },
  async alertCircle({ reason, location, contacts }) {
    const who = contacts.map((c) => c.name).join(", ") || "emergency contacts";
    return `[stub] alerted ${who}${location ? ` with location ${location}` : ""}: ${reason}`;
  },
  async blockIntercept({ target_name, blocklist }) {
    const blocked = blocklist.includes(target_name.toLowerCase());
    return {
      allow: !blocked,
      line: blocked
        ? `no. absolutely not. you are NOT texting ${target_name} right now. sleep on it, talk to me tomorrow.`
        : `ok — but keep it together.`,
    };
  },
  async getVitals() {
    return "[stub] hr 78, hrv 55, moving around — looks normal";
  },
};

// Real edges: callRide (Uber) and orderFood (Uber Eats) are wired to Browserbase;
// everything else still delegates to the stub. Each falls back to the stub if the
// browser session throws, so a flaky run can never take down the agent (brief §4).
export const browserbaseActions: Actions = {
  ...stubActions,
  async callRide(input) {
    try {
      const quote = await bookUber(input.destination, { confirm: input.confirm, pickup: input.pickup });
      if (!quote.ok) {
        log("ride.fallback", { note: quote.note });
        return stubActions.callRide(input);
      }
      const details = `uberX to ${input.destination}${quote.price ? `, ${quote.price}` : ""}${
        quote.eta ? `, ${quote.eta} away` : ""
      }`;
      return quote.booked
        ? `booked — ${details}. it's on the way.`
        : `quote — ${details}. not booked yet; show them the details and ask if they want it.`;
    } catch (err) {
      log("ride.error", { err: String(err) });
      return stubActions.callRide(input);
    }
  },
  async orderFood(input) {
    try {
      const quote = await orderEats(input.query, { confirm: input.confirm });
      if (!quote.ok) {
        log("food.fallback", { note: quote.note });
        return stubActions.orderFood(input);
      }
      const details = `${quote.item ?? input.query}${quote.place ? ` from ${quote.place}` : ""}${
        quote.total ? `, ${quote.total}` : ""
      }${quote.eta ? `, ${quote.eta}` : ""}`;
      return quote.ordered
        ? `ordered — ${details}. on its way.`
        : `quote — ${details}. not ordered yet; show them the details and ask if they want it.`;
    } catch (err) {
      log("food.error", { err: String(err) });
      return stubActions.orderFood(input);
    }
  },
};

// Choose the live edges when Browserbase is configured, else the safe stub.
// Used by every entrypoint so behavior is identical across dev/smoke/server.
export function pickActions(): Actions {
  return config.browserbase.apiKey ? browserbaseActions : stubActions;
}
