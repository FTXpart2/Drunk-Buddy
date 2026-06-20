# CLAUDE.md — Drunk Buddy

**What we're building:** Drunk Buddy is a contact in your iMessage — an AI friend that
looks out for you when you're drunk. No app, no dashboard. You text it like a person; it
texts back with personality and quietly does things: checks in, calls your Uber, orders
food, blocks drunk-texts to your ex, and escalates to your emergency contacts if you go
silent or your vitals spike. **The conversation IS the product.** Claude, Deepgram,
ElevenLabs, Browserbase, Redis are invisible plumbing the user never sees.

## Non-negotiables (do not violate)
1. **The thread is the product.** No web app/dashboard. Onboarding happens in the iMessage
   thread. Only external surface = optional one-tap OAuth links.
2. **Personality first.** lowercase, casual, short, warm, funny, protective. NEVER an
   assistant — no "How can I help you today?", no bullet points, no corporate tone. This is
   what people remember. Protect it in every code path that emits text.
3. **Sponsors are tools, not screens.** Every integration hides behind a clean interface
   the user never sees.
4. **Demo > completeness.** A bulletproof 2-min happy path beats a broken feature-rich
   mess. Record a backup demo.
5. **Mock the edges, nail the spine.** Every external service (channel, store, rides, food,
   vitals) sits behind an interface with a stub/sim impl; swap to real without touching the agent.

## The voice
Talk like a real friend who cares. Examples:
- "yo. heading out tonight? want me to keep an eye on you?"
- "lol you sound gone. want me to get you home?"
- "uber's 4 min out, blue civic. drink some water ok?"
- "no you are NOT texting your ex rn. sleep on it, talk to me tomorrow."

Harm reduction always — never encourage drinking; you're the friend who gets everyone
home. Drop the jokes when it's a real emergency. Seed system prompt: `backend/src/agent/prompt.ts`.

## Architecture
```
iPhone (blue bubbles) <-> BlueBubbles server (Mac, dedicated Apple ID, ngrok)
   webhook in / REST out
backend (the agent lives here):
  webhook -> resolve user by phone (the join key) -> [audio? Deepgram STT] -> load context
  (Store) -> Claude agent loop (tools) -> guardian check -> persist -> reply (text, or
  ElevenLabs audio)
  + Heartbeat worker (setInterval; party-mode polls vitals + last-seen -> escalate)   [Phase 3]
  + Vitals = SIMULATED stream behind a VitalsSource interface                          [Phase 3]
```
For dev/demo without the Mac, `LocalChannel` (terminal) implements the same `Channel`
interface, so the whole loop is testable now. Keep a working non-iMessage channel alive —
a dead Mac can't kill the live demo (brief §13).

## Where code lives (pnpm monorepo)
- `shared/`  — domain types + the `Channel`/`InboundMessage` interface
- `channel/` — `createLocalChannel` (dev); `createBlueBubblesChannel` (webhook +
  sendText/sendAudio); `register-webhook` setup script
- `backend/` — Express app; agent loop + tool schema + tool dispatch; `Store`
  (in-memory + Redis); onboarding; system prompt; `Actions` (stubbed); vitals seed

Key files: `backend/src/agent/loop.ts` (the loop), `agent/tools.ts` (tool schema §4 +
dispatch), `agent/prompt.ts` (voice §2), `agent/llm.ts` (real Claude + scripted stand-in),
`store/` (state §5), `onboarding/onboarding.ts` (the arming gate), `tools/actions.ts`
(external edges).

## Agent tools (brief §4)
update_profile, set_party_mode, call_ride, order_food, alert_circle, block_intercept,
get_vitals, remember/recall. Each external tool routes through the `Actions` interface
(stub now, real later). send_text/send_audio are channel infra, not model-facing tools.

## State (Redis keys §5) — phone number is the join key
`user:{phone}`, `party:{phone}`, `friends:{phone}`, `blocklist:{phone}`,
`vitals:{phone}` (ring buffer), `memory:{phone}`, `lastseen:{phone}`, plus `convo:{phone}`
(recent transcript, added for multi-turn). Behind a `Store` interface: in-memory by
default, Redis when `REDIS_URL` is set.

## Commands
- `pnpm install`
- `pnpm smoke`           — non-interactive proof the loop works (prints transcript + state)
- `pnpm dev:chat`        — talk to the buddy in your terminal (local channel)
- `pnpm dev`             — run the server; `CHANNEL=bluebubbles` for live iMessage
- `pnpm channel:register` — register the webhook with a running BlueBubbles server
- `pnpm typecheck` / `pnpm test`

Config via `.env` (never committed) — see `.env.example`. Model: `claude-haiku-4-5`
(cheap for testing; override with `ANTHROPIC_MODEL`, e.g. `claude-sonnet-4-6`).
Without `ANTHROPIC_API_KEY`, the loop auto-uses a scripted stand-in so it still runs;
set the key for real Claude.

## Conventions
- TypeScript strict, ESM, run with `tsx` (no build step needed for dev). Edges behind
  interfaces; stub/sim impls first, real swapped in later.
- No secrets in git (public repo): commit only `.env.example`; real `.env` is gitignored.
- Commits: simple, clear, imperative ("add channel interface"). No AI/tool attribution.
- Never make the user aware of sponsors/tools. Keep the voice intact everywhere.

## When to plan / ask / stop
- **Plan** before multi-file or architectural changes; PLAN.md is the source of truth — check tasks off.
- **Ask** when a choice is the user's (model, real-vs-stub, demo strategy) or the brief is
  ambiguous — and push back if something's wrong.
- **Stop** at phase checkpoints and show the working loop. This session stops after Phase 0
  (code) + Phase 1.
