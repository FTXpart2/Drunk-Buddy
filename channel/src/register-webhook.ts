import dotenv from "dotenv";

// Setup script: register the backend's /imessage/incoming endpoint with a
// running BlueBubbles server. Run once after the Mac gateway + ngrok are up:
//   pnpm channel:register
dotenv.config();

const serverUrl = process.env.BLUEBUBBLES_SERVER_URL;
const password = process.env.BLUEBUBBLES_PASSWORD;
const publicUrl = process.env.PUBLIC_URL;

if (!serverUrl || !password || !publicUrl) {
  console.error(
    "Missing env. Set BLUEBUBBLES_SERVER_URL, BLUEBUBBLES_PASSWORD, and PUBLIC_URL (this backend's https url).",
  );
  process.exit(1);
}

const target = `${publicUrl.replace(/\/$/, "")}/imessage/incoming`;
const url = `${serverUrl.replace(/\/$/, "")}/api/v1/webhook?password=${encodeURIComponent(password)}`;

const res = await fetch(url, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ url: target, events: ["new-message"] }),
});

console.log(`register-webhook -> ${res.status}`);
console.log(await res.text());
console.log(`pointed BlueBubbles new-message events at: ${target}`);
