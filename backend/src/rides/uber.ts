import { Stagehand } from "@browserbasehq/stagehand";
import { z } from "zod";
import { config } from "../config";
import { log } from "../log";
import { stagehandModel } from "../lib/stagehand-model";

// Get the user a ride. Two layers: (1) drive the Uber web app in a cloud browser
// (Browserbase + Stagehand, planner = gpt-4o so act() actually works — Claude
// 4.x act() is broken in Stagehand 3.6, stagehand#1986) to read a live price and
// book, and (2) ALWAYS hand back a pre-filled Uber deep link as the dependable
// fallback. Hidden behind the Actions interface (brief §3).
//
// AUTH: reuse a Browserbase Context (BROWSERBASE_CONTEXT_ID) logged into Uber
// ONCE by hand (pnpm uber:login) so there's no OTP at runtime — and Uber only
// shows prices when signed in.
//
// Hands-free booking happens only when BOTH gates are open: confirm=true (user
// said yes) AND UBER_BOOK_FOR_REAL=true, and only if we actually read a price.
const BOOK_FOR_REAL = process.env.UBER_BOOK_FOR_REAL === "true";

export interface RideQuote {
  ok: boolean;
  booked: boolean;
  eta?: string;
  price?: string;
  /** Pre-filled Uber universal link — opens their app to the destination. */
  link?: string;
  note?: string;
}

function uberDeepLink(destination: string, pickup?: string): string {
  const enc = encodeURIComponent;
  const p = pickup ? `pickup[formatted_address]=${enc(pickup)}` : "pickup=my_location";
  return `https://m.uber.com/ul/?action=setPickup&${p}&dropoff[formatted_address]=${enc(destination)}`;
}

const clean = (v?: string): string | undefined =>
  v && v.trim() && v.trim().toLowerCase() !== "null" ? v.trim() : undefined;

export async function bookUber(
  destination: string,
  opts: { confirm?: boolean; pickup?: string } = {},
): Promise<RideQuote> {
  const { confirm = false, pickup } = opts;
  const link = uberDeepLink(destination, pickup);

  // The live browser automation is opt-in via UBER_LIVE_QUOTE=true; otherwise we
  // return the instant, reliable deep link.
  const LIVE_QUOTE = process.env.UBER_LIVE_QUOTE === "true";
  if (!LIVE_QUOTE || !config.browserbase.apiKey || !config.browserbase.projectId) {
    return { ok: true, booked: false, link, note: "deep link" };
  }

  const stagehand = new Stagehand({
    env: "BROWSERBASE",
    apiKey: config.browserbase.apiKey,
    projectId: config.browserbase.projectId,
    ...stagehandModel(), // gpt-4o by default — the model whose act() Stagehand can parse
    // reuse the persisted, logged-in Uber session so we skip OTP:
    browserbaseSessionCreateParams: {
      projectId: config.browserbase.projectId,
      ...(config.browserbase.contextId
        ? { browserSettings: { context: { id: config.browserbase.contextId, persist: true } } }
        : {}),
    },
  });

  try {
    await stagehand.init();
    await stagehand.context.newPage("https://m.uber.com/go/home");

    const auth = await stagehand.extract(
      "is the user signed in and able to request a ride (NOT on a login/OTP screen)?",
      z.object({ signedIn: z.boolean() }),
    );
    if (!auth.signedIn) {
      log("ride.unauthenticated", {});
      return { ok: true, booked: false, link, note: "uber not logged in — deep link fallback" };
    }

    // gpt-4o-driven act() works (unlike Claude 4.x). Set the route, then read the price.
    if (pickup) {
      await stagehand.act(`set the pickup location field to "${pickup}", then click the first address suggestion`);
    }
    await stagehand.act(`set the dropoff location field to "${destination}", then click the first address suggestion`);
    await stagehand.act(`click the button to search / see ride prices`);
    await new Promise((r) => setTimeout(r, 4000)); // let the ride options + prices render

    const quote = await stagehand.extract(
      "from the ride options shown, read the total price (e.g. $18.40) and the pickup ETA in minutes (e.g. 6 min) for the standard UberX. empty string for anything not visible.",
      z.object({ eta: z.string(), price: z.string() }),
    );
    const price = clean(quote.price);
    const eta = clean(quote.eta);

    let booked = false;
    if (confirm && BOOK_FOR_REAL && price) {
      await stagehand.act("select the standard UberX option and confirm/request the ride");
      booked = true;
    }

    log("ride.quote", { destination, eta, price, booked });
    return { ok: true, booked, eta, price, link };
  } catch (err) {
    log("ride.error", { err: String(err) });
    return { ok: true, booked: false, link, note: "automation hiccup — deep link fallback" };
  } finally {
    await stagehand.close().catch(() => {});
  }
}
