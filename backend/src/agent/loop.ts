import type { Store } from "../store/store";
import type { Actions } from "../tools/actions";
import type { Contacts } from "../contacts/contacts";
import type { Llm } from "./llm";
import { buildSystemPrompt } from "./prompt";
import { dispatchTool } from "./tools";
import { onboardingStatus } from "../onboarding/onboarding";
import { log } from "../log";

export interface Deps {
  store: Store;
  llm: Llm;
  actions: Actions;
  contacts: Contacts;
  /** Text an arbitrary number (emergency-contact alerts). */
  notifyContact: (number: string, text: string) => Promise<void>;
  maxSteps: number;
}

// Build the buddy's current system prompt + recent conversation for a phone.
async function buildContext(phone: string, store: Store) {
  const [profile, friends, blocklist, party, convo, memory] = await Promise.all([
    store.getProfile(phone),
    store.getFriends(phone),
    store.getBlocklist(phone),
    store.getParty(phone),
    store.getConversation(phone),
    store.recallMemory(phone),
  ]);
  const status = onboardingStatus(profile, friends);
  const system = buildSystemPrompt({ profile, friends, blocklist, party, status, memory });
  return { system, convo };
}

// Run the Claude tool loop to completion; returns the buddy's final text.
async function runToolLoop(system: string, messages: any[], deps: Deps, phone: string): Promise<string> {
  const { store, llm, actions, contacts, notifyContact } = deps;
  let finalText = "";
  for (let step = 0; step < deps.maxSteps; step++) {
    const resp = await llm.createMessage({ system, messages });
    messages.push({ role: "assistant", content: resp.content });

    if (resp.stop_reason === "tool_use") {
      const results: any[] = [];
      for (const block of resp.content) {
        if (block.type === "tool_use") {
          log("tool.use", { name: block.name, input: block.input });
          const result = await dispatchTool(block.name, block.input, {
            phone,
            store,
            actions,
            contacts,
            notifyContact,
          });
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

// A real inbound message from the user.
export async function handleInbound(input: { phone: string; text: string }, deps: Deps): Promise<string> {
  const { phone, text } = input;
  await deps.store.setLastSeen(phone, Date.now());

  const { system, convo } = await buildContext(phone, deps.store);
  const messages: any[] = [
    ...convo.map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: text },
  ];

  const finalText = await runToolLoop(system, messages, deps, phone);

  await deps.store.appendConversation(phone, { role: "user", content: text });
  if (finalText) await deps.store.appendConversation(phone, { role: "assistant", content: finalText });
  return finalText || "(…)";
}

// The guardian reaching out UNPROMPTED (heart-rate check-in / escalation). The
// `note` is an internal instruction, not a user turn: we do NOT touch lastSeen,
// and only the buddy's outbound text is logged to the transcript.
export async function runGuardianCheck(input: { phone: string; note: string }, deps: Deps): Promise<string> {
  const { phone, note } = input;
  const { system, convo } = await buildContext(phone, deps.store);
  const messages: any[] = [
    ...convo.map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: note },
  ];

  const finalText = await runToolLoop(system, messages, deps, phone);
  if (finalText) await deps.store.appendConversation(phone, { role: "assistant", content: finalText });
  return finalText;
}

function textOf(content: any[]): string {
  return content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}
