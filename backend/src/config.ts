import dotenv from "dotenv";

dotenv.config();

export interface Config {
  channel: "local" | "bluebubbles";
  port: number;
  anthropicApiKey?: string;
  model: string;
  redisUrl?: string;
  bluebubbles: {
    serverUrl?: string;
    password?: string;
    method: "apple-script" | "private-api";
  };
  publicUrl?: string;
  // The Token Company: wraps the Anthropic SDK to ML-compress the system prompt +
  // non-assistant messages before each call (brief §9). When compressionApiKey is
  // set we wrap the client with `withCompression`; otherwise plain Anthropic.
  tokenCompany: {
    compressionApiKey?: string;
  };
  // Voice notes: Deepgram STT in, Deepgram Aura TTS out (one key for both).
  // Missing key falls back to the text loop.
  deepgramApiKey?: string;
  ttsModel: string;
  healthLinkSecret: string;
  guardian: {
    hrLow: number;
    hrHigh: number;
    heartbeatMs: number;
    escalateAfterMs: number;
  };
}

export const config: Config = {
  channel: process.env.CHANNEL === "bluebubbles" ? "bluebubbles" : "local",
  port: Number(process.env.PORT ?? 8787),
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || undefined,
  model: process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5",
  redisUrl: process.env.REDIS_URL || undefined,
  bluebubbles: {
    serverUrl: process.env.BLUEBUBBLES_SERVER_URL,
    password: process.env.BLUEBUBBLES_PASSWORD,
    method: process.env.BLUEBUBBLES_METHOD === "private-api" ? "private-api" : "apple-script",
  },
  publicUrl: process.env.PUBLIC_URL,
  tokenCompany: {
    compressionApiKey: process.env.TOKEN_COMPANY_API_KEY || undefined,
  },
  deepgramApiKey: process.env.DEEPGRAM_API_KEY || undefined,
  ttsModel: process.env.DEEPGRAM_TTS_MODEL || "aura-2-orion-en",
  healthLinkSecret: process.env.HEALTH_LINK_SECRET || "dev-insecure-health-secret",
  guardian: {
    hrLow: Number(process.env.HR_LOW ?? 45),
    hrHigh: Number(process.env.HR_HIGH ?? 130),
    heartbeatMs: Number(process.env.HEARTBEAT_MS ?? 30000),
    escalateAfterMs: Number(process.env.ESCALATE_AFTER_MS ?? 300000),
  },
};
