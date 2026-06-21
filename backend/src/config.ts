import dotenv from "dotenv";

dotenv.config();

export type ChannelName = "local" | "bluebubbles" | "twilio" | "telegram";

export interface Config {
  channel: ChannelName;
  port: number;
  anthropicApiKey?: string;
  model: string;
  redisUrl?: string;
  bluebubbles: {
    serverUrl?: string;
    password?: string;
    method: "apple-script" | "private-api";
  };
  twilio: {
    accountSid?: string;
    authToken?: string;
    fromNumber?: string;
  };
  telegram: {
    botToken?: string;
  };
  publicUrl?: string;
  healthLinkSecret: string;
  guardian: {
    hrLow: number;
    hrHigh: number;
    heartbeatMs: number;
    escalateAfterMs: number;
  };
}

function channelFrom(v?: string): ChannelName {
  if (v === "bluebubbles") return "bluebubbles";
  if (v === "twilio") return "twilio";
  if (v === "telegram") return "telegram";
  return "local";
}

export const config: Config = {
  channel: channelFrom(process.env.CHANNEL),
  port: Number(process.env.PORT ?? 8787),
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || undefined,
  model: process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5",
  redisUrl: process.env.REDIS_URL || undefined,
  bluebubbles: {
    serverUrl: process.env.BLUEBUBBLES_SERVER_URL,
    password: process.env.BLUEBUBBLES_PASSWORD,
    method: process.env.BLUEBUBBLES_METHOD === "private-api" ? "private-api" : "apple-script",
  },
  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID,
    authToken: process.env.TWILIO_AUTH_TOKEN,
    fromNumber: process.env.TWILIO_FROM_NUMBER,
  },
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN,
  },
  publicUrl: process.env.PUBLIC_URL,
  healthLinkSecret: process.env.HEALTH_LINK_SECRET || "dev-insecure-health-secret",
  guardian: {
    hrLow: Number(process.env.HR_LOW ?? 45),
    hrHigh: Number(process.env.HR_HIGH ?? 130),
    heartbeatMs: Number(process.env.HEARTBEAT_MS ?? 30000),
    escalateAfterMs: Number(process.env.ESCALATE_AFTER_MS ?? 300000),
  },
};
