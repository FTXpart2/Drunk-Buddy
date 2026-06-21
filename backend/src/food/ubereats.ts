import { Stagehand } from "@browserbasehq/stagehand";
import { z } from "zod";
import { config } from "../config";
import { log } from "../log";
import { stagehandModel } from "../lib/stagehand-model";

// Drive Uber Eats in a Browserbase cloud browser via Stagehand v3 — same shape
// as rides/uber.ts. Hidden behind the Actions interface; the agent never knows.
//
// AUTH: reuses the SAME Browserbase Context as rides (BROWSERBASE_CONTEXT_ID) —
// Uber Eats shares the Uber login, so one persisted, hand-logged-in session with
// a saved payment + address covers both. See README "Live food".
//
// Ordering only happens when BOTH gates are open: the agent passes confirm=true
// (the user said yes to the quote) AND EATS_ORDER_FOR_REAL=true (the master
// money switch). Either off → we build the cart and read the total but never
// place the order (brief §4: a flaky run can't spend the user's money mid-demo).
const ORDER_FOR_REAL = process.env.EATS_ORDER_FOR_REAL === "true";

export interface FoodQuote {
  ok: boolean;
  ordered: boolean;
  item?: string;
  place?: string;
  total?: string;
  eta?: string;
  note?: string;
}

export async function orderEats(
  query: string,
  opts: { confirm?: boolean } = {},
): Promise<FoodQuote> {
  const { confirm = false } = opts;
  if (!config.browserbase.apiKey || !config.browserbase.projectId) {
    return { ok: false, ordered: false, note: "browserbase not configured" };
  }

  const stagehand = new Stagehand({
    env: "BROWSERBASE",
    apiKey: config.browserbase.apiKey,
    projectId: config.browserbase.projectId,
    ...stagehandModel(),
    browserbaseSessionCreateParams: {
      projectId: config.browserbase.projectId,
      ...(config.browserbase.contextId
        ? { browserSettings: { context: { id: config.browserbase.contextId, persist: true } } }
        : {}),
    },
  });

  await stagehand.init();
  try {
    await stagehand.context.newPage("https://www.ubereats.com/");

    // Bail loudly if the session isn't logged in rather than hanging on auth.
    const auth = await stagehand.extract(
      "is the user signed in with a delivery address set (NOT on a login/sign-up screen)?",
      z.object({ signedIn: z.boolean() }),
    );
    if (!auth.signedIn) {
      log("food.unauthenticated", {});
      return { ok: false, ordered: false, note: "uber eats session not logged in — refresh BROWSERBASE_CONTEXT_ID" };
    }

    // NOTE: these act() prompts are the part to tune against the live site.
    await stagehand.act(`search for "${query}" and open the best-rated nearby place that delivers`);
    await stagehand.act(`add the item that best matches "${query}" to the cart`);
    await stagehand.act("go to the cart / checkout and stop at the order review (do NOT place it yet)");

    const quote = await stagehand.extract(
      "read the restaurant name, the main item, the order total, and the delivery ETA",
      z.object({ place: z.string(), item: z.string(), total: z.string(), eta: z.string() }),
    );

    let ordered = false;
    if (confirm && ORDER_FOR_REAL) {
      await stagehand.act("place the order");
      ordered = true;
    }

    log("food.quote", { query, place: quote.place, total: quote.total, eta: quote.eta, ordered });
    return { ok: true, ordered, item: quote.item, place: quote.place, total: quote.total, eta: quote.eta };
  } finally {
    await stagehand.close();
  }
}
