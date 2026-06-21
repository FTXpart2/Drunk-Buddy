import type { Store } from "../store/store";
import type { Actions } from "../tools/actions";
import type { Llm } from "./llm";
import { buildSystemPrompt } from "./prompt";
import { dispatchTool } from "./tools";
import { onboardingStatus } from "../onboarding/onboarding";
import { log } from "../log";

// The agent loop. One inbound text in, one reply out — running tools to
// completion in between. Conversation is persisted as a clean text transcript
// (tool noise stays inside the turn).
export interface Deps {
  store: Store;
  llm: Llm;
  actions: Actions;
  maxSteps: number;
}

export async function handleInbound(
  input: { phone: string; text: string },
  deps: Deps,
): Promise<string> {
  const { phone, text } = input;
  const { store, llm, actions } = deps;

  const [profile, friends, blocklist, party, convo] = await Promise.all([
    store.getProfile(phone),
    store.getFriends(phone),
    store.getBlocklist(phone),
    store.getParty(phone),
    store.getConversation(phone),
  ]);
  await store.setLastSeen(phone, Date.now());

  const status = onboardingStatus(profile, friends);
  const system = buildSystemPrompt({ profile, friends, blocklist, party, status });

  const messages: any[] = [
    ...convo.map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: text },
  ];

  const finalText = await runToolLoop({ system, messages, phone, deps });

  await store.appendConversation(phone, { role: "user", content: text });
  if (finalText) await store.appendConversation(phone, { role: "assistant", content: finalText });

  return finalText || "(…)";
}

// Agent-initiated turn: the guardian/heartbeat noticed something (abnormal HR,
// silence) and wants the buddy to reach out UNPROMPTED. Same context + tools as
// handleInbound, but seeded with a guardian instruction instead of a user text.
// Does NOT bump lastSeen (the user hasn't spoken) and records only the buddy's
// outgoing line in the transcript.
export async function runGuardianCheck(
  input: { phone: string; note: string },
  deps: Deps,
): Promise<string> {
  const { phone, note } = input;
  const { store } = deps;

  const [profile, friends, blocklist, party, convo] = await Promise.all([
    store.getProfile(phone),
    store.getFriends(phone),
    store.getBlocklist(phone),
    store.getParty(phone),
    store.getConversation(phone),
  ]);

  const status = onboardingStatus(profile, friends);
  const system = buildSystemPrompt({ profile, friends, blocklist, party, status });

  const messages: any[] = [
    ...convo.map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: note },
  ];

  const finalText = await runToolLoop({ system, messages, phone, deps });
  if (finalText) await store.appendConversation(phone, { role: "assistant", content: finalText });
  return finalText;
}

// Shared LLM + tool-dispatch loop: run tools to completion, return the final
// text. Mutates `messages` in place with assistant/tool_result turns.
async function runToolLoop(args: {
  system: string;
  messages: any[];
  phone: string;
  deps: Deps;
}): Promise<string> {
  const { system, messages, phone, deps } = args;
  const { store, llm, actions } = deps;

  let finalText = "";
  for (let step = 0; step < deps.maxSteps; step++) {
    const resp = await llm.createMessage({ system, messages });
    messages.push({ role: "assistant", content: resp.content });

    if (resp.stop_reason === "tool_use") {
      const results: any[] = [];
      for (const block of resp.content) {
        if (block.type === "tool_use") {
          log("tool.use", { name: block.name, input: block.input });
          const result = await dispatchTool(block.name, block.input, { phone, store, actions });
          results.push({ type: "tool_result", tool_use_id: block.id, content: result });
        }
      }
      messages.push({ role: "user", content: results });
      continue;
    }

    finalText = textOf(resp.content);
    break;
  }
  return finalText;
}

function textOf(content: any[]): string {
  return content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}
