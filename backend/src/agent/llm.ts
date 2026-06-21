import Anthropic from "@anthropic-ai/sdk";
import type { Config } from "../config";
import { log } from "../log";
import { TOOLS } from "./tools";

// LLM behind a thin interface so the loop is identical whether we're calling
// real Claude or the scripted stand-in used when no API key is present.
export interface LlmArgs {
  system: string;
  messages: any[];
}

export interface LlmResponse {
  content: any[];
  stop_reason: string | null;
}

export interface Llm {
  readonly model: string;
  createMessage(args: LlmArgs): Promise<LlmResponse>;
}

export class AnthropicLlm implements Llm {
  private client: Anthropic;
  constructor(
    apiKey: string,
    readonly model: string,
  ) {
    this.client = new Anthropic({ apiKey });
  }

  async createMessage({ system, messages }: LlmArgs): Promise<LlmResponse> {
    const resp = await this.client.messages.create({
      model: this.model,
      max_tokens: 1024,
      system,
      tools: TOOLS as any,
      messages: messages as any,
    });
    return { content: resp.content as any[], stop_reason: resp.stop_reason };
  }
}

export function createLlm(config: Config): Llm {
  if (config.anthropicApiKey) {
    log("llm.anthropic", { model: config.model });
    return new AnthropicLlm(config.anthropicApiKey, config.model);
  }
  log("llm.mock", { reason: "no ANTHROPIC_API_KEY — using scripted stand-in" });
  return new MockLlm();
}

// ---------------------------------------------------------------------------
// MockLlm: a scripted onboarding buddy used ONLY when ANTHROPIC_API_KEY is
// absent, so the full loop (channel -> agent -> tools -> store) is provable
// without a key. It reads the ONBOARDING_STATUS line from the system prompt
// (the same signal the real model uses) to decide what to collect next.
// The moment a key is set, AnthropicLlm + claude-haiku-4-5 takes over.
// ---------------------------------------------------------------------------
const PHONE_RE = /(\+?\d[\d\-\s().]{6,}\d)/;

export class MockLlm implements Llm {
  readonly model = "mock";
  private introduced = false;
  private followup: string | null = null;
  private counter = 0;

  async createMessage({ system, messages }: LlmArgs): Promise<LlmResponse> {
    // Second phase of a tool round-trip: a tool just ran, deliver the line we queued.
    if (hasPendingToolResult(messages)) {
      const text = this.followup ?? "done. anything else?";
      this.followup = null;
      return this.text(text);
    }

    const stillNeeded = parseStillNeeded(system);
    const user = lastUserText(messages).trim();

    if (stillNeeded.length > 0) {
      if (!this.introduced) {
        this.introduced = true;
        return this.text(
          "yo! i'm your drunk buddy. i look out for you when you're out drinking. quick setup so i can actually help — what's your name?",
        );
      }
      const target = stillNeeded[0];
      if (target.includes("name")) {
        const name = cleanName(user);
        this.followup = `nice to meet you ${name}. where's home? (so i can get you a ride later)`;
        return this.toolUse("update_profile", { field: "name", value: name });
      }
      if (target.includes("address")) {
        this.followup =
          "got it. last thing — give me one emergency contact: a name + number, in case stuff goes sideways.";
        return this.toolUse("update_profile", { field: "home_address", value: user });
      }
      if (target.includes("emergency")) {
        const phone = (user.match(PHONE_RE)?.[1] ?? "").trim();
        const name = cleanContactName(user, phone);
        this.followup =
          "perfect, you're all set. i've got you tonight. anyone i should stop you from drunk-texting? (ex, boss, parents…)";
        return this.toolUse("update_profile", {
          field: "emergency_contact",
          value: name,
          contact_phone: phone,
          is_emergency: true,
        });
      }
    }

    // Armed: handle a blocklist ask, otherwise just be a friend.
    if (/text|ex\b|block|stop me|don't let me/i.test(user)) {
      const targetName = extractBlockName(user);
      this.followup = `locked. if you try to text ${targetName} tonight i'm shutting it down. you'll thank me.`;
      return this.toolUse("update_profile", { field: "blocklist_name", value: targetName });
    }

    return this.text(
      "i gotchu. just keep me posted tonight — text me when you head out or if you need anything. drink some water.",
    );
  }

  private text(t: string): LlmResponse {
    return { content: [{ type: "text", text: t }], stop_reason: "end_turn" };
  }
  private toolUse(name: string, input: any): LlmResponse {
    return {
      content: [{ type: "tool_use", id: `mock_${++this.counter}`, name, input }],
      stop_reason: "tool_use",
    };
  }
}

function lastUserText(messages: any[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === "user" && typeof m.content === "string") return m.content;
  }
  return "";
}

function hasPendingToolResult(messages: any[]): boolean {
  const last = messages[messages.length - 1];
  return (
    !!last &&
    last.role === "user" &&
    Array.isArray(last.content) &&
    last.content.some((b: any) => b.type === "tool_result")
  );
}

function parseStillNeeded(system: string): string[] {
  const m = system.match(/still_needed=([^\n]*)/);
  if (!m) return [];
  const v = m[1].trim();
  if (!v || v === "nothing") return [];
  return v.split(",").map((s) => s.trim()).filter(Boolean);
}

function cleanName(s: string): string {
  const cleaned = s
    .replace(/^(hey,?\s*)?(i'?m|i am|my name is|this is|it'?s|name'?s)\s+/i, "")
    .replace(/[.!]+$/, "")
    .trim();
  return cleaned || s.trim();
}

function cleanContactName(s: string, phone: string): string {
  let t = phone ? s.replace(phone, "") : s;
  t = t.replace(/[^A-Za-z\s]/g, " ").replace(/\s+/g, " ").trim();
  const cap = t.match(/[A-Z][a-z]+/);
  return cap?.[0] ?? (t.split(" ").pop() || "contact");
}

function extractBlockName(s: string): string {
  const m = s.match(/(?:texting|text|ex|block)\s+(?:my\s+\w+\s+)?([A-Z][a-z]+)/);
  if (m) return m[1];
  const caps = s.match(/[A-Z][a-z]+/g);
  return caps?.[caps.length - 1] ?? "them";
}
