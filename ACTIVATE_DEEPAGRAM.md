# Activate Deepgram (voice notes)

Deepgram does both: transcribe inbound voice notes (STT) and speak the buddy's
replies (Aura TTS). One key, on the **server machine**. Run from the repo root.

## 1. Put the team key in `.env`
We already have a team Deepgram key — get it from the team vault/Slack (don't
commit it). `.env` is gitignored, so it isn't in your checkout; set it on the
server machine:
```bash
sed -i '' 's|^DEEPGRAM_API_KEY=.*|DEEPGRAM_API_KEY=PASTE_TEAM_KEY|' .env
# optional: override the Aura voice (default is aura-2-orion-en, masculine)
sed -i '' 's|^DEEPGRAM_TTS_MODEL=.*|DEEPGRAM_TTS_MODEL=aura-2-orion-en|' .env
```

## 2. Install ffmpeg (decodes iMessage .caf voice notes)
```bash
brew install ffmpeg
```

## 3. Verify the key works
```bash
curl -s -o /dev/null -w "%{http_code}\n" https://api.deepgram.com/v1/projects \
  -H "Authorization: Token $(grep '^DEEPGRAM_API_KEY=' .env | cut -d= -f2)"
# expect: 200
```

## 4. Restart the server (live iMessage)
```bash
CHANNEL=bluebubbles node_modules/.bin/tsx backend/src/index.ts
```
On boot the log should show `stt.deepgram` and `tts.deepgram`. Send the buddy a
voice note → it transcribes, replies, and speaks back.

**Notes**
- No key set → voice notes fall back to a text reply (nothing breaks).
- No ffmpeg → some `.caf` notes may transcribe empty (buddy says "say it again?").
- Voice only runs on `CHANNEL=bluebubbles`; the terminal channel has no audio.
