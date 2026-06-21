import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";
import Browserbase from "@browserbasehq/sdk";
import { config } from "../config";
import { log } from "../log";

// Get the user a ride. Two layers: (1) drive the real Uber web app in a cloud
// browser (Browserbase) to read a LIVE UberX price and (optionally) book, and
// (2) ALWAYS hand back a pre-filled Uber link as the dependable fallback. Hidden
// behind the Actions interface (brief §3).
//
// WHY RAW PLAYWRIGHT (not Stagehand): Stagehand's page proxy hides
// keyboard/getByRole/fill, and feeding a connectOverCDP page back into Stagehand
// throws "Failed to resolve V3 Page" (stagehand#1392). So this path is 100% raw
// playwright-core over the Browserbase CDP websocket — deterministic, no LLM in
// the loop, no luck required.
//
// WHY LAT/LNG DEEP-LINK (not typed autocomplete): m.uber.com/go/product accepts
// pickup + drop[0] as URL-encoded JSON {latitude,longitude,addressLine1}. Passing
// coordinates drops both pins straight onto the map and renders the product/price
// screen — skipping (a) the debounced autocomplete that mis-selects the wrong
// suggestion and (b) the "one more step / confirm pickup" screen that the old
// flow stalled on. When we only have an address string (no coords), we fall back
// to a resilient typed-search flow that WAITS for a matching suggestion before
// clicking (the real fix for the mis-selection bug).
//
// AUTH: reuse a Browserbase Context (BROWSERBASE_CONTEXT_ID) logged into Uber
// ONCE by hand (pnpm uber:login) so there's no OTP at runtime — Uber only shows
// prices when signed in. persist:true writes any cookie refresh back to the
// context on release.
//
// Hands-free booking happens only when BOTH gates are open: confirm=true (user
// said yes) AND UBER_BOOK_FOR_REAL=true — and only if we actually read a price.

const BOOK_FOR_REAL = process.env.UBER_BOOK_FOR_REAL === "true";

const UBERX_RE = /uberx/i;
const PRICE_RE = /\$\s?\d[\d,]*(?:\.\d{2})?/;
const ETA_RE = /(\d+)\s*min/i;

export interface RideQuote {
  ok: boolean;
  booked: boolean;
  eta?: string;
  price?: string;
  /** Pre-filled Uber link — opens their app/site to the destination. */
  link?: string;
  note?: string;
  /** Driver/car details read off Uber's matched-driver screen after booking. */
  driver?: string;
  car?: string;
  plate?: string;
}

/** What we read off the screen after a real booking dispatches. */
interface RideDetails {
  booked: boolean;
  driver?: string;
  car?: string;
  plate?: string;
  eta?: string;
}

/** A bare Uber link that opens the APP (not an auth/action page) to the live trip. */
export const UBER_APP_LINK = "https://m.uber.com/go/home";

/** A geocoded place — pass these when you have coordinates (skips autocomplete). */
export interface RidePlace {
  latitude: number;
  longitude: number;
  /** Display label only; Uber routes off lat/lng, not this string. */
  addressLine1: string;
  addressLine2?: string;
}

/**
 * Old-style universal link. Kept as the ultimate fallback — on desktop it bounces
 * to the app-handoff page, but on a phone it opens Uber prefilled, which is what
 * the user actually taps from iMessage.
 */
function uberDeepLink(destination: string, pickup?: string): string {
  const enc = encodeURIComponent;
  const p = pickup ? `pickup[formatted_address]=${enc(pickup)}` : "pickup=my_location";
  return `https://m.uber.com/ul/?action=setPickup&${p}&dropoff[formatted_address]=${enc(destination)}`;
}

/**
 * Coordinate-based web link to the product/price screen. This is what the cloud
 * browser navigates to, and the better link to hand a logged-in user: both pins
 * are set from lat/lng so there is no autocomplete and no confirm-pickup step.
 */
function uberProductUrl(dropoff: RidePlace, pickup?: RidePlace): string {
  const enc = (o: RidePlace) => encodeURIComponent(JSON.stringify(o));
  const parts = [`drop%5B0%5D=${enc(dropoff)}`];
  if (pickup) parts.unshift(`pickup=${enc(pickup)}`);
  return `https://m.uber.com/go/product?${parts.join("&")}`;
}

