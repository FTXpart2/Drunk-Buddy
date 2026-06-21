import { chromium } from "playwright-core";
import Browserbase from "@browserbasehq/sdk";
import { config } from "../config";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

// One-time: `pnpm eats:login`.
// ubereats.com is a DIFFERENT domain than m.uber.com, so the rides login doesn't
// carry over — Uber Eats needs its own signed-in session. This opens ubereats.com
// in the SAME persisted context (BROWSERBASE_CONTEXT_ID) and lets you log in by
// hand (it should SSO off your existing Uber login) and set a delivery address.
// On release the ubereats.com cookies persist into the context, so the agent
// never hits a login/OTP at runtime.
async function main() {
  const { apiKey, projectId, contextId } = config.browserbase;
  if (!apiKey || !projectId) {
    console.error("Set BROWSERBASE_API_KEY and BROWSERBASE_PROJECT_ID in .env first.");
    process.exit(1);
  }
  if (!contextId) {
    console.error("Set BROWSERBASE_CONTEXT_ID first (run `pnpm uber:login`).");
    process.exit(1);
  }

  const bb = new Browserbase({ apiKey });
  const session = await bb.sessions.create({
    projectId,
    keepAlive: true,
    proxies: true,
    browserSettings: {
      context: { id: contextId, persist: true },
      solveCaptchas: true,
      blockAds: true,
      viewport: { width: 1280, height: 900 },
    },
  });

  console.log("\n=== LOG INTO UBER EATS (one time) ===");
  console.log("Live view:  https://www.browserbase.com/sessions/" + session.id);
  console.log("…or browserbase.com → Sessions → the running session.\n");
  console.log("In the live view:");
  console.log("  1) click 'Log in' (top right) — it should SSO with your Uber account");
  console.log("  2) set your delivery address (your home)");
  console.log("  3) come back here and press Enter\n");

  const browser = await chromium.connectOverCDP(session.connectUrl);
  const ctx = browser.contexts()[0];
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  await page.goto("https://www.ubereats.com/", { waitUntil: "domcontentloaded" }).catch(() => {});

  const rl = createInterface({ input: stdin, output: stdout });
  await rl.question("Press Enter once you're logged into Uber Eats with a delivery address set… ");
  rl.close();

  await browser.close(); // detach
  await bb.sessions
    .update(session.id, { projectId, status: "REQUEST_RELEASE" }) // persist cookies into the context
    .catch(() => {});

  console.log("\n✅ done — ubereats.com login saved into your context.");
  console.log("Add this to .env only when you want it to ACTUALLY order (it spends money):");
  console.log("EATS_ORDER_FOR_REAL=true\n");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
