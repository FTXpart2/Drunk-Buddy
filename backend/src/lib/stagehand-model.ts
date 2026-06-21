import { config } from "../config";

// Stagehand's internal planner model — the LLM that drives the cloud browser.
// This is SEPARATE from the buddy's conversational Claude. Claude 4.x act() is
// broken in Stagehand 3.6 (the $PARAMETER_NAME tool_use bug, stagehand#1986 /
// vercel-ai#12020), so we default to OpenAI gpt-4o, whose function-calling shape
// Stagehand parses correctly. Override with STAGEHAND_MODEL (e.g.
// "google/gemini-2.5-flash" or "anthropic/claude-sonnet-4-6").
//
// With a matching provider key set we go direct; without one, the bare
// "provider/model" string routes through Browserbase's Model Gateway.
export function stagehandModel(): { model: string | { modelName: string; apiKey: string } } {
  const m = process.env.STAGEHAND_MODEL ?? "openai/gpt-4o";
  const key = m.startsWith("openai/")
    ? process.env.OPENAI_API_KEY
    : m.startsWith("google/")
      ? process.env.GOOGLE_GENERATIVE_AI_API_KEY
      : config.anthropicApiKey;
  return { model: key ? { modelName: m, apiKey: key } : m };
}
