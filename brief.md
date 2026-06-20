# Drunk Buddy — Build Spec & Claude Code Kickoff

> Drop this in your repo root as `CLAUDE.md` (or paste as your first Claude Code message). It is the single source of truth for the build. Read it fully before scaffolding.

---

## 0. What we're building (one paragraph)

Drunk Buddy is a contact in your iMessage — an AI friend that watches out for you when you're drunk. There is no app to open and no dashboard. You text it like a person; it texts back with personality and quietly does things for you: checks in, calls your Uber home, orders food, blocks you from drunk-texting your ex, and if you go quiet or your vitals spike, it alerts your emergency contacts with your location. The conversation **is** the product. Everything else (Claude, Deepgram, ElevenLabs, Browserbase, Redis) is invisible plumbing the user never sees.

---

## 1. Product principles (do not violate)

1. **The thread is the product.** No web app, no dashboard. Onboarding happens *in the iMessage thread*. The only external surface is optional one-tap OAuth links (e.g. connect a wearable).
2. **Personality first.** The buddy talks like a real friend — lowercase, casual, warm, funny, protective. Never like an assistant. This is the thing people remember. Protect it.
3. **Sponsors are tools, not screens.** Each integration is something the agent reaches for, hidden behind a clean interface. Never make the user aware of them.
4. **Demo > completeness.** A bulletproof 2-minute happy path beats a broken feature-rich mess. Build a recorded backup demo before the live one.
5. **Mock the edges, nail the spine.** External services (rides, food, vitals) sit behind interfaces so they can be stubbed/simulated and swapped to real without touching the agent.

---

## 2. The personality (seed system prompt for Claude)

Use this as the agent's system prompt base. Tune freely, but keep the voice.

```
You are Drunk Buddy — {name}'s ride-or-die friend who looks out for them when they're drinking.

You text like a real friend: lowercase, casual, short, warm, a little funny. You are NOT an
assistant and you never sound like one — no "How can I help you today?", no bullet points, no
corporate tone. You care about this person and it shows.

Your job is to keep them safe and keep their night good:
- Check in naturally. Don't nag.
- When they seem drunk (slurred voice notes, messy texts, it's late), get gently more attentive.
- You can DO things using your tools: call them a ride home, order food, alert their emergency
  people. Just do it — don't make a big deal of it.
- Guardian mode: if they try to contact someone on their blocklist (ex, boss, parents), talk them
  out of it. Funny but firm. "no. absolutely not. you'll thank me tomorrow."
- If their vitals spike or they go quiet and unresponsive, this is serious. Alert their emergency
  contacts with their location and get them a ride home. Drop the jokes when it's real.
- You NEVER encourage more drinking or anything unsafe. You're the friend who makes sure everyone
  gets home — not the one buying shots. This is harm reduction.

You have memory of who they are, their friends, their home address, and tonight's plan. Use it like
a friend who knows them, not like a database reading a file.

Voice examples:
- "yo. heading out tonight? want me to keep an eye on you?"
- "lol you sound gone. want me to get you home?"
- "uber's 4 min out, blue civic. drink some water ok?"
- "no you are NOT texting your ex rn. sleep on it, talk to me tomorrow."
```

---

## 3. Architecture

```
[user's iPhone — blue bubbles]
        │  ▲
        ▼  │
[Mac running BlueBubbles Server]  (dedicated Apple ID, ngrok public URL, stays awake)
   webhook OUT (new-message) ──► backend
   REST IN (/api/v1/message/text, /api/v1/message/attachment, ?password=) ◄── backend
        │
        ▼
[BACKEND — the agent lives here]
   1. webhook /imessage/incoming  { text | attachment, handle.address, chats[].guid }
   2. resolve user by phone number  ← the join key
   3. if audio attachment → download → ffmpeg → Deepgram STT → text
   4. load context from Redis (profile, friends, blocklist, party-mode, vitals buffer, memory)
   5. (optional) compress prompt via The Token Company base-URL swap
   6. run Claude agent loop with tool schema (§4); wrap calls in Arize tracing
   7. guardian check on any outbound-contact intent
   8. persist memory/state to Redis
   9. reply via channel: text, or ElevenLabs audio attachment
        │
        ├── [Heartbeat worker]  setInterval loop; when party-mode on, polls vitals + last-seen,
        │     escalates (alert_circle + call_ride) on silence + abnormal vitals
        └── [Vitals service]  SIMULATED stream behind an adapter interface (see §6)
```

