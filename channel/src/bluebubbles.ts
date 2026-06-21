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
}

function tempGuid(): string {
  return `db-${Date.now()}-${Math.round(Math.random() * 1e9)}`;
}

// Pull lat/lon out of a shared "Send My Current Location" vCard (.vcf text). The
// card carries an Apple Maps URL (item1.URL;type=pref:https://maps.apple.com/?ll=LAT,LON);
// older iOS uses ?q= or a bare geo:LAT,LON line.
function parseVcardLatLon(vcf: string): { lat: number; lon: number } | null {
  const ll = vcf.match(/maps\.apple\.com\/?[^\s]*?[?&]ll=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/i);
  if (ll) return { lat: Number(ll[1]), lon: Number(ll[2]) };
  const q = vcf.match(/maps\.apple\.com\/?[^\s]*?[?&]q=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/i);
  if (q) return { lat: Number(q[1]), lon: Number(q[2]) };
  const geo = vcf.match(/geo:(-?\d+(?:\.\d+)?)[,;](-?\d+(?:\.\d+)?)/i);
  if (geo) return { lat: Number(geo[1]), lon: Number(geo[2]) };
  return null;
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

  // A shared iMessage location pin arrives as a vCard attachment (filename CL.loc,
  // uti public.vcard). Download + decode it to coords. Returns undefined for any
  // non-location message; "Share My Location" (continuous Find My) has no coords.
  async function tryParseLocation(data: any): Promise<{ lat: number; lon: number } | undefined> {
    const atts: any[] = data?.attachments ?? [];
    const hit = atts.find(
      (a) =>
        a?.uti === "public.vcard" ||
        /cl\.loc/i.test(a?.transferName ?? "") ||
        /vcard|vlocation/i.test(a?.mimeType ?? ""),
    );
    if (!hit?.guid) return undefined;
    try {
      const res = await fetch(
        `${base}/api/v1/attachment/${encodeURIComponent(hit.guid)}/download?password=${pw}&original=true`,
      );
      if (!res.ok) return undefined;
      const coords = parseVcardLatLon(await res.text());
      return coords ?? undefined;
    } catch {
      return undefined;
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
            attachment: att ? { name: att.transferName, mimeType: att.mimeType } : undefined,
            location: await tryParseLocation(data),
            raw: body,
          };
          if (phone && handler) await handler(msg);
        } catch (err) {
          console.error("[bluebubbles] webhook error", err);
        }
      };
    },
    async sendText(chatGuid, text) {
      // AppleScript sending on newer macOS is flaky — the same send sometimes throws
      // a transient "Can't make any into type constant" error and sometimes succeeds.
      // Reuse one tempGuid (so BlueBubbles dedupes) and retry until it lands.
      const tg = tempGuid();
      const attempts = 5;
      let lastErr: unknown;
      for (let i = 1; i <= attempts; i++) {
        try {
          await postJson("/api/v1/message/text", { chatGuid, tempGuid: tg, message: text, method });
          if (i > 1) console.error(`[bluebubbles] send succeeded on attempt ${i}`);
          return;
        } catch (err) {
          // A prior attempt may have timed out on our side but still QUEUED the
          // message; BlueBubbles then 400s "already queued/sent" — that's a
          // success, not a failure. Don't retry (would double-send) or throw.
          const msg = String(err).toLowerCase();
          if (msg.includes("already queued") || msg.includes("already sent")) return;
          lastErr = err;
          console.error(`[bluebubbles] send attempt ${i}/${attempts} failed, retrying…`);
          await new Promise((r) => setTimeout(r, 1500));
        }
      }
      throw lastErr;
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
