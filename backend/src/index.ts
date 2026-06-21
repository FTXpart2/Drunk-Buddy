import express from "express";
import { config } from "./config";
import { createStore } from "./store";
import { createLlm } from "./agent/llm";
import { stubActions } from "./tools/actions";
import { createContacts } from "./contacts/contacts";
import { handleInbound, type Deps } from "./agent/loop";
import { createGuardian } from "./vitals/guardian";
import { createVitalsHandler } from "./vitals/ingest";
import { watchPageHtml } from "./vitals/watch-page";
import {
  createLocalChannel,
  createBlueBubblesChannel,
  createTwilioChannel,
  createTelegramChannel,
  type BlueBubblesChannel,
  type TwilioChannel,
} from "@drunk-buddy/channel";
import type { Channel } from "@drunk-buddy/shared";
import { log } from "./log";

// Entrypoint: serves the channel webhook (BlueBubbles or Twilio) or runs a polling
// channel (Telegram / local), and wires every inbound message through the agent loop.
// The agent is identical regardless of channel — that's the point of the interface.
const store = createStore();
const llm = createLlm(config);
const contacts = createContacts(config);

let channel: Channel;
let bluebubbles: BlueBubblesChannel | null = null;
let twilioCh: TwilioChannel | null = null;

if (config.channel === "bluebubbles") {
  if (!config.bluebubbles.serverUrl || !config.bluebubbles.password) {
    log("config.error", { note: "CHANNEL=bluebubbles but BLUEBUBBLES_SERVER_URL/PASSWORD not set" });
    process.exit(1);
  }
  bluebubbles = createBlueBubblesChannel({
    serverUrl: config.bluebubbles.serverUrl,
    password: config.bluebubbles.password,
    method: config.bluebubbles.method,
  });
  channel = bluebubbles;
} else if (config.channel === "twilio") {
  if (!config.twilio.accountSid || !config.twilio.authToken || !config.twilio.fromNumber) {
    log("config.error", { note: "CHANNEL=twilio but TWILIO_ACCOUNT_SID/AUTH_TOKEN/FROM_NUMBER not set" });
    process.exit(1);
  }
  twilioCh = createTwilioChannel({
    accountSid: config.twilio.accountSid,
    authToken: config.twilio.authToken,
    fromNumber: config.twilio.fromNumber,
  });
  channel = twilioCh;
} else if (config.channel === "telegram") {
  if (!config.telegram.botToken) {
    log("config.error", { note: "CHANNEL=telegram but TELEGRAM_BOT_TOKEN not set" });
    process.exit(1);
  }
  channel = createTelegramChannel({ botToken: config.telegram.botToken });
} else {
  channel = createLocalChannel();
}

// Texting an emergency contact at their real number, channel-aware:
// iMessage sends to a fresh 1:1 chat (iMessage;-;<number>), Twilio sends SMS.
const notifyContact = async (number: string, text: string): Promise<void> => {
  if (bluebubbles) await bluebubbles.sendText(`iMessage;-;${number}`, text);
  else if (twilioCh) await twilioCh.sendText(number, text);
  else log("notify.skip", { number, note: `channel '${channel.name}' can't text external numbers` });
};
const deps: Deps = { store, llm, actions: stubActions, contacts, notifyContact, maxSteps: 6 };

// The guardian reaches the user out of band (heart-rate check-in / escalation),
// so it needs where to text them (persisted chatGuid) and how (the channel).
const guardian = createGuardian({
  store,
  deps,
  send: async (phone, text) => {
    const guid = await store.getChatGuid(phone);
    if (guid) await channel.sendText(guid, text);
    else log("guardian.no_chat", { phone });
  },
});

channel.onMessage(async (msg) => {
  await store.setChatGuid(msg.phone, msg.chatGuid);
  if (!msg.text) {
    await channel.sendText(msg.chatGuid, "can't hear voice notes yet — text me for now.");
    return;
  }
  const reply = await handleInbound({ phone: msg.phone, text: msg.text }, deps);
  if (reply) await channel.sendText(msg.chatGuid, reply);
});

const app = express();
app.use(express.json({ limit: "10mb" })); // BlueBubbles posts JSON
app.use(express.urlencoded({ extended: false })); // Twilio posts form-encoded
app.get("/health", (_req, res) => {
  res.json({ ok: true, channel: channel.name, model: llm.model });
});
// One-tap page the buddy texts; it streams the user's watch HR back to /vitals.
app.get("/watch", (_req, res) => {
  res.type("html").send(watchPageHtml());
});
app.post("/vitals", createVitalsHandler(store, guardian));
if (bluebubbles) app.post("/imessage/incoming", bluebubbles.webhook());
if (twilioCh) app.post("/sms/incoming", twilioCh.webhook());

app.listen(config.port, () => log("server.listening", { port: config.port, channel: channel.name }));
await channel.start();
