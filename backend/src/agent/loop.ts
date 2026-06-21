import type { Store } from "../store/store";
import type { Actions } from "../tools/actions";
import type { Contacts } from "../contacts/contacts";
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
  contacts: Contacts;
  maxSteps: number;
}

export async function handleInbound(
  input: { phone: string; text: string },
  deps: Deps,
): Promise<string> {
  const { phone, text } = input;
  const { store, llm, actions, contacts } = deps;

  const [profile, friends, blocklist, party, convo, memory] = await Promise.all([
    store.getProfile(phone),
    store.getFriends(phone),
    store.getBlocklist(phone),
    store.getParty(phone),
    store.getConversation(phone),
    store.recallMemory(phone),
  ]);
  await store.setLastSeen(phone, Date.now());

  const status = onboardingStatus(profile, friends);
  const system = buildSystemPrompt({ profile, friends, blocklist, party, status, memory });

  const messages: any[] = [
    ...convo.map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: text },
  ];

  let finalText = "";
  for (let step = 0; step < deps.maxSteps; step++) {
    const resp = await llm.createMessage({ system, messages });
    messages.push({ role: "assistant", content: resp.content });

    if (resp.stop_reason === "tool_use") {
      const results: any[] = [];
      for (const block of resp.content) {
        if (block.type === "tool_use") {
          log("tool.use", { name: block.name, input: block.input });
          const result = await dispatchTool(block.name, block.input, { phone, store, actions, contacts });
          results.push({ type: "tool_result", tool_use_id: block.id, content: result });
        }
      }
      messages.push({ role: "user", content: results });
      continue;
    }

    finalText = textOf(resp.content);
    break;
  }

  await store.appendConversation(phone, { role: "user", content: text });
  if (finalText) await store.appendConversation(phone, { role: "assistant", content: finalText });

  return finalText || "(…)";
}

function textOf(content: any[]): string {
  return content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}
