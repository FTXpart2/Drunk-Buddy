# PLAN.md — Drunk Buddy (20h, 5 people)

Source of truth for the build. Owners from brief §12. Check items off as they land.

## This session scope
**Phase 0 (code + runbook) + Phase 1**, demoed via the local channel / smoke runner. Then
STOP and show the loop. BlueBubbles live bring-up is a manual step on the Mac (runbook in
README).

## Phase 0 — Gateway alive (H0–2) — owner: Channel
Goal: text the Apple ID -> backend receives webhook -> echo a reply.
- [x] Scaffold pnpm TS monorepo: shared / channel / backend, tsconfig, .env.example, .gitignore
- [x] `Channel` interface (onMessage, sendText, sendAudio, start)
- [x] `LocalChannel` (terminal chat) — dev/demo without the Mac
- [x] `BlueBubblesChannel`: `POST /imessage/incoming` webhook handler (text|attachment,
      handle.address, chats[].guid); sendText/sendAudio via REST (?password=)
- [x] `register-webhook` setup script (POST /api/v1/webhook)
- [x] Echo/onboarding loop end-to-end on the local channel (`pnpm smoke`)
- [x] Runbook: BlueBubbles install, dedicated Apple ID, ngrok HTTPS, caffeinate, register webhook (README)
- [ ] Live bring-up on the Mac: text the Apple ID -> real blue-bubble reply  *(manual, needs Mac + key)*
- **Checkpoint:** echo reply works (local now; blue bubble once the Mac is up). Repo + keys.

## Phase 1 — Texting buddy with personality (H2–6) — owner: Brain + State
Goal: a real, demoable product — a friend in your texts that knows you, onboards in-thread.
- [x] `Store` interface + in-memory impl + Redis impl (keys §5); phone = join key
- [x] Seed system prompt (§2 voice) in `backend/src/agent/prompt.ts`
- [x] Claude agent loop with tool schema (§4); external tools STUBBED via `Actions` interface
- [x] `update_profile` tool -> Store
- [x] In-thread onboarding (§8): name -> home -> emergency contact -> blocklist; armed via
      a required-field gate (`onboardingStatus`)
- [x] Context load/persist around each turn; `remember`/`recall` wired to Store
- [x] Light tests for the spine (store, onboarding gate, tool dispatch)
- [ ] Personality QA pass on a real transcript with `claude-sonnet-4-6`  *(needs ANTHROPIC_API_KEY)*
- **Checkpoint:** I can text the buddy, it replies with personality, knows who I am, and
  onboards me in-thread. **End of phase = demoable product.** <- session stops here.

## Phase 2 — Voice + actions (H6–10) — owner: Voice + Channel
- [ ] Deepgram STT (attachment -> ffmpeg -> text)
- [ ] ElevenLabs TTS (text -> mp3 -> audio attachment); text reply stays the reliable default
- [ ] `call_ride` (deep link first, Browserbase autonomous later)
- [ ] `order_food` (Browserbase + deep-link fallback)
- [ ] Guardian `block_intercept` real flow (allow/deny + talk-down line)

## Phase 3 — The climax (H10–14) — owner: Brain + State
- [ ] `VitalsSource` interface + `SimulatedVitals` + operator panel/keypress
- [ ] Heartbeat worker (~90s; abnormal+silent OR fall -> escalate; drunk+overdue -> check-in)
- [ ] `alert_circle` (text emergency contacts + location) + `call_ride(home)`
- [ ] (optional) `WhoopVitals` recovery-data garnish (does NOT drive the trigger)
- [ ] The Token Company base-URL swap; Arize/Phoenix tracing on agent calls

## Phase 4 — Polish + backup (H14–17) — owner: Demo
- [ ] Tighten personality; harden the happy path
- [ ] Record a backup demo

## Phase 5 — Frat party live test (H17–19) — owner: Demo
- [ ] Real users; sober camera person; film everything

## Phase 6 — Pitch (H19–20) — owner: Demo
- [ ] Deck around real footage + the Arize eval slide

## Eval (Arize §10) — owner: Demo — parallel track
- [ ] ~20 labeled transcripts; trace drunk-vs-sober, block-vs-allow, escalate-vs-not;
      report escalation precision (the slide nobody else has)

## Hard constraints (§13)
No live WHOOP HR (vitals simulated). No official Uber API (deep link + Browserbase). Mac
stays awake/online/signed-in on a dedicated Apple ID (`caffeinate -d`). iMessage REST needs
HTTPS (ngrok valid SSL); BlueBubbles >= 1.0.0. Keep a parallel reliable channel
(LocalChannel/web) so a dead Mac can't kill the demo.
