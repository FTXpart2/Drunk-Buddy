import { Stagehand } from "@browserbasehq/stagehand";
import { z } from "zod";
import { config } from "../config";
import { log } from "../log";

// Get the user a ride. Two layers: (1) drive the Uber web app in a cloud browser
// (Browserbase + Stagehand) to read a live price, and (2) ALWAYS hand back a
// pre-filled Uber deep link as the dependable path — live-site automation is
// flaky, the deep link never is. Hidden behind the Actions interface (brief §3).
//
// AUTH: reuse a Browserbase Context (BROWSERBASE_CONTEXT_ID) logged into Uber
// ONCE by hand (pnpm uber:login) so there's no OTP at runtime.
//
// Hands-free booking happens only when BOTH gates are open: confirm=true (user
// said yes) AND UBER_BOOK_FOR_REAL=true, and only if we actually read a price.
// Otherwise the deep link is the booking path — one tap in the user's own app.
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

// Opens the user's Uber app to the right ride, one tap to confirm. Real (their
// account + card + a real car) and 100% reliable, so it's our safety net.
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

  // No Browserbase configured → still hand back a real one-tap deep link.
  if (!config.browserbase.apiKey || !config.browserbase.projectId) {
    return { ok: true, booked: false, link, note: "deep link only (browserbase off)" };
  }

  const stagehand = new Stagehand({
    env: "BROWSERBASE",
    apiKey: config.browserbase.apiKey,
    projectId: config.browserbase.projectId,
    // reuse our own Anthropic key as Stagehand's planner brain:
    model: { modelName: "anthropic/claude-sonnet-4-6", apiKey: config.anthropicApiKey },
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

    // Step through atomically: autocomplete needs an explicit suggestion pick
    // (just typing leaves the field unresolved → no route → no price), and
    // prices only render after "Search".
    if (pickup) {
      await stagehand.act(`click the pickup location input field`);
      await stagehand.act(`type "${pickup}" into the focused location field`);
      await stagehand.act(`click the first address suggestion in the dropdown`);
    }
    await stagehand.act(`click the dropoff location input field`);
    await stagehand.act(`type "${destination}" into the focused location field`);
    await stagehand.act(`click the first address suggestion in the dropdown`);
    await stagehand.act(`click the "Search" button to see ride options`);
    await stagehand.act(`select the standard UberX option from the ride list`);

    const quote = await stagehand.extract(
      "read the price (e.g. $14.20) and pickup ETA (e.g. 4 min) for the selected UberX; empty string if not visible",
      z.object({ eta: z.string(), price: z.string() }),
    );
    const price = clean(quote.price);
    const eta = clean(quote.eta);

    let booked = false;
    if (confirm && BOOK_FOR_REAL && price) {
      await stagehand.act("confirm and request the UberX");
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
