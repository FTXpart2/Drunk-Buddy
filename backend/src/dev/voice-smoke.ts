import WebSocket from "ws";

// `pnpm smoke:voice` — verifies the voice agent WebSocket pipeline.
// Connects to the running server, waits for the Deepgram greeting audio,
// and reports success/failure. Requires the server running (`pnpm dev`)
// with DEEPGRAM_API_KEY and ANTHROPIC_API_KEY set in .env.

const PORT = process.env.PORT ?? 8787;
const PHONE = "+14155550199";
const URL = `ws://localhost:${PORT}/voice/stream?phone=${PHONE}`;
const TIMEOUT_MS = 15000;

console.log(`\n=== Voice agent smoke test ===`);
console.log(`connecting to ${URL} ...`);

const ws = new WebSocket(URL);
let audioChunks = 0;
let settled = false;

const timer = setTimeout(() => {
  if (settled) return;
  settled = true;
  console.log("\n✗ timed out — no audio received after 15s");
  console.log("  check that DEEPGRAM_API_KEY and ANTHROPIC_API_KEY are set");
  ws.close();
  process.exit(1);
}, TIMEOUT_MS);

ws.on("open", () => {
  console.log("✓ websocket connected");
});

ws.on("message", (data: Buffer) => {
  audioChunks++;
  if (audioChunks === 1) {
    console.log("✓ receiving greeting audio from voice agent...");
  }
});

ws.on("close", () => {
  if (settled) return;
  settled = true;
  clearTimeout(timer);
  if (audioChunks > 0) {
    console.log(`✓ received ${audioChunks} audio chunks — voice pipeline works!`);
    console.log("  your teammate can connect to this WebSocket and send/receive audio.\n");
    process.exit(0);
  } else {
    console.log("✗ connection closed without receiving audio\n");
    process.exit(1);
  }
});

ws.on("error", (err) => {
  if (settled) return;
  settled = true;
  clearTimeout(timer);
  console.log(`✗ connection error: ${err.message}`);
  console.log("  is the server running? (pnpm dev)\n");
  process.exit(1);
});

// After receiving audio for a few seconds, close and report success
setTimeout(() => {
  if (settled) return;
  if (audioChunks > 0) {
    settled = true;
    clearTimeout(timer);
    console.log(`✓ received ${audioChunks} audio chunks — voice pipeline works!`);
    console.log("  your teammate can connect to this WebSocket and send/receive audio.\n");
    ws.close();
    process.exit(0);
  }
}, 8000);
