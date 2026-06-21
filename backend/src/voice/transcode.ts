import { spawn } from "node:child_process";
import { log } from "../log";

// iMessage voice notes are usually .caf, which Deepgram may not decode. If ffmpeg
// is on PATH and the format looks like caf/unknown, transcode bytes -> wav before
// STT. Best-effort: any failure (or no ffmpeg) returns the original bytes so the
// pipeline degrades gracefully instead of crashing.
function looksLikeCaf(mimeType?: string): boolean {
  if (!mimeType) return true; // unknown — try converting
  const m = mimeType.toLowerCase();
  return m.includes("caf") || m.includes("x-caf") || m.includes("octet-stream");
}

export async function maybeTranscode(bytes: Buffer, mimeType?: string): Promise<Buffer> {
  if (!looksLikeCaf(mimeType)) return bytes;
  try {
    return await new Promise<Buffer>((resolve, reject) => {
      const ff = spawn("ffmpeg", ["-hide_banner", "-loglevel", "error", "-i", "pipe:0", "-f", "wav", "pipe:1"]);
      const out: Buffer[] = [];
      ff.stdout.on("data", (d) => out.push(d));
      ff.on("error", reject); // ffmpeg not installed
      ff.on("close", (code) => (code === 0 ? resolve(Buffer.concat(out)) : reject(new Error(`ffmpeg exit ${code}`))));
      ff.stdin.on("error", () => {}); // ignore EPIPE if ffmpeg bails early
      ff.stdin.end(bytes);
    });
  } catch (err) {
    log("transcode.skip", { reason: String(err) });
    return bytes; // no ffmpeg / failed — let Deepgram try the raw bytes
  }
}
