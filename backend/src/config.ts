import dotenv from "dotenv";

dotenv.config();

export type ChannelName = "local" | "bluebubbles" | "twilio";

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
  publicUrl?: string;
}

function channelFrom(v?: string): ChannelName {
  if (v === "bluebubbles") return "bluebubbles";
  if (v === "twilio") return "twilio";
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
  publicUrl: process.env.PUBLIC_URL,
};
