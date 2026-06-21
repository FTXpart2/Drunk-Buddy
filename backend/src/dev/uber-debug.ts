import { Stagehand } from "@browserbasehq/stagehand";
import { z } from "zod";
import { config } from "../config";
import { stagehandModel } from "../lib/stagehand-model";

// observe() -> act(element): Stagehand's reliable pattern. observe finds the
// exact element (selector), act executes precisely on it. Type via act(), then
// observe+act the suggestion and the Search button.
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const sh = new Stagehand({
    env: "BROWSERBASE",
    apiKey: config.browserbase.apiKey!,
    projectId: config.browserbase.projectId!,
    ...stagehandModel(),
    browserbaseSessionCreateParams: {
      projectId: config.browserbase.projectId!,
      ...(config.browserbase.contextId
        ? { browserSettings: { context: { id: config.browserbase.contextId, persist: true } } }
        : {}),
    },
  });
  await sh.init();
  const sp: any = await sh.context.newPage("https://m.uber.com/go/home");
  const shot = async (n: string) => {
    try {
      await sp.screenshot({ path: `/tmp/${n}.png` });
      console.log("shot", n);
    } catch (e) {
      console.log("shot-fail", n, String(e));
    }
  };

  await sleep(6000);
  await shot("o1-home");

  async function setLoc(label: "pickup" | "dropoff", value: string) {
    await sh.act(`click the ${label} location input field`);
    await sleep(1200);
    await sh.act(`type "${value}" into the location search box`);
    await sleep(3300);
    await shot(`o-${label}-typed`);
    const sug = await sh.observe("the first address suggestion option in the autocomplete dropdown list");
    console.log(`${label} observed suggestions: ${sug?.length ?? 0}`);
    if (sug && sug.length) await sh.act(sug[0]);
    await sleep(2200);
  }

  await setLoc("pickup", "UC Berkeley, Berkeley, CA");
  await setLoc("dropoff", "2024 Durant Ave, Berkeley, CA");
  await shot("o-both-set");

  const searchBtn = await sh.observe("the Search button that shows ride prices");
  console.log(`search observed: ${searchBtn?.length ?? 0}`);
  if (searchBtn && searchBtn.length) await sh.act(searchBtn[0]);
  await sleep(9000);
  await shot("o-prices");

  // We land on a "One more step" screen — figure out what it wants, then advance.
  const step = await sh.extract(
    "describe what this screen is asking the user to do, and the exact label of the main button to proceed",
    z.object({ screen: z.string(), button: z.string() }),
  );
  console.log("STEP:", JSON.stringify(step));

  const cont = await sh.observe("the main button to continue / confirm pickup / see ride prices");
  console.log(`continue observed: ${cont?.length ?? 0}`);
  if (cont && cont.length) await sh.act(cont[0]);
  await sleep(8000);
  await shot("o-prices2");

  const q = await sh.extract(
    "read the total price (e.g. $18.40) and pickup ETA in minutes for the standard UberX or cheapest ride. empty string if not shown.",
    z.object({ price: z.string(), eta: z.string() }),
  );
  console.log("EXTRACT2:", JSON.stringify(q));
  await sh.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
