import express from "express";
import { config } from "./config";
import { createStore } from "./store";
import { createLlm } from "./agent/llm";
import { pickActions } from "./tools/actions";
import { createContacts } from "./contacts/contacts";
import { handleInbound, type Deps } from "./agent/loop";
import { createGuardian } from "./vitals/guardian";
import { createVitalsHandler } from "./vitals/ingest";
import { watchPageHtml } from "./vitals/watch-page";
import { createLocationHandler, resolveAndStoreLocation } from "./location/location";
import { createStt } from "./voice/stt";
import { createTts } from "./voice/tts";
import { transcribeVoiceNote } from "./voice/bridge";
import { toCafOpus } from "./voice/transcode";
import { unlink } from "node:fs/promises";
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
const deps: Deps = { store, llm, actions: pickActions(), contacts, notifyContact, maxSteps: 6 };

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

// Voice notes: Deepgram transcribes inbound notes; Aura speaks the reply back.
const stt = createStt(config.deepgramApiKey);
const tts = createTts(config.deepgramApiKey, config.ttsModel);

channel.onMessage(async (msg) => {
  await store.setChatGuid(msg.phone, msg.chatGuid);
  // They shared a "Send My Current Location" pin → store it as their live pickup,
  // then let the agent continue (it likely just asked for it to book a ride).
  if (msg.location) {
    const addr = await resolveAndStoreLocation(store, msg.phone, msg.location.lat, msg.location.lon);
    log("location.shared", { phone: msg.phone, address: addr });
    const reply = await handleInbound(
      { phone: msg.phone, text: "(i just shared my current location with you)" },
      deps,
    );
    if (reply) await channel.sendText(msg.chatGuid, reply);
    return;
  }

  // Voice note? Download + transcribe it, then treat it exactly like a text.
  let text = msg.text;
  let viaVoice = false;
  if (!text && msg.attachment?.guid && bluebubbles) {
    text = await transcribeVoiceNote(msg, { download: bluebubbles.downloadAttachment, stt });
    viaVoice = true;
  }
  if (!text) {
    await channel.sendText(msg.chatGuid, "couldn't make that out — say it again?");
    return;
  }

  const reply = await handleInbound({ phone: msg.phone, text }, deps);
  if (!reply) return;

  // Reply as TEXT by default. Opt into a spoken reply as a NATIVE iMessage voice
  // bubble with VOICE_REPLY=audio: Aura mp3 -> afconvert CAF/Opus -> Private API.
  // If anything's missing (no Private API, conversion fails) it falls back to
  // text — never an mp3 file, never a dead end.
  if (viaVoice && process.env.VOICE_REPLY === "audio") {
    const mp3 = await tts.synthesize(reply);
    const caf = mp3 ? await toCafOpus(mp3) : null;
    if (mp3) await unlink(mp3).catch(() => {});
    if (caf) {
      try {
        await channel.sendAudio(msg.chatGuid, caf); // native voice bubble (private-api)
        await unlink(caf).catch(() => {});
        return;
      } catch (err) {
        log("voice.bubble_failed", { err: String(err) });
        await unlink(caf).catch(() => {});
        // fall through to a text reply
      }
    }
  }
  await channel.sendText(msg.chatGuid, reply);
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
app.post("/location", createLocationHandler(store));
if (bluebubbles) app.post("/imessage/incoming", bluebubbles.webhook());
if (twilioCh) app.post("/sms/incoming", twilioCh.webhook());

app.listen(config.port, () => log("server.listening", { port: config.port, channel: channel.name }));
await channel.start();
