import { DeepgramClient } from "@deepgram/sdk";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { log } from "../log";

// Text-to-speech behind an interface (brief §6). Deepgram Aura gives the buddy a
// voice for spoken replies — same provider/key as STT. No key => stub returns
// null and the caller falls back to a text reply, so a missing key never breaks
// the loop.
export interface Tts {
  /** Synthesize speech; returns a local mp3 path, or null if unavailable. */
  synthesize(text: string): Promise<string | null>;
}

export const stubTts: Tts = {
  async synthesize() {
    return null;
  },
};

export function createDeepgramTts(apiKey: string, model: string): Tts {
  const dg = new DeepgramClient({ apiKey });
  return {
    async synthesize(text) {
      try {
        const resp: any = await dg.speak.v1.audio.generate({ text, model, encoding: "mp3" } as any);
        const buf = Buffer.from(await resp.arrayBuffer());
        const path = join(tmpdir(), `db-${randomUUID()}.mp3`);
        await writeFile(path, buf);
        return path;
      } catch (err) {
        log("tts.error", { err: String(err) });
        return null;
      }
    },
  };
}

export function createTts(apiKey: string | undefined, model: string): Tts {
  if (apiKey) {
    log("tts.deepgram", { model });
    return createDeepgramTts(apiKey, model);
  }
  return stubTts;
}
