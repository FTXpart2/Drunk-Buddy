import { chromium } from "playwright-core";
import Browserbase from "@browserbasehq/sdk";
import { config } from "../config";

// Validate driving the Browserbase session with RAW playwright-core via CDP —
// full keyboard/getByRole/getByPlaceholder/innerText (Stagehand walls these off).
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const bb = new Browserbase({ apiKey: config.browserbase.apiKey! });
  const session = await bb.sessions.create({
    projectId: config.browserbase.projectId!,
    browserSettings: config.browserbase.contextId
      ? { context: { id: config.browserbase.contextId, persist: true } }
      : undefined,
  });
  console.log("session:", session.id, "connectUrl?", !!session.connectUrl);

  const browser = await chromium.connectOverCDP(session.connectUrl);
  const ctx = browser.contexts()[0];
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  console.log(
    "FULL PLAYWRIGHT? keyboard=" + !!page.keyboard,
    "getByPlaceholder=" + typeof page.getByPlaceholder,
    "getByRole=" + typeof page.getByRole,
    "locator=" + typeof page.locator,
  );

  const shot = async (n: string) => {
    try {
      await page.screenshot({ path: `/tmp/${n}.png` });
      console.log("shot", n);
    } catch (e) {
      console.log("shot-fail", n, String(e));
    }
  };

  await page.goto("https://m.uber.com/go/home", { waitUntil: "domcontentloaded" });
  await sleep(6000);
  await shot("cdp-home");

  async function setLoc(label: string, value: string, tag: string) {
    const field = page.getByText(label, { exact: false });
    console.log(`${tag} field count:`, await field.count().catch(() => -1));
    await field.first().click();
    await sleep(1300);
    await shot(`cdp-${tag}-clicked`);
    await page.keyboard.type(value, { delay: 30 });
    await sleep(3200);
    await shot(`cdp-${tag}-typed`);
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await sleep(2500);
    await shot(`cdp-${tag}-picked`);
  }

  await setLoc("Pickup location", "UC Berkeley, Berkeley, CA", "pickup");
  await setLoc("Dropoff location", "2024 Durant Ave, Berkeley, CA", "dropoff");
  await shot("cdp-both-set");

  const searchBtn = page.getByRole("button", { name: "Search" });
  console.log("search btn count:", await searchBtn.count().catch(() => -1));
  await searchBtn.first().click({ timeout: 6000 }).catch((e) => console.log("search click fail", String(e)));
  await sleep(9000);
  await shot("cdp-prices");

  const bodyText = await page.locator("body").innerText().catch(() => "");
  const price = bodyText.match(/\$\s?\d+(\.\d{2})?/);
  const eta = bodyText.match(/\b\d+\s?min\b/i);
  console.log("PRICE:", price ? price[0] : "none", "| ETA:", eta ? eta[0] : "none");

  await browser.close();
}

main().catch((e) => {
  console.error("ERR", e);
  process.exit(1);
});