**Stack:** Node + Express + TypeScript backend. Redis for state. One Mac for the BlueBubbles gateway. Everything else is API calls.

---

## 4. Agent tool schema

Build these as Claude tools. Each external one sits behind an interface with a stub + real impl.

| Tool | Params | Does |
|---|---|---|
| `update_profile` | `field, value` | In-thread onboarding writes (address, contacts, blocklist) → Redis |
| `set_party_mode` | `active: bool, end_time?` | Arms/disarms the night; starts/stops heartbeat |
| `call_ride` | `destination` | Books ride. **Impl: deep link (reliable) + Browserbase (autonomous, fragile)** |
| `order_food` | `query` | Orders food via Browserbase web automation; deep-link fallback |
| `alert_circle` | `reason, location` | Texts emergency contacts (via channel send) with live location |
| `block_intercept` | `target_name, draft` | Guardian check; returns allow/deny + the talk-down line |
| `get_vitals` | — | Reads latest from vitals service (simulated) |
| `remember` / `recall` | `fact` / `query` | Long-term memory in Redis |

Channel send (`send_text`, `send_audio`) is infrastructure, not a model-facing tool — the loop calls it after the agent produces a reply.

---

## 5. Data model (Redis keys)

```
user:{phone}        → { name, home_address, rideshare, created_at }
party:{phone}       → { active, started_at, end_time }
friends:{phone}     → [ { name, phone, is_emergency } ]
blocklist:{phone}   → [ "jess", "mom", "boss" ]
vitals:{phone}      → recent ring buffer [ { ts, hr, hrv, motion } ]
memory:{phone}      → [ { ts, fact } ]
lastseen:{phone}    → ts of last inbound message
```

Phone number (`handle.address` from the webhook) is the join key across everything.

---

## 6. Vitals = simulated feed (HONEST — read this)

WHOOP's cloud API is daily-cadence (recovery/strain/sleep), **not** a live HR stream, and live HR only comes off the band over Bluetooth BLE to a nearby device. Neither is viable for live emergency detection in 20h. So:

- Build a **`VitalsSource` interface**: `subscribe(phone, onTick)`.
- Ship a **`SimulatedVitals`** impl: a controllable stream you can drive from a tiny operator panel or a keypress during the demo — normal → HR climbing → spike → "no movement". This is what fires the escalation.
- Optionally ship a **`WhoopVitals`** impl that pulls real recovery data (OAuth 2.0) as a "look, real data ingests too" garnish — but it does NOT drive the live trigger.

Do not write code that assumes live WHOOP HR exists. It doesn't.

---

## 7. Escalation / heartbeat logic (Orkes is NOT a track — don't use it)

Implement as a plain background worker in the backend (e.g. `setInterval`), no orchestration framework:

```
when party-mode active, every ~90s:
  v = latest vitals
  silent = now - lastseen > SILENCE_THRESHOLD
  if (abnormal(v) && silent) OR fall_signal(v):
       agent.escalate()  →  alert_circle(reason, location) + call_ride(home)
  else if drunk_signal(v) and overdue_checkin:
       agent.check_in()   // a natural "you good?" text
end party-mode at end_time or on user command.
```

---

## 8. In-thread onboarding

On first message from an unknown number, the buddy introduces itself and collects setup *conversationally* (no web form), writing each answer via `update_profile`:
1. name
2. home address (for rides)
3. two emergency contacts (name + number)
4. blocklist names ("anyone I should stop you from texting drunk?")

Then it's armed. Keep it to a short, friendly back-and-forth — 4-5 messages, not an interrogation.

---

## 9. Sponsor wiring cheat-sheet

Grab keys from the matching `spons-*` Discord channels at the event.

| Sponsor | Role | Integration note |
|---|---|---|
| Anthropic (Claude) | Brain / personality / tool-use | Core agent loop. |
| Deepgram | STT — understand slurred voice notes | Download attachment → `ffmpeg` to wav/mp3 → Deepgram. |
| ElevenLabs | TTS — buddy's voice replies | Text → mp3 → send via `/api/v1/message/attachment`. Text reply is the reliable default. |
| Redis | All state + memory | Keys in §5. |
| Browserbase | Real-world actions (ride, food) | Stagehand drives the web flow. **Always ship the deep-link fallback.** |
| The Token Company | Compress the big context prompt | Base-URL swap that keeps the Anthropic SDK — ~30 min add. |
| Arize | Trace + eval the agent | Phoenix tracing on agent calls; small eval set (§10). |

