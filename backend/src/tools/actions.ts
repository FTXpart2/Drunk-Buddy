// External real-world actions sit behind this interface (brief §5: "mock the
// edges, nail the spine"). Phase 1 ships stubs; Phase 2/3 swap in Browserbase,
// deep links, ElevenLabs, the vitals sim, etc. without touching the agent.
import { config } from "../config";
import { log } from "../log";
import { bookUber, type RidePlace, UBER_APP_LINK } from "../rides/uber";
import { orderEats } from "../food/ubereats";

export interface AlertContact {
  name: string;
  phone: string;
}

export interface Actions {
  callRide(input: {
    phone: string;
    destination: string;
    pickup?: string;
    pickupPlace?: RidePlace;
    dropPlace?: RidePlace;
    confirm?: boolean;
  }): Promise<string>;
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
      const quote = await bookUber(input.destination, {
        confirm: input.confirm,
        pickup: input.pickup,
        pickupPlace: input.pickupPlace,
        dropPlace: input.dropPlace,
      });
      const priceBit = quote.price ? `, ${quote.price}` : "";
      const etaBit = quote.eta ? `, ${quote.eta} out` : "";
      const details = `uberX to ${input.destination}${priceBit}${etaBit}`;
      // Booked it for real (confirm + UBER_BOOK_FOR_REAL + a real price were all true).
      // Relay the car/driver/eta we read off the matched-driver screen + an app link.
      if (quote.booked) {
        const carBits = [quote.car, quote.plate && `plate ${quote.plate}`].filter(Boolean).join(", ");
        const who = quote.driver ? `${quote.driver}'s your driver` : "your driver's on the way";
        const when = quote.eta ? `, ${quote.eta} out` : "";
        const carLine = carBits ? ` ${carBits}.` : "";
        return `booked!${carLine} ${who}${when}. track it in your uber app: ${UBER_APP_LINK}`;
      }
      // They said yes, but auto-book is off (or it fell back) — hand the pre-filled link to confirm in their app.
      if (input.confirm) {
        return quote.link
          ? `ok — opening your uber to confirm${quote.price ? ` (${quote.price})` : ""}: ${quote.link}`
          : "tap it in your uber app to confirm — couldn't auto-book just now.";
      }
      // Live price read — ask them to confirm; on "yes" the agent re-calls with confirm=true.
      if (quote.price) return `${details}. want me to book it?`;
      // No live price — hand the reliable pre-filled link instead.
      return quote.link
        ? `your uber to ${input.destination} is ready — tap to book (opens to your spot): ${quote.link}`
        : `couldn't pull a price just now — want me to try again?`;
    } catch (err) {
      log("ride.error", { err: String(err) });
      return stubActions.callRide(input);
    }
  },
  async orderFood(input) {
    try {
      // One-step: find an OPEN spot near them + hand a tap-to-order link (the user
      // confirms + pays in their own app — we never auto-charge for food).
      const quote = await orderEats(input.query);
      if (!quote.ok) {
        log("food.fallback", { note: quote.note });
        return stubActions.orderFood(input);
      }
      // Nothing open near them — say so honestly, never fake-offer a closed spot.
      if (quote.closed) {
        return `looks like everything near them is closed right now — nothing's delivering. tell them gently and offer to try a different craving or check back in a bit.`;
      }
      const eta = quote.eta ? `, ~${quote.eta}` : "";
      if (quote.place) {
        return `found you ${quote.place}${eta} — tap to order + pay: ${quote.link}`;
      }
      return quote.link
        ? `here's uber eats for ${input.query} — tap to order: ${quote.link}`
        : stubActions.orderFood(input);
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
