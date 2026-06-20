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
};
