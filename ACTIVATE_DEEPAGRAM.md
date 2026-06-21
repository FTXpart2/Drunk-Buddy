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

## Optional: native iMessage voice bubble (instead of an mp3 file)
By default the buddy replies with an mp3 **file** attachment. To get the round,
inline iMessage **voice bubble** instead, the server needs the Private API + ffmpeg
with Opus. Without these it automatically falls back to the mp3 file — nothing breaks.

1. **Enable the BlueBubbles Private API** on the Mac (BlueBubbles app → Settings →
   Private API; requires the helper bundle + SIP tweak). See
   https://docs.bluebubbles.app/private-api
2. **Use the private-api method** in `.env`:
   ```bash
   sed -i '' 's|^BLUEBUBBLES_METHOD=.*|BLUEBUBBLES_METHOD=private-api|' .env
   ```
3. **Confirm ffmpeg can do Opus** (the `brew install ffmpeg` build includes it):
   ```bash
   ffmpeg -encoders | grep -i opus    # expect a libopus line
   ```
4. **Verify ffmpeg can mux Opus into CAF** (the one thing not testable off your Mac).
   Some ffmpeg builds can't put Opus in a CAF container — confirm before relying on it:
   ```bash
   ffmpeg -hide_banner -f lavfi -i "sine=frequency=440:duration=1" -c:a libopus -f caf /tmp/db-test.caf \
     && ffprobe -hide_banner /tmp/db-test.caf 2>&1 | grep -i opus
   ```
   Expect a non-empty file + an "opus" line. If it errors, your ffmpeg can't do CAF/Opus —
   replies will fall back to mp3 (still works); ping me to switch the codec.
5. Restart the server. Voice replies now arrive as native voice bubbles; if anything
   above is missing, they fall back to the mp3 file automatically.
