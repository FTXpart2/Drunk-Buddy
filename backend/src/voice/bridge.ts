import type { InboundMessage } from "@drunk-buddy/shared";
import type { Stt } from "./stt";
import { maybeTranscode } from "./transcode";

// Is this attachment a voice note? BlueBubbles voice notes sometimes arrive with
// a vague or missing mime type, so we're permissive.
export function isAudio(mimeType?: string): boolean {
  if (!mimeType) return true;
  const m = mimeType.toLowerCase();
  return m.startsWith("audio/") || m.includes("caf") || m.includes("m4a") || m.includes("octet-stream");
}

export interface VoiceDeps {
  download: (guid: string) => Promise<{ bytes: Buffer; mimeType?: string }>;
  stt: Stt;
}

// Download + (maybe) transcode + transcribe an inbound voice note. Returns the
// transcript, or "" if it isn't a voice note or couldn't be understood (the
// caller then asks the user to repeat). Keeps index.ts thin and unit-testable.
export async function transcribeVoiceNote(msg: InboundMessage, deps: VoiceDeps): Promise<string> {
  const att = msg.attachment;
  if (!att?.guid || !isAudio(att.mimeType)) return "";
  const { bytes, mimeType } = await deps.download(att.guid);
  const audio = await maybeTranscode(bytes, mimeType ?? att.mimeType);
  return deps.stt.transcribe(audio, mimeType ?? att.mimeType);
}
