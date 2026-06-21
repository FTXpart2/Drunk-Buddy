import { createClient, AgentEvents } from "@deepgram/sdk";
import type WebSocket from "ws";
import type { Store } from "../store/store";
import type { Actions } from "../tools/actions";
import { buildSystemPrompt } from "../agent/prompt";
import { onboardingStatus } from "../onboarding/onboarding";
import { dispatchTool } from "../agent/tools";
import { getVoiceTools } from "./tools-adapter";
import { log } from "../log";

export interface VoiceSessionDeps {
  store: Store;
  actions: Actions;
  deepgramApiKey: string;
  anthropicApiKey: string;
  model: string;
  elevenLabsApiKey?: string;
}

export class VoiceSession {
  private keepAliveTimer: ReturnType<typeof setInterval> | null = null;
  private deepgramWs: ReturnType<ReturnType<typeof createClient>["agent"]> | null = null;

  constructor(
    private clientWs: WebSocket,
    private callerPhone: string,
    private deps: VoiceSessionDeps,
  ) {}

  async init(): Promise<void> {
    const { store, deepgramApiKey, anthropicApiKey, model, elevenLabsApiKey } = this.deps;
    const phone = this.callerPhone;

    const [profile, friends, blocklist, party] = await Promise.all([
      store.getProfile(phone),
      store.getFriends(phone),
      store.getBlocklist(phone),
      store.getParty(phone),
    ]);

    const status = onboardingStatus(profile, friends);
    const systemPrompt = buildSystemPrompt({ profile, friends, blocklist, party, status, mode: "voice" });

    const client = createClient(deepgramApiKey);
    const agent = client.agent();
    this.deepgramWs = agent;

    agent.on(AgentEvents.Open, () => {
      log("voice.deepgram.open", { phone });

      agent.configure({
        audio: {
          input: { encoding: "linear16", sample_rate: 16000 },
          output: { encoding: "linear16", sample_rate: 16000, container: "none" },
        },
        agent: {
          listen: { provider: { type: "deepgram", model: "nova-3" } },
          think: {
            provider: { type: "anthropic", model },
            endpoint: {
              url: "https://api.anthropic.com/v1",
              headers: { "x-api-key": anthropicApiKey },
            },
            prompt: systemPrompt,
            functions: getVoiceTools(),
          },
          speak: elevenLabsApiKey
            ? {
                provider: { type: "eleven_labs", model_id: "JBFqnCBsd6RMkjVDRZzb" },
                endpoint: {
                  url: "https://api.elevenlabs.io/v1",
                  headers: { "xi-api-key": elevenLabsApiKey },
                },
              }
            : { provider: { type: "deepgram", model: "aura-asteria-en" } },
        },
        greeting: "yo, what's up? everything ok?",
      });
    });

    agent.on(AgentEvents.SettingsApplied, () => {
      log("voice.settings.applied", { phone });
    });

    agent.on(AgentEvents.Audio, (audio: Buffer) => {
      if (this.clientWs.readyState === this.clientWs.OPEN) {
        this.clientWs.send(audio);
      }
    });

    agent.on(AgentEvents.FunctionCallRequest, async (data: any) => {
      for (const fn of data.functions ?? []) {
        log("voice.tool.call", { phone, name: fn.name });
        try {
          const args = typeof fn.arguments === "string" ? JSON.parse(fn.arguments) : fn.arguments;
          const result = await dispatchTool(fn.name, args, {
            phone,
            store: this.deps.store,
            actions: this.deps.actions,
          });
          agent.functionCallResponse({ id: fn.id, name: fn.name, content: result });
        } catch (err) {
          agent.functionCallResponse({ id: fn.id, name: fn.name, content: `error: ${err}` });
        }
      }
    });

    agent.on(AgentEvents.ConversationText, async (data: any) => {
      if (data.role === "assistant" && data.content) {
        await store.appendConversation(phone, { role: "assistant", content: data.content });
      }
      if (data.role === "user" && data.content) {
        await store.appendConversation(phone, { role: "user", content: data.content });
      }
    });

    agent.on(AgentEvents.Error, (err: any) => {
      log("voice.deepgram.error", { phone, error: JSON.stringify(err, null, 2) });
    });

    agent.on(AgentEvents.Close, () => {
      log("voice.deepgram.close", { phone });
      this.cleanup();
    });

    // Forward client audio to Deepgram
    this.clientWs.on("message", (data: Buffer) => {
      if (this.deepgramWs) {
        this.deepgramWs.send(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
      }
    });

    this.clientWs.on("close", () => {
      log("voice.client.close", { phone });
      this.cleanup();
    });

    this.keepAliveTimer = setInterval(() => {
      if (this.deepgramWs) this.deepgramWs.keepAlive();
    }, 7000);

    await store.setLastSeen(phone, Date.now());
  }

  cleanup(): void {
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
    if (this.deepgramWs) {
      this.deepgramWs.disconnect();
      this.deepgramWs = null;
    }
    if (this.clientWs.readyState === this.clientWs.OPEN) {
      this.clientWs.close();
    }
  }
}
