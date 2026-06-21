import twilio from "twilio";
import type { Request, Response, RequestHandler } from "express";
import type { Channel, InboundHandler, InboundMessage } from "@drunk-buddy/shared";

// Twilio SMS adapter: inbound via Twilio's webhook (mounted at POST /sms/incoming),
// outbound via the Twilio REST API. Same Channel interface as BlueBubbles/Local, so the
// agent loop is identical. Works from any phone (iPhone + Android), no Mac required.

export interface TwilioConfig {
  accountSid: string;
  authToken: string;
  /** Your Twilio number in E.164, e.g. +14155550123 */
  fromNumber: string;
}

export interface TwilioChannel extends Channel {
  /** Express handler to mount at POST /sms/incoming (Twilio posts form-encoded). */
  webhook(): RequestHandler;
}

export function createTwilioChannel(config: TwilioConfig): TwilioChannel {
  let handler: InboundHandler | null = null;
  const client = twilio(config.accountSid, config.authToken);

  return {
    name: "twilio",
    onMessage(h) {
      handler = h;
    },
    webhook(): RequestHandler {
      return async (req: Request, res: Response) => {
        // Ack Twilio immediately with empty TwiML so it doesn't retry; we reply via the API.
        res.set("Content-Type", "text/xml").send("<Response></Response>");
        try {
          const body: any = req.body ?? {};
          const from: string = body.From ?? ""; // sender's number — the join key
          const text: string = typeof body.Body === "string" ? body.Body : "";
          const numMedia = Number(body.NumMedia ?? 0);
          const msg: InboundMessage = {
            phone: from,
            chatGuid: from, // reply target = the sender's number
            text,
            attachment: numMedia > 0 ? { url: body.MediaUrl0, mimeType: body.MediaContentType0 } : undefined,
            raw: body,
          };
          if (from && handler) await handler(msg);
        } catch (err) {
          console.error("[twilio] webhook error", err);
        }
      };
    },
    async sendText(chatGuid, text) {
      // chatGuid is the recipient's E.164 number (the main reply, or an emergency contact).
      await client.messages.create({ from: config.fromNumber, to: chatGuid, body: text });
    },
    async sendAudio(chatGuid, _filePath) {
      // MMS needs a publicly-reachable media URL — wired in Phase 2 (voice). For now,
      // text stays the reliable default.
      await client.messages.create({
        from: config.fromNumber,
        to: chatGuid,
        body: "[voice note — audio coming in phase 2]",
      });
    },
    async start() {
      // no-op: the webhook handler is mounted by the backend server.
    },
  };
}
