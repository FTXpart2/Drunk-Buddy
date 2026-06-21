import express from "express";
import { config } from "./config";
import { createStore } from "./store";
import { createLlm } from "./agent/llm";
import { stubActions } from "./tools/actions";
import { handleInbound, type Deps } from "./agent/loop";
import { createGuardian } from "./vitals/guardian";
import { createVitalsHandler } from "./vitals/ingest";
import { watchPageHtml } from "./vitals/watch-page";
import { createStt } from "./voice/stt";
import { createTts } from "./voice/tts";
import { transcribeVoiceNote } from "./voice/bridge";
import { createLocalChannel, createBlueBubblesChannel, type BlueBubblesChannel } from "@drunk-buddy/channel";
import type { Channel } from "@drunk-buddy/shared";
import { unlink } from "node:fs/promises";
import { log } from "./log";

// Production-ish entrypoint: serves the BlueBubbles webhook (or runs the local
// channel) and wires every inbound message through the agent loop.
const store = createStore();
const llm = createLlm(config);
const deps: Deps = { store, llm, actions: stubActions, maxSteps: 6 };

let channel: Channel;
let bluebubbles: BlueBubblesChannel | null = null;
if (config.channel === "bluebubbles") {
  if (!config.bluebubbles.serverUrl || !config.bluebubbles.password) {
    log("config.error", { note: "CHANNEL=bluebubbles but BLUEBUBBLES_SERVER_URL/PASSWORD not set" });
    process.exit(1);
  }
  bluebubbles = createBlueBubblesChannel({
    serverUrl: config.bluebubbles.serverUrl!,
    password: config.bluebubbles.password!,
    method: config.bluebubbles.method,
  });
  channel = bluebubbles;
} else {
  channel = createLocalChannel();
}

// The guardian reaches the user out of band, so remember where to send (chatGuid)
// and how (the channel) per phone.
const guardian = createGuardian({
  store,
  deps,
  send: async (phone, text) => {
    const guid = await store.getChatGuid(phone);
    if (guid) await channel.sendText(guid, text);
    else log("guardian.no_chat", { phone });
  },
});

// Voice notes: Deepgram transcribes inbound, ElevenLabs speaks the reply.
const stt = createStt(config.deepgramApiKey);
const tts = createTts(config.deepgramApiKey, config.ttsModel);

channel.onMessage(async (msg) => {
  await store.setChatGuid(msg.phone, msg.chatGuid);

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

  // Reply in kind: voice note in -> spoken reply out (fall back to text).
  if (viaVoice) {
    const mp3 = await tts.synthesize(reply);
    if (mp3) {
      await channel.sendAudio(msg.chatGuid, mp3);
      await unlink(mp3).catch(() => {});
      return;
    }
  }
  await channel.sendText(msg.chatGuid, reply);
});

const app = express();
app.use(express.json({ limit: "10mb" }));
app.get("/health", (_req, res) => {
  res.json({ ok: true, channel: channel.name, model: llm.model });
});

// The page the buddy links one-tap; it streams the user's watch HR back here.
app.get("/watch", (_req, res) => {
  res.type("html").send(watchPageHtml());
});
app.post("/vitals", createVitalsHandler(store, guardian));

if (bluebubbles) {
  app.post("/imessage/incoming", bluebubbles.webhook());
}

app.listen(config.port, () => log("server.listening", { port: config.port, channel: channel.name }));
await channel.start();
