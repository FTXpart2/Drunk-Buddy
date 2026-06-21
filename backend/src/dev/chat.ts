import { config } from "../config";
import { createStore } from "../store";
import { createLlm } from "../agent/llm";
import { stubActions } from "../tools/actions";
import { createContacts } from "../contacts/contacts";
import { handleInbound, type Deps } from "../agent/loop";
import { createLocalChannel } from "@drunk-buddy/channel";

// `pnpm dev:chat` — talk to the buddy in your terminal. Forces the local
// channel so you can run the whole loop without the Mac gateway.
const store = createStore();
const llm = createLlm(config);
const contacts = createContacts(config);
const deps: Deps = {
  store,
  llm,
  actions: stubActions,
  contacts,
  notifyContact: async (number, text) => console.error(`\n[alert → ${number}] ${text}\n`),
  maxSteps: 6,
};

const channel = createLocalChannel();
channel.onMessage(async (msg) => {
  const reply = await handleInbound({ phone: msg.phone, text: msg.text ?? "" }, deps);
  if (reply) await channel.sendText(msg.chatGuid, reply);
});

console.error(`drunk buddy ready (llm=${llm.model})`);
await channel.start();
