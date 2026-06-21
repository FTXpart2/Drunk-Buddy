import { createHmac, timingSafeEqual } from "node:crypto";
import { config } from "../config";

// The health link is the only external surface (brief non-negotiable #1): the
// buddy texts a one-tap URL whose token encodes the user's phone. Stateless,
// signed (HMAC-SHA256) so /vitals can trust the phone without a DB lookup.

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function sign(payload: string): string {
  return b64url(createHmac("sha256", config.healthLinkSecret).update(payload).digest());
}

export function makeHealthToken(phone: string): string {
  const payload = b64url(Buffer.from(phone, "utf8"));
  return `${payload}.${sign(payload)}`;
}

export function verifyHealthToken(token: string): string | null {
  if (typeof token !== "string" || !token.includes(".")) return null;
  const [payload, mac] = token.split(".");
  if (!payload || !mac) return null;
  const expected = sign(payload);
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}
