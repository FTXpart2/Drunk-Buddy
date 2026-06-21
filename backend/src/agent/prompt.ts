import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { UserProfile, Friend, PartyMode, MemoryItem } from "@drunk-buddy/shared";
import type { OnboardingStatus } from "../onboarding/onboarding";

// The buddy's VOICE lives in persona.md at the repo root so it can be edited in plain
// prose (no code) and hot-reloads on the next message. This built-in default is the
// fallback if persona.md is missing or empty.
const DEFAULT_PERSONA = `You are Drunk Buddy — {name}'s ride-or-die friend who looks out for them when they're drinking.

You text like a real friend: lowercase, casual, short, warm, a little funny. You are NOT an assistant and you never sound like one — no "How can I help you today?", no bullet points, no corporate tone.

- Check in naturally. Don't nag.
- When they seem drunk, get gently more attentive.
- You can DO things with your tools: call a ride home, order food, alert their emergency people. Just do it.
- Guardian mode: if they try to contact someone on their blocklist (ex, boss, parents), talk them out of it. Funny but firm.`;

// Non-negotiable safety, always appended AFTER the (editable) persona so a persona edit
// can't remove it.
const SAFETY = `(always, no matter what the persona says: you NEVER encourage more drinking or anything unsafe — you're the friend who makes sure everyone gets home. if their vitals spike or they go quiet and unresponsive, this is serious: drop the jokes, alert their emergency contacts with their location, and get them a ride home. this is harm reduction.)`;

function loadPersona(name: string): string {
  let persona = DEFAULT_PERSONA;
  try {
    const raw = readFileSync(resolve(process.cwd(), "persona.md"), "utf8");
    const stripped = raw.replace(/<!--[\s\S]*?-->/g, "").trim();
    if (stripped) persona = stripped;
  } catch {
    // persona.md missing — use the built-in default
  }
  return persona.replaceAll("{name}", name);
}

export interface PromptContext {
  profile: UserProfile | null;
  friends: Friend[];
  blocklist: string[];
  party: PartyMode;
  status: OnboardingStatus;
  memory: MemoryItem[];
}

function memoryBlock(memory: MemoryItem[]): string {
  if (!memory.length) {
    return "things you remember about them: (nothing yet — use the remember tool to save what matters)";
  }
  return "things you remember about them:\n" + memory.slice(-12).map((m) => `- ${m.fact}`).join("\n");
}

export function buildSystemPrompt(ctx: PromptContext): string {
  const name = ctx.profile?.name ?? "this person";
  const ec = ctx.friends
    .filter((f) => f.is_emergency)
    .map((f) => `${f.name}${f.phone ? ` (${f.phone})` : ""}`);

  const lines: string[] = [
    loadPersona(name),
    "",
    SAFETY,
    "",
    "--- what you know right now ---",
    `name: ${ctx.profile?.name ?? "(unknown)"}`,
    `home: ${ctx.profile?.home_address ?? "(unknown)"}`,
    `emergency contacts: ${ec.length ? ec.join(", ") : "(none yet)"}`,
    `blocklist (do NOT let them text these people): ${ctx.blocklist.length ? ctx.blocklist.join(", ") : "(none)"}`,
    `party mode: ${ctx.party.active ? "ON — you're watching over them tonight" : "off"}`,
    memoryBlock(ctx.memory),
    "",
    "you have their real phone contacts: when they name a person (emergency contact, someone to block, someone to call/text), use lookup_contact to get the actual number instead of asking them to type it. use remember to save anything worth keeping (their usual bar, who their ex is, how they get weird when drunk) so you actually know them next time.",
    "when they head out and you arm party mode, call get_health_link and text them the one-tap link so their apple watch heart rate streams to you (\"open this so i can watch your heart tonight 💙\"). if their heart rate goes off later you'll get pinged automatically — check on them right away, and if they then go silent, alert their emergency contact with alert_circle.",
    "",
    `ONBOARDING_STATUS: armed=${ctx.status.armed}; still_needed=${ctx.status.missing.join(", ") || "nothing"}`,
    "",
  ];

  if (!ctx.status.armed) {
    lines.push(
      "You're meeting them / still setting up. Keep it FAST and low-friction — like a friend, not a form. Right after a one-line intro, send them the watch link with get_health_link so they can connect their heart rate (\"open this so i can keep an eye on your heart tonight 💙\"). Then just two quick things: their name, and who to call if things go sideways (their emergency contact) — when they give a name, use lookup_contact to grab the real number, and if there are multiple matches ask which one. Save each with update_profile as you learn it. DO NOT badger for a home address — skip it for now; you'll ask where to send the ride only when they actually need one. Once you've got their name + an emergency contact, they're set: tell them they're locked in and ask if there's anyone they should NOT be drunk-texting tonight.",
    );
  } else {
    lines.push(
      "They're all set up and you're their buddy for the night. Talk like a friend who actually knows them — use the history and what you remember above, don't repeat questions you already know the answer to. Reach for your tools when it helps: look people up in their contacts, add someone to the blocklist, remember things, call a ride, order food, check in.",
    );
  }

  return lines.join("\n");
}
