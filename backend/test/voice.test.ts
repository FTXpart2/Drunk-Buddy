import { describe, it, expect, vi } from "vitest";
import type { InboundMessage } from "@drunk-buddy/shared";
import { isAudio, transcribeVoiceNote } from "../src/voice/bridge";
import { stubStt } from "../src/voice/stt";
import { stubTts } from "../src/voice/tts";
import { toCafOpus } from "../src/voice/transcode";
import { isAudioMessage } from "@drunk-buddy/channel";

const voiceMsg = (over: Partial<InboundMessage> = {}): InboundMessage => ({
  phone: "+1",
  chatGuid: "g",
  attachment: { guid: "att-1", mimeType: "audio/x-caf", name: "Audio Message.caf" },
  ...over,
});

describe("isAudio", () => {
  it("accepts audio + caf + unknown, rejects images", () => {
    expect(isAudio("audio/mp4")).toBe(true);
    expect(isAudio("audio/x-caf")).toBe(true);
    expect(isAudio(undefined)).toBe(true);
    expect(isAudio("image/jpeg")).toBe(false);
  });
});

describe("transcribeVoiceNote", () => {
  it("downloads then transcribes a voice note", async () => {
    const download = vi.fn(async () => ({ bytes: Buffer.from("riff"), mimeType: "audio/wav" }));
    const stt = { transcribe: vi.fn(async () => "get me home") };
    const text = await transcribeVoiceNote(voiceMsg(), { download, stt });
    expect(download).toHaveBeenCalledWith("att-1");
    expect(text).toBe("get me home");
  });

  it("returns '' for a non-audio attachment (no download)", async () => {
    const download = vi.fn(async () => ({ bytes: Buffer.from(""), mimeType: "image/png" }));
    const text = await transcribeVoiceNote(
      voiceMsg({ attachment: { guid: "x", mimeType: "image/png" } }),
      { download, stt: stubStt },
    );
    expect(text).toBe("");
    expect(download).not.toHaveBeenCalled();
  });

  it("returns '' when there's no attachment guid", async () => {
    const download = vi.fn();
    const text = await transcribeVoiceNote(voiceMsg({ attachment: undefined }), { download, stt: stubStt });
    expect(text).toBe("");
    expect(download).not.toHaveBeenCalled();
  });
});

describe("stubs (no API key)", () => {
  it("stub STT returns empty and stub TTS returns null", async () => {
    expect(await stubStt.transcribe(Buffer.from(""))).toBe("");
    expect(await stubTts.synthesize("hi")).toBeNull();
  });
});

describe("native voice bubble", () => {
  it("only flags isAudioMessage for a .caf over the private-api", () => {
    expect(isAudioMessage("/tmp/x.caf", "private-api")).toBe(true);
    expect(isAudioMessage("/tmp/x.caf", "apple-script")).toBe(false);
    expect(isAudioMessage("/tmp/x.mp3", "private-api")).toBe(false);
  });

  it("toCafOpus returns null when the input can't be converted", async () => {
    // /nonexistent.mp3 -> ffmpeg errors (or ffmpeg missing) -> graceful null
    expect(await toCafOpus("/nonexistent-db-test.mp3")).toBeNull();
  });
});
