import type { Request, Response, RequestHandler } from "express";
import type { Channel, InboundHandler, InboundMessage } from "@drunk-buddy/shared";

// BlueBubbles adapter: inbound via webhook (mounted by the backend at
// POST /imessage/incoming), outbound via the BlueBubbles REST API.
// Always paired with a deep-link / LocalChannel fallback so a dead Mac can't
// kill the demo (brief §13).

export interface BlueBubblesConfig {
  /** Public URL of the BlueBubbles server itself (its ngrok/Cloudflare url). */
  serverUrl: string;
  password: string;
  /** "apple-script" works without the Private API; "private-api" enables effects. */
  method?: "apple-script" | "private-api";
}

export interface BlueBubblesChannel extends Channel {
  /** Express handler to mount at POST /imessage/incoming. */
  webhook(): RequestHandler;
  /** Download an attachment's bytes by guid (e.g. an inbound voice note). */
  downloadAttachment(guid: string): Promise<{ bytes: Buffer; mimeType?: string }>;
}

function tempGuid(): string {
  return `db-${Date.now()}-${Math.round(Math.random() * 1e9)}`;
}

// Native voice bubble only works for a CAF file over the Private API; otherwise
// the file is sent as a normal attachment.
export function isAudioMessage(filePath: string, method: string): boolean {
  return method === "private-api" && filePath.toLowerCase().endsWith(".caf");
}

export function createBlueBubblesChannel(config: BlueBubblesConfig): BlueBubblesChannel {
  let handler: InboundHandler | null = null;
  const method = config.method ?? "apple-script";
  const base = config.serverUrl.replace(/\/$/, "");
  const pw = encodeURIComponent(config.password);

  async function postJson(path: string, body: unknown): Promise<void> {
    const res = await fetch(`${base}${path}?password=${pw}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(`BlueBubbles ${path} -> ${res.status}: ${await res.text()}`);
    }
  }

  return {
    name: "bluebubbles",
    onMessage(h) {
      handler = h;
    },
    webhook(): RequestHandler {
      return async (req: Request, res: Response) => {
        res.sendStatus(200); // ack immediately; process async
        try {
          const body: any = req.body ?? {};
          if (body.type && body.type !== "new-message") return;
          const data: any = body.data ?? body;
          if (data.isFromMe) return; // ignore our own sends
          const phone: string = data?.handle?.address ?? data?.handle ?? "";
          const chatGuid: string = data?.chats?.[0]?.guid ?? data?.chatGuid ?? "";
          const text: string | undefined = typeof data.text === "string" ? data.text : undefined;
          const att = data?.attachments?.[0];
          const msg: InboundMessage = {
            phone,
            chatGuid,
            text,
            attachment: att
              ? { guid: att.guid, name: att.transferName, mimeType: att.mimeType }
              : undefined,
            raw: body,
          };
          if (phone && handler) await handler(msg);
        } catch (err) {
          console.error("[bluebubbles] webhook error", err);
        }
      };
    },
    async downloadAttachment(guid) {
      const res = await fetch(`${base}/api/v1/attachment/${encodeURIComponent(guid)}/download?password=${pw}`);
      if (!res.ok) {
        throw new Error(`BlueBubbles attachment download -> ${res.status}: ${await res.text()}`);
      }
      const bytes = Buffer.from(await res.arrayBuffer());
      return { bytes, mimeType: res.headers.get("content-type") ?? undefined };
    },
    async sendText(chatGuid, text) {
      await postJson("/api/v1/message/text", { chatGuid, tempGuid: tempGuid(), message: text, method });
    },
    async sendAudio(chatGuid, filePath) {
      const fs = await import("node:fs");
      const path = await import("node:path");
      const form = new FormData();
      const buf = fs.readFileSync(filePath);
      form.append("chatGuid", chatGuid);
      form.append("tempGuid", tempGuid());
      form.append("name", path.basename(filePath));
      form.append("method", method);
      form.append("attachment", new Blob([buf]), path.basename(filePath));
      // A CAF/Opus file over the Private API renders as a native iMessage voice
      // bubble; anything else is sent as a normal file attachment.
      if (isAudioMessage(filePath, method)) form.append("isAudioMessage", "1");
      const res = await fetch(`${base}/api/v1/message/attachment?password=${pw}`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        throw new Error(`BlueBubbles attachment -> ${res.status}: ${await res.text()}`);
      }
    },
    async start() {
      // no-op: the webhook handler is mounted by the backend server.
    },
  };
}
