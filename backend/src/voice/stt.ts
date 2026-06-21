import { DeepgramClient } from "@deepgram/sdk";
import { log } from "../log";

// Speech-to-text behind an interface (brief §6: "mock the edges"). Deepgram turns
// a drunk voice note into text; no key => stub returns "" and the caller falls
// back to a "say it again?" text reply, so the loop never breaks.
export interface Stt {
  transcribe(bytes: Buffer, mimeType?: string): Promise<string>;
}

export const stubStt: Stt = {
  async transcribe() {
    return "";
  },
};

export function createDeepgramStt(apiKey: string): Stt {
  const dg = new DeepgramClient({ apiKey });
  return {
    async transcribe(bytes, mimeType) {
      try {
        const resp: any = await dg.listen.v1.media.transcribeFile(bytes, {
          model: "nova-3",
          smart_format: true,
          punctuate: true,
          ...(mimeType ? { mimetype: mimeType } : {}),
        } as any);
        const transcript: string =
          resp?.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? "";
        return transcript.trim();
      } catch (err) {
        log("stt.error", { err: String(err) });
        return "";
      }
    },
  };
}

export function createStt(apiKey?: string): Stt {
  if (apiKey) {
    log("stt.deepgram", { model: "nova-3" });
    return createDeepgramStt(apiKey);
  }
  return stubStt;
}
