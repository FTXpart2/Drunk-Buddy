import { chromium, type Browser, type Page } from "playwright-core";
import Browserbase from "@browserbasehq/sdk";
import { config } from "../config";
import { log } from "../log";

// Drive the REAL Uber Eats web app in a Browserbase cloud browser via raw
// playwright-core over CDP — same approach as rides/uber.ts (Stagehand's act()
// was too unreliable). Model = "real quote + one-tap order": find an OPEN
// restaurant near the user, read its name + delivery ETA, and hand back a
// tap-to-order link. We never auto-build a cart or place an order (no fragile
// per-restaurant customization flow, no accidental real charges) — the user taps
// the link and confirms + pays in their own app. Hidden behind Actions.
//
// AUTH: ubereats.com is a DIFFERENT domain than m.uber.com, so it has its own
// login in the persisted context — run `pnpm eats:login` once.

const LIVE_QUOTE = process.env.EATS_LIVE_QUOTE === "true";
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export interface FoodQuote {
  ok: boolean;
  ordered: boolean;
  item?: string;
  place?: string;
  eta?: string;
  total?: string;
  /** Tap-to-order link — opens the chosen restaurant (or search) in Uber Eats. */
  link?: string;
  /** True when nothing near them is open/delivering — never offer a closed spot. */
  closed?: boolean;
  note?: string;
}

/** Uber Eats search link — the dependable fallback (opens the app to results). */
function eatsSearchLink(query: string): string {
  return `https://www.ubereats.com/search?q=${encodeURIComponent(query)}`;
}

export async function orderEats(query: string): Promise<FoodQuote> {
  const link = eatsSearchLink(query);
  if (!LIVE_QUOTE || !config.browserbase.apiKey || !config.browserbase.projectId) {
    return { ok: true, ordered: false, item: query, link, note: "deep link" };
  }

  const bb = new Browserbase({ apiKey: config.browserbase.apiKey });
  let sessionId: string | undefined;
  let browser: Browser | undefined;
  try {
    const session = await bb.sessions.create({
      projectId: config.browserbase.projectId,
      keepAlive: true,
      proxies: true,
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
    browser = await chromium.connectOverCDP(session.connectUrl);
    const ctx = browser.contexts()[0];
    const page: Page = ctx.pages()[0] ?? (await ctx.newPage());
    page.setDefaultTimeout(30_000);
    page.setDefaultNavigationTimeout(60_000);

    await page.goto("https://www.ubereats.com/", { waitUntil: "domcontentloaded" });
    await sleep(3000);

    if (await eatsLoginWall(page)) {
      log("food.unauthenticated", {});
      return { ok: true, ordered: false, item: query, link, note: "eats not logged in — run pnpm eats:login" };
    }

    // ---- search by navigating straight to the results URL (the `pl` param carries
    // the saved delivery address) — deterministic, skips the suggestions overlay ----
    const pl = page.url().match(/[?&]pl=([^&]+)/)?.[1];
    const searchUrl = `https://www.ubereats.com/search?${pl ? `pl=${pl}&` : ""}q=${encodeURIComponent(query)}`;
    await page.goto(searchUrl, { waitUntil: "domcontentloaded" }).catch(() => {});
    await page.locator('a[href*="/store/"]').first().waitFor({ state: "visible", timeout: 20_000 }).catch(() => {});
    await sleep(3000); // let the full results grid finish rendering

    // ---- collect the top result cards. Search results DON'T expose open/ETA in
    // their text, so the real open-check is each store's own page (below). ----
    const cards: { href: string; text: string }[] = await page.evaluate(() => {
      const doc = (globalThis as any).document;
      const seen = new Set<string>();
      const out: { href: string; text: string }[] = [];
      for (const a of Array.from(doc.querySelectorAll('a[href*="/store/"]')) as any[]) {
        const href = a.getAttribute("href");
        if (!href || seen.has(href)) continue;
        seen.add(href);
        out.push({ href, text: (a.textContent || "").trim().replace(/\s+/g, " ").slice(0, 70) });
      }
      return out.slice(0, 5);
    });
    log("food.cards", { query, texts: cards.map((c) => c.text) });

    // ---- walk the top results; take the FIRST one that's genuinely OPEN. Each
    // store page is the source of truth for open/closed + the delivery ETA. ----
    let found: { place: string; eta?: string; link: string } | null = null;
    for (const card of cards.slice(0, 3)) {
      const storeLink = card.href.startsWith("http") ? card.href : `https://www.ubereats.com${card.href}`;
      await page.goto(storeLink, { waitUntil: "domcontentloaded" }).catch(() => {});
      await page.locator("h1").first().waitFor({ state: "visible", timeout: 12_000 }).catch(() => {});
      await sleep(1000);
      const info = await page.evaluate(() => {
        const doc = (globalThis as any).document;
        const name = (doc.querySelector("h1")?.textContent || "").trim();
        const head: string = (doc.body.innerText || "").slice(0, 700); // store header region
        const closed =
          /\bclosed\b|currently unavailable|not (currently )?(available|delivering)|opens (at|on|in|tomorrow)/i.test(head);
        const eta = head.match(/(\d+\s*(?:–|-|to)\s*\d+|\d+)\s*min/i)?.[0];
        return { name, eta, closed };
      });
      if (info.name && !info.closed) {
        found = { place: info.name, eta: info.eta?.replace(/\s+/g, " "), link: storeLink };
        break;
      }
      log("food.skip_closed", { query, place: info.name });
    }

    if (!found) {
      log("food.closed", { query });
      return { ok: true, ordered: false, item: query, closed: true, link, note: "nothing open" };
    }
    log("food.quote", { query, place: found.place, eta: found.eta });
    return { ok: true, ordered: false, item: query, place: found.place, eta: found.eta, link: found.link };
  } catch (err) {
    log("food.error", { err: String(err) });
    return { ok: true, ordered: false, item: query, link, note: "hiccup — deep link" };
  } finally {
    await browser?.close().catch(() => {});
    if (sessionId) {
      await bb.sessions
        .update(sessionId, { projectId: config.browserbase.projectId!, status: "REQUEST_RELEASE" })
        .catch((e) => log("food.release_failed", { err: String(e) }));
    }
  }
}

async function eatsLoginWall(page: Page): Promise<boolean> {
  if (/auth\.uber\.com|\/login\b/i.test(page.url())) return true;
  // Wait (generously) for a POSITIVE logged-in signal — the search box or the
  // saved delivery-address label. Don't infer "not logged in" from a slow render.
  const loggedIn = await page
    .locator('input[placeholder*="Search" i], [data-testid="delivery-address-label"]')
    .first()
    .waitFor({ state: "visible", timeout: 15_000 })
    .then(() => true)
    .catch(() => false);
  return !loggedIn;
}
