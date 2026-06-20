import readline from "node:readline";
import type { Channel, InboundHandler } from "@drunk-buddy/shared";

// Dev/demo channel: text the buddy in your terminal. Implements the same
// Channel interface as BlueBubbles so the agent loop is identical either way.
const LOCAL_CHAT_GUID = "local;-;chat";
const LOCAL_PHONE = process.env.LOCAL_PHONE ?? "+15550000000";

export function createLocalChannel(): Channel {
  let handler: InboundHandler | null = null;

  return {
    name: "local",
    onMessage(h) {
      handler = h;
    },
    async sendText(_chatGuid, text) {
      process.stdout.write(`\nbuddy: ${text}\n\nyou: `);
    },
    async sendAudio(_chatGuid, filePath) {
      process.stdout.write(`\nbuddy [audio]: ${filePath}\n\nyou: `);
    },
    async start() {
      const rl = readline.createInterface({ input: process.stdin });
      process.stdout.write("drunk buddy (local channel). text it like a person. ctrl+c to quit.\n\nyou: ");
      rl.on("line", async (line) => {
        const text = line.trim();
        if (!text) {
          process.stdout.write("you: ");
          return;
        }
        if (handler) {
          await handler({ phone: LOCAL_PHONE, text, chatGuid: LOCAL_CHAT_GUID });
        }
      });
    },
  };
}
