import { MemoryStore } from "../store/memory";
import { createLlm } from "../agent/llm";
import { config } from "../config";
import { stubActions } from "../tools/actions";
import { stubContacts } from "../contacts/contacts";
import { handleInbound, type Deps } from "../agent/loop";
import { onboardingStatus } from "../onboarding/onboarding";

// `pnpm smoke` — non-interactive proof the loop works end to end: pumps a
// scripted conversation through the agent and prints the transcript + the
// state it persisted. Uses real Claude if ANTHROPIC_API_KEY is set, otherwise
// the scripted stand-in.
const store = new MemoryStore();
const llm = createLlm(config);
const deps: Deps = { store, llm, actions: stubActions, contacts: stubContacts, maxSteps: 6 };
const phone = "+14155550199";

const script = [
  "yo",
  "i'm Harsh",
  "i live at 221B Baker St, San Francisco",
  "if anything happens call my roommate Sam at +14155550123",
  "stop me from texting my ex Jordan tonight",
  "what do you know about me?",
];

console.log(`\n=== Drunk Buddy smoke test (llm=${llm.model}) ===`);
for (const text of script) {
  console.log(`\nyou:   ${text}`);
  const reply = await handleInbound({ phone, text }, deps);
  console.log(`buddy: ${reply}`);
}

const profile = await store.getProfile(phone);
const friends = await store.getFriends(phone);
const blocklist = await store.getBlocklist(phone);
const party = await store.getParty(phone);

console.log("\n=== persisted state ===");
console.log("profile:    ", profile);
console.log("friends:    ", friends);
console.log("blocklist:  ", blocklist);
console.log("party:      ", party);
console.log("onboarding: ", onboardingStatus(profile, friends));
console.log();
