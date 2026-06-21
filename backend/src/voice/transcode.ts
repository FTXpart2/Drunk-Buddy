import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

// Convert an mp3 to CAF/Opus so BlueBubbles can send it as a NATIVE iMessage
// voice bubble (it needs CAF container + Opus codec; a renamed mp3 yields a
// broken 0-second bubble). Returns the .caf path, or null on any failure (no
// ffmpeg / build without libopus) so the caller falls back to the mp3 file.
export async function toCafOpus(mp3Path: string): Promise<string | null> {
  const out = join(tmpdir(), `db-${randomUUID()}.caf`);
  try {
    return await new Promise<string>((resolve, reject) => {
      const ff = spawn("ffmpeg", [
        "-hide_banner", "-loglevel", "error", "-y",
        "-i", mp3Path,
        "-c:a", "libopus", "-f", "caf",
        out,
      ]);
      ff.on("error", reject); // ffmpeg not installed
      ff.on("close", (code) => (code === 0 ? resolve(out) : reject(new Error(`ffmpeg exit ${code}`))));
    });
  } catch (err) {
    log("caf.skip", { reason: String(err) });
    return null;
  }
}
