import { chromium } from "playwright-core";
import Browserbase from "@browserbasehq/sdk";
import { config } from "../config";

// Probe Uber Eats in the persisted (Uber-logged-in) Browserbase context: is it
// signed in on ubereats.com (different domain than m.uber.com)? What's the search
// box? Dumps structure + screenshots so we can build the raw-Playwright flow.
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const bb = new Browserbase({ apiKey: config.browserbase.apiKey! });
  const session = await bb.sessions.create({
    projectId: config.browserbase.projectId!,
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
  const browser = await chromium.connectOverCDP(session.connectUrl);
  const ctx = browser.contexts()[0];
  const page: any = ctx.pages()[0] ?? (await ctx.newPage());
  page.setDefaultTimeout(30_000);

  await page.goto("https://www.ubereats.com/", { waitUntil: "domcontentloaded" });
  await sleep(7000);
  console.log("URL:", page.url());
  await page.screenshot({ path: "/tmp/eats-1.png" });

  const info = await page.evaluate(() => {
    const doc = (globalThis as any).document;
    const txt: string = (doc.body.innerText || "").slice(0, 600);
    const inputs = Array.from(doc.querySelectorAll("input"))
      .map((i: any) => ({ ph: i.placeholder, aria: i.getAttribute("aria-label"), type: i.type }))
      .slice(0, 10);
    const signInVisible = /\b(sign in|log in|create account|sign up)\b/i.test(txt);
    const hasAddress = /deliver(y| to)|address|current location/i.test(txt);
    return { txt: txt.replace(/\n+/g, " | "), inputs, signInVisible, hasAddress };
  });
  console.log("=== SIGN-IN VISIBLE (login wall?):", info.signInVisible);
  console.log("=== HAS ADDRESS/DELIVERY UI:", info.hasAddress);
  console.log("=== INPUTS:", JSON.stringify(info.inputs));
  console.log("=== TEXT:", info.txt);

  await browser.close();
  await bb.sessions
    .update(session.id, { projectId: config.browserbase.projectId!, status: "REQUEST_RELEASE" })
    .catch(() => {});
}

main().catch((e) => {
  console.error("ERR", e);
  process.exit(1);
});
