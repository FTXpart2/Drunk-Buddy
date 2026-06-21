# Drunk Buddy

An AI friend that lives in your iMessage and looks out for you when you're drunk. No app,
no dashboard — you text it like a person and it texts back with personality, quietly doing
things for you (checking in, calling a ride, ordering food, blocking drunk-texts, alerting
your people if you go quiet). **The conversation is the product.**

See [CLAUDE.md](./CLAUDE.md) for the working map and [PLAN.md](./PLAN.md) for the build plan.

## Quick start

```bash
pnpm install
cp .env.example .env        # add ANTHROPIC_API_KEY for real Claude (optional for the demo)

pnpm smoke                  # non-interactive: watch onboarding happen + state persist
pnpm dev:chat               # talk to the buddy in your terminal
pnpm test                   # unit tests for the spine
pnpm typecheck
```

Without `ANTHROPIC_API_KEY`, the loop runs a scripted stand-in so it still works end to
end. Set the key (model `claude-sonnet-4-6`) for the real buddy.

## Layout (pnpm monorepo)

- `shared/`  — domain types + the `Channel` interface
- `channel/` — `LocalChannel` (terminal) + `BlueBubblesChannel` (iMessage webhook) + setup script
- `backend/` — Express app, agent loop, tool schema, `Store` (memory/Redis), onboarding, prompt

## Live iMessage (BlueBubbles) — Phase 0 runbook

The agent runs anywhere; iMessage delivery needs a Mac gateway. One-time setup:

1. **Dedicated Apple ID** on a Mac (not your personal one — automated sends can get flagged).
2. Install **BlueBubbles Server** (>= 1.0.0), sign in with that Apple ID, set a server password.
3. Keep the Mac awake: `caffeinate -d`.
4. Expose the BlueBubbles server over **HTTPS** (ngrok/Cloudflare with valid SSL) ->
   `BLUEBUBBLES_SERVER_URL`.
5. Expose **this backend** over HTTPS too -> `PUBLIC_URL`.
6. Fill `.env`: `CHANNEL=bluebubbles`, `BLUEBUBBLES_SERVER_URL`, `BLUEBUBBLES_PASSWORD`,
   `PUBLIC_URL`, `ANTHROPIC_API_KEY`.
7. `pnpm dev` (starts the server + webhook), then `pnpm channel:register` (points
   BlueBubbles `new-message` events at `PUBLIC_URL/imessage/incoming`).
8. Text the dedicated Apple ID from your phone — the buddy replies in-thread.

`apple-script` send method works without the Private API; switch to `private-api` only if
you want effects/tapbacks/native audio bubbles.

## Live rides (Browserbase + Uber)

`call_ride` drives the Uber web app in a Browserbase cloud browser via Stagehand. It's
hidden behind the `Actions` interface — when `BROWSERBASE_API_KEY` is unset the agent falls
back to the stub, so dev/smoke/tests are unaffected.

**Quote, then confirm.** The buddy never silently books. It first pulls a live price + ETA
(`call_ride confirm=false`), texts the details — "uberX, $14, 4 min — want it?" — and only
books (`call_ride confirm=true`) after the user says yes. A real car is summoned only when
BOTH gates are open: the user confirmed AND `UBER_BOOK_FOR_REAL=true`.

One-time setup:

1. Sign up at [browserbase.com], grab `BROWSERBASE_API_KEY` + `BROWSERBASE_PROJECT_ID`.
2. **Log into Uber once, by hand, and persist it as a Context** (so there's no OTP at
   runtime): create a Browserbase Context, open a session with it, sign into a *dedicated
   test* Uber account (with a saved payment method) in the live session view, then put that
   context id in `BROWSERBASE_CONTEXT_ID`.
3. `pnpm ride:test "1 Telegraph Ave, Berkeley"` — drives the flow in isolation and prints
   the quote. Watch it live in the Browserbase session inspector and tune the `act()`
   prompts in `backend/src/rides/uber.ts` against the live site.
4. `UBER_BOOK_FOR_REAL=false` (default) means it will quote but never tap Confirm, even if
   the user says yes — so it never books a real car. Flip to `true` only once auth + payment
   are verified, so a flaky run can't sink the demo (§13).

## State

In-memory by default. Set `REDIS_URL` to use Redis (sponsor) — no code change. Keys are
documented in [CLAUDE.md](./CLAUDE.md).