Skip: HRT, Cognichip, Fieldguide, Runpod, Zoox (no API). Skydeck / House Fund are VCs.

---

## 10. Eval story (Arize — your differentiator)

Most teams won't have one. Build a tiny labeled set (~20 transcripts) and trace whether the agent:
- correctly detected "too drunk" vs sober,
- correctly blocked vs allowed an outbound contact,
- escalated only when it should (no false alarms on a sober quiet night).

Report precision on the escalation decision. That's a slide nobody else has.

---

## 11. Build phases (20h, 5 people)

- **Phase 0 (H0–2) — Gateway alive.** BlueBubbles on the Mac, ngrok, register webhook. Prove: text the Apple ID → backend receives webhook → echo a reply blue-bubble. Repo + keys. *Whoever owns the Mac starts NOW; if setup fights back you want to know in hour 1.*
- **Phase 1 (H2–6) — Texting buddy with personality.** Claude loop + seed system prompt + Redis + in-thread onboarding. **End of phase = a real, demoable product** (a friend in your texts that knows you).
- **Phase 2 (H6–10) — Voice + actions.** Deepgram in, ElevenLabs out. `call_ride` (deep link first, then Browserbase), `order_food`, guardian `block_intercept`.
- **Phase 3 (H10–14) — The climax.** Simulated vitals + heartbeat + `alert_circle` escalation. Bolt on The Token Company + Arize tracing.
- **Phase 4 (H14–17) — Polish + backup.** Tighten personality, harden the happy path, **record a backup demo.**
- **Phase 5 (H17–19) — Frat party live test.** Real drunk users. Film everything (sober camera person). This footage is the demo.
- **Phase 6 (H19–20) — Pitch.** Built around the real footage + the eval slide.

---

## 12. Role split (5 people)

1. **Brain + heartbeat** (Harsh) — agent loop, tool schema, escalation logic, system prompt.
2. **Channel + actions** — BlueBubbles adapter, send/receive, `call_ride`/`order_food` (Browserbase + deep link).
3. **Voice** — Deepgram STT pipeline + ElevenLabs TTS, audio attachment send/receive, ffmpeg.
4. **State + onboarding + vitals sim** — Redis schema, in-thread onboarding, `SimulatedVitals` + operator panel.
5. **Demo + eval + pitch** — Arize tracing/eval set, backup recording, frat shoot, deck.

---

## 13. Hard constraints (so you don't chase ghosts)

- **No live WHOOP HR.** Vitals are simulated. (§6)
- **No official Uber booking API.** Deep link + Browserbase only.
- **Mac must stay awake, online, signed in.** Dedicated Apple ID (not personal — automated sends can get flagged). `caffeinate -d`.
- **SIP / Private API** only if you want message effects, tapbacks, or native audio-message bubbles. Plain text + audio attachments work without it.
- **iMessage REST needs HTTPS** (ngrok/Cloudflare with valid SSL). Webhooks need BlueBubbles server ≥ 1.0.0.
- Keep voice/web as a **parallel reliable channel** so a dead Mac can't kill the live demo.

---

## 14. First Claude Code commands

```
Read CLAUDE.md fully. Then:

1. Scaffold a TypeScript monorepo: /backend (Express), /channel (BlueBubbles adapter),
   shared types. Add a Redis client and an .env.example with all sponsor keys.

2. Build the BlueBubbles channel adapter behind a Channel interface:
   - inbound webhook handler at POST /imessage/incoming
   - sendText(chatGuid, text) and sendAudio(chatGuid, filePath)
   - a setup script that registers the webhook via POST /api/v1/webhook

3. Build the agent loop: Claude with the tool schema in §4. Wire the seed system prompt
   from §2. Stub every external tool (call_ride, order_food, get_vitals, etc.) so the loop
   runs end to end with fakes first.

4. Implement the Redis data model (§5) and in-thread onboarding (§8).

Goal for this session: Phase 0 + Phase 1 — I can text the buddy and it replies with
personality, knows who I am, and onboards me in-thread. Stop there and show me the loop working.
```

---

*Ship the texting buddy first. Everything else is a tool it learns to reach for.*