const clean = (v?: string): string | undefined =>
  v && v.trim() && v.trim().toLowerCase() !== "null" ? v.trim() : undefined;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Book / quote an Uber.
 *
 * @param destination  human address (always used to build the fallback link).
 * @param opts.confirm user said yes — required (with UBER_BOOK_FOR_REAL) to book.
 * @param opts.pickup  human pickup address for the fallback link.
 * @param opts.dropPlace / opts.pickupPlace  geocoded coords — STRONGLY preferred
 *        for the live path: they skip autocomplete + the confirm-pickup screen.
 */
export async function bookUber(
  destination: string,
  opts: {
    confirm?: boolean;
    pickup?: string;
    dropPlace?: RidePlace;
    pickupPlace?: RidePlace;
  } = {},
): Promise<RideQuote> {
  const { confirm = false, pickup, dropPlace, pickupPlace } = opts;

  // The link we hand back no matter what. Prefer the coordinate link (works in a
  // logged-in browser AND on a phone); fall back to the universal link.
  const link = dropPlace
    ? uberProductUrl(dropPlace, pickupPlace)
    : uberDeepLink(destination, pickup);

  // On "yes" with auto-book OFF, don't re-run the slow (~60-90s) automation — the
  // quote already happened; just hand the link to confirm in their own app.
  if (confirm && !BOOK_FOR_REAL) {
    return { ok: true, booked: false, link, note: "confirm: deep link (auto-book off)" };
  }
  // Live automation is opt-in. Without it (or without creds) return the link.
  const LIVE_QUOTE = process.env.UBER_LIVE_QUOTE === "true";
  if (!LIVE_QUOTE || !config.browserbase.apiKey || !config.browserbase.projectId) {
    return { ok: true, booked: false, link, note: "deep link" };
  }

  const bb = new Browserbase({ apiKey: config.browserbase.apiKey });

  let sessionId: string | undefined;
  let browser: Browser | undefined;

  try {
    // ---- 1. Session bound to the PERSISTED, logged-in Uber context ----
    const session = await bb.sessions.create({
      projectId: config.browserbase.projectId,
      keepAlive: true, // survive a Playwright disconnect; we release explicitly below
      proxies: true, // Uber is bot-hostile — residential proxy
      browserSettings: {
        ...(config.browserbase.contextId
          ? { context: { id: config.browserbase.contextId, persist: true } }
          : {}),
        solveCaptchas: true,
        blockAds: true,
        viewport: { width: 1280, height: 900 },
      },
    });
    sessionId = session.id;

    // ---- 2. Connect RAW playwright-core over the CDP websocket ----
    browser = await chromium.connectOverCDP(session.connectUrl);
    // Reuse the EXISTING context+page — browser.newContext() would create a fresh
    // context WITHOUT the persisted Uber cookies (the #1 mistake).
    const context: BrowserContext = browser.contexts()[0];
    const page: Page = context.pages()[0] ?? (await context.newPage());

    page.setDefaultTimeout(30_000);
    page.setDefaultNavigationTimeout(60_000);

    // ---- 3. Navigate straight to the product/price screen ----
    if (dropPlace) {
      // Coordinate path: both pins prefilled, no autocomplete, no confirm screen.
      await page.goto(uberProductUrl(dropPlace, pickupPlace), {
        waitUntil: "domcontentloaded",
      });
    } else {
      // No coords — land on home and type the route with the resilient flow.
      await page.goto("https://m.uber.com/go/home", { waitUntil: "domcontentloaded" });
    }

    // ---- 4. Auth gate: if we got bounced to login, bail to the link ----
    if (await isLoginWall(page)) {
      log("ride.unauthenticated", {});
      return {
        ok: true,
        booked: false,
        link,
        note: "uber not logged in — deep link fallback",
      };
    }

    // ---- 5. If we had to type (no coords), drive the search flow ----
    if (!dropPlace) {
      if (pickup) await fillLocationField(page, pickup, "Pickup location");
      await fillLocationField(page, destination, "Dropoff location");
      // Advance through search + the "one more step / confirm pickup" screen.
      await advanceToPrices(page);
    }

    // ---- 6. Handle a confirm-pickup screen even on the coordinate path ----
    // (Uber sometimes still interstitials a "confirm pickup" map; clear it.)
    await clearConfirmPickup(page);

    // ---- 7. Read the live UberX price + ETA (poll until it renders) ----
    const quote = await readUberXQuote(page, 45_000);
    const price = clean(quote.price);
    const eta = clean(quote.eta);

    // ---- 8. Gated booking ----
    let det: RideDetails = { booked: false };
    if (confirm && BOOK_FOR_REAL && price) {
      det = await requestRide(page);
    }

    log("ride.quote", { destination, eta, price, booked: det.booked, driver: det.driver, car: det.car, plate: det.plate });
    return {
      ok: true,
      booked: det.booked,
      eta: det.eta ?? eta,
      price,
      link,
      driver: det.driver,
      car: det.car,
      plate: det.plate,
      note: price ? undefined : "no price rendered — deep link fallback",
    };
  } catch (err) {
    log("ride.error", { err: String(err) });
    return { ok: true, booked: false, link, note: "automation hiccup — deep link fallback" };
  } finally {
    // Detach Playwright, then REQUEST_RELEASE so the context persists back and we
    // stop billing (keepAlive means close() alone won't end the cloud session).
    await browser?.close().catch(() => {});
    if (sessionId) {
      await bb.sessions
        .update(sessionId, {
          projectId: config.browserbase.projectId!,
          status: "REQUEST_RELEASE",
        })
        .catch((e) => log("ride.release_failed", { err: String(e) }));
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers — all raw Playwright, all defensive (every selector wrapped so a miss
// degrades to the deep-link fallback rather than throwing the whole flow).
// ---------------------------------------------------------------------------

/** Are we sitting on a login / OTP / signup wall instead of the ride flow? */
async function isLoginWall(page: Page): Promise<boolean> {
  if (/\/login|\/oauth|auth\.uber\.com|\/go\/login-redirect/i.test(page.url())) return true;
  // Give the SPA a beat to hydrate, then look for unmistakable login affordances.
  const loginish = page
    .getByRole("button", { name: /continue with|sign in|log in/i })
    .or(page.getByText(/enter your.*(phone|email)|verify your account|one-time code/i))
    .first();
  return await loginish
    .waitFor({ state: "visible", timeout: 4_000 })
    .then(() => true)
    .catch(() => false);
}

/**
 * Open a location field by its visible LABEL text (m.uber.com's fields are
 * clickable text, NOT placeholder inputs — getByPlaceholder finds nothing), type
 * real keystrokes to drive the autocomplete, then pick the first suggestion with
 * the keyboard. Proven (raw-CDP probe) to set the correct place. The coordinate
 * /go/product path skips this entirely.
 */
async function fillLocationField(page: Page, value: string, label: string): Promise<void> {
  await page
    .getByText(label, { exact: false })
    .first()
    .click({ timeout: 20_000 });
  await sleep(1300); // opening a field can navigate to a full-screen search box
  await page.keyboard.type(value, { delay: 35 }); // real keystrokes -> autocomplete
  // The dropdown rows are [role="option"]; the FIRST is Uber's best match. CLICK
  // it (keyboard ArrowDown+Enter skipped the pre-highlighted first row and landed
  // on a same-numbered street in another state -> cross-country route). Prefer the
  // option matching our city ("…, Berkeley, CA" -> "Berkeley") for extra safety.
  const options = page.getByRole("option");
  await options.first().waitFor({ state: "visible", timeout: 8_000 }).catch(() => {});
  await sleep(900); // let the debounce settle to the final typed string
  // Match the option to what we TYPED — the street NUMBER and a street-name WORD
  // (e.g. "2032" + "Hearst"). NEVER blindly take the first row: that grabbed a
  // same-numbered street 3000 miles away. If nothing matches, bail (throw) so
  // bookUber falls back to the pre-filled deep link instead of a wrong location.
  const street = (value.split(",")[0] ?? "").trim();
  const num = street.match(/\d+/)?.[0] ?? "";
  const word = street.replace(/[\d,]+/g, " ").trim().split(/\s+/)[0] ?? "";
  const city = value.split(",").map((s) => s.trim())[1] ?? "";
  let chosen = options;
  if (num) chosen = chosen.filter({ hasText: num });
  if (word) chosen = chosen.filter({ hasText: word });
  let target = chosen.first();
  if (!(await target.count().catch(() => 0)) && city) {
    target = options.filter({ hasText: city }).first(); // same-city fallback
  }
  if (!(await target.count().catch(() => 0))) {
    throw new Error(`no matching suggestion for "${value}" — falling back to link`);
  }
  await target.click({ timeout: 8_000 });
  await sleep(2200);
}

/** Click through "Search" → "one more step / confirm pickup" to the price list. */
async function advanceToPrices(page: Page): Promise<void> {
  const next = page
    .getByRole("button", { name: /^(search|see prices|done|next|confirm)$/i })
    .first();
  await next.click({ timeout: 8_000 }).catch(() => {});
  await sleep(1500);
}

/**
 * The "one more step / confirm pickup" map screen has its own advance button.
 * Stalling here is why no price ever rendered. Click it if present — idempotent.
 */
async function clearConfirmPickup(page: Page): Promise<void> {
  for (let i = 0; i < 2; i++) {
    const confirmBtn = page
      .getByRole("button", { name: /confirm pickup|confirm|choose this pickup|done|search/i })
      .first();
    const visible = await confirmBtn
      .waitFor({ state: "visible", timeout: 3_000 })
      .then(() => true)
      .catch(() => false);
    if (!visible) return;
    // Only click if we're NOT already on a screen showing prices (avoid nuking
    // the product list with a stray "confirm").
    if (await hasPrice(page)) return;
    await confirmBtn.click({ timeout: 5_000 }).catch(() => {});
    await sleep(1500);
  }
}

/** True if a price string is visible anywhere right now (cheap pre-check). */
async function hasPrice(page: Page): Promise<boolean> {
  return await page
    .getByText(PRICE_RE)
    .first()
    .isVisible()
    .catch(() => false);
}

/**
 * Poll the product list until the UberX row renders a price, then parse price +
 * ETA from the text around the UberX label. Resilient to hashed classnames: we
 * target by VISIBLE TEXT, never by CSS class.
 */
async function readUberXQuote(
  page: Page,
  timeoutMs: number,
): Promise<{ price?: string; eta?: string }> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    // Prefer the row that actually says "UberX".
    const uberxRow = page
      .getByRole("button")
      .filter({ hasText: UBERX_RE })
      .or(page.locator("li, [role='listitem']").filter({ hasText: UBERX_RE }))
      .first();

    const rowText = await uberxRow
      .innerText({ timeout: 2_000 })
      .catch(() => "");

    if (rowText && PRICE_RE.test(rowText)) {
      return parsePriceEta(rowText);
    }

    // No explicit UberX label yet — if ANY price is on screen, grab the first
    // priced product row (UberX is typically the cheapest standard option).
    const anyRow = page
      .getByText(PRICE_RE)
      .first();
    const anyText = await anyRow
      .evaluate((el) => (el.closest("li,[role='button'],[role='listitem']") ?? el).textContent ?? "")
      .catch(() => "");
    // Require an ETA next to the price — a real ride row has both ("$12 · 9 min").
    // A lone "$" (promos, banners) is NOT a quote (that's the bogus "$8" bug).
    if (anyText && PRICE_RE.test(anyText) && ETA_RE.test(anyText)) {
      // Keep polling briefly for the labelled UberX row, but this is a valid quote.
      const parsed = parsePriceEta(anyText);
      if (parsed.price) {
        // one short re-check for a proper UberX label before returning
        await sleep(1200);
        const labelled = await page
          .getByRole("button")
          .filter({ hasText: UBERX_RE })
          .first()
          .innerText({ timeout: 1_500 })
          .catch(() => "");
        if (labelled && PRICE_RE.test(labelled)) return parsePriceEta(labelled);
        return parsed;
      }
    }

    await sleep(1500);
  }
  return {};
}

function parsePriceEta(text: string): { price?: string; eta?: string } {
  const price = text.match(PRICE_RE)?.[0]?.replace(/\s+/g, "");
  const etaMatch = text.match(ETA_RE);
  const eta = etaMatch ? `${etaMatch[1]} min` : undefined;
  return { price, eta };
}

// The request went through once ANY of these appear (the spinner "Requesting
// your ride", then the matched-driver screen).
const DISPATCHED_RE =
  /requesting your ride|finding (you )?a?\s*(driver|ride)|matching you|your driver|driver is|arriving|on (the |your )?way|you're all set|en route|confirmed|requested/i;

/** Select UberX and click Request to actually dispatch the ride, then wait for the
 *  matched driver and read the car/driver/plate/ETA off the screen. Gated by
 *  UBER_BOOK_FOR_REAL (this books a REAL car). Screenshots each pass to /tmp. */
async function requestRide(page: Page): Promise<RideDetails> {
  // UberX is pre-selected (the bottom button reads "Request UberX"), so DON'T
  // click the option rows or the price — that opens the "Price Breakdown" modal
  // and blocks the button. Just dismiss any modal and click Request/Confirm.
  let dispatched = false;
  for (let step = 0; step < 4; step++) {
    if (await page.getByText(DISPATCHED_RE).first().isVisible().catch(() => false)) {
      dispatched = true;
      break;
    }
    await page.keyboard.press("Escape").catch(() => {});
    await page
      .getByRole("button", { name: /^close$/i })
      .first()
      .click({ timeout: 1_500 })
      .catch(() => {});
    await page.screenshot({ path: `/tmp/book-${step}.png` }).catch(() => {});
    const btn = page
      .getByRole("button", { name: /^request\b/i })
      .or(page.getByRole("button", { name: /^confirm/i }))
      .first();
    const clicked = await btn
      .click({ timeout: 6_000 })
      .then(() => true)
      .catch(() => false);
    await sleep(3_500);
    if (!clicked && step > 0) break;
  }

  if (!dispatched) {
    dispatched = await page
      .getByText(DISPATCHED_RE)
      .first()
      .waitFor({ state: "visible", timeout: 25_000 })
      .then(() => true)
      .catch(() => false);
  }
  if (!dispatched) return { booked: false };

  // The ride is booked. Wait (capped) for Uber to MATCH a driver, then read the
  // car/driver/plate/ETA. Always returns booked:true even if details don't load.
  await page
    .getByText(/min away|arriving|on (the|your) way|license|plate/i)
    .first()
    .waitFor({ state: "visible", timeout: 30_000 })
    .catch(() => {});
  await sleep(2_500);
  await page.screenshot({ path: "/tmp/booked.png" }).catch(() => {});
  const details = await captureRideDetails(page);
  // Log the raw screen text so the exact driver-card fields can be locked in.
  const screen = await page
    .evaluate(() => ((globalThis as any).document?.body?.innerText ?? "").replace(/\n+/g, " | ").slice(0, 900))
    .catch(() => "");
  log("ride.booked", { ...details, screen });
  return { booked: true, ...details };
}

/** Best-effort read of the matched-driver card (refined from real screen text). */
async function captureRideDetails(
  page: Page,
): Promise<{ driver?: string; car?: string; plate?: string; eta?: string }> {
  return await page
    .evaluate(() => {
      const doc = (globalThis as any).document;
      const txt: string = (doc?.body?.innerText ?? "").replace(/ /g, " ");
      const lines = txt
        .split("\n")
        .map((l: string) => l.trim())
        .filter(Boolean);
      const out: { driver?: string; car?: string; plate?: string; eta?: string } = {};
      const eta = txt.match(/(\d+)\s*min(?:ute)?s?\s*(?:away|out)?/i);
      if (eta) out.eta = `${eta[1]} min`;
      // License plate: a 5–8 char token with BOTH letters and digits.
      const plate = lines.find(
        (l: string) =>
          /^[A-Z0-9]{5,8}$/.test(l.replace(/\s/g, "")) && /[A-Z]/.test(l) && /\d/.test(l),
      );
      if (plate) out.plate = plate.replace(/\s/g, "");
      // Car: a short line containing a color word ("White Toyota Prius").
      const car = lines.find(
        (l: string) =>
          /\b(white|black|silver|gray|grey|blue|red|green|gold|beige|brown|tan)\b/i.test(l) &&
          l.split(/\s+/).length <= 5 &&
          l.length < 40,
      );
      if (car) out.car = car;
      return out;
    })
    .catch(() => ({}));
}
