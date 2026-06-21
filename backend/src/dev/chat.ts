import express from "express";
import { config } from "../config";
import { createStore } from "../store";
import { createLlm } from "../agent/llm";
import { stubActions } from "../tools/actions";
import { handleInbound, type Deps } from "../agent/loop";
import { createGuardian } from "../vitals/guardian";
import { createVitalsHandler } from "../vitals/ingest";
import { watchPageHtml } from "../vitals/watch-page";
import { createLocalChannel } from "@drunk-buddy/channel";
import { log } from "../log";

// `pnpm dev:chat` — talk to the buddy in your terminal. Forces the local
// channel so you can run the whole loop without the Mac gateway. Also serves
// /watch + /vitals so you can demo the heart-rate guardian: POST a spike and the
// buddy texts you back, unprompted, right in the terminal.
const store = createStore();
const llm = createLlm(config);
const deps: Deps = { store, llm, actions: stubActions, maxSteps: 6 };

const channel = createLocalChannel();
const guardian = createGuardian({
  store,
  deps,
  send: async (phone, text) => {
    const guid = await store.getChatGuid(phone);
    if (guid) await channel.sendText(guid, text);
  },
});

channel.onMessage(async (msg) => {
  await store.setChatGuid(msg.phone, msg.chatGuid);
  const reply = await handleInbound({ phone: msg.phone, text: msg.text ?? "" }, deps);
  if (reply) await channel.sendText(msg.chatGuid, reply);
});

const app = express();
app.use(express.json({ limit: "10mb" }));
app.get("/watch", (_req, res) => res.type("html").send(watchPageHtml()));
app.post("/vitals", createVitalsHandler(store, guardian));
app.listen(config.port, () => log("dev.vitals", { url: `http://localhost:${config.port}/watch` }));

console.error(`drunk buddy ready (llm=${llm.model})`);
await channel.start();
