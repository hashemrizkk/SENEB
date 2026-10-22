import assert from "node:assert/strict";
import {
  isSupportedAudioType,
  readGeminiTranscript,
  withValidatedGeminiWav,
  VoiceAudioValidationError,
} from "../lib/gemini-audio.ts";

let failed = 0;
let total = 0;

async function test(name: string, run: () => void | Promise<void>): Promise<void> {
  total += 1;
  try {
    await run();
    console.log(`PASS  ${name}`);
  } catch (error: unknown) {
    failed += 1;
    console.error(`FAIL  ${name}`, error);
  }
}

function makeWav(dataBytes = 32_000, overrides: Record<number, number> = {}): Blob {
  const bytes = new Uint8Array(44 + dataBytes);
  const view = new DataView(bytes.buffer);
  const writeText = (offset: number, text: string) => {
    for (let index = 0; index < text.length; index += 1) bytes[offset + index] = text.charCodeAt(index);
  };
  writeText(0, "RIFF");
  view.setUint32(4, bytes.length - 8, true);
  writeText(8, "WAVE");
  writeText(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 16_000, true);
  view.setUint32(28, 32_000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeText(36, "data");
  view.setUint32(40, dataBytes, true);
  for (const [offset, value] of Object.entries(overrides)) bytes[Number(offset)] = value;
  return new Blob([bytes], { type: "audio/wav" });
}

async function assertRejectedWithoutProvider(audio: Blob, type = "audio/wav", max = 1024 * 1024) {
  let providerCalled = false;
  await assert.rejects(
    withValidatedGeminiWav(audio, type, max, async () => {
      providerCalled = true;
      return "unexpected";
    }),
    VoiceAudioValidationError,
  );
  assert.equal(providerCalled, false);
}

await test("accepts the normalized WAV MIME type", () => {
  assert.equal(isSupportedAudioType("audio/wav"), true);
});

await test("rejects unsupported and non-audio MIME types", () => {
  assert.equal(isSupportedAudioType("video/webm"), false);
  assert.equal(isSupportedAudioType("application/octet-stream"), false);
  assert.equal(isSupportedAudioType("audio/webm;codecs=opus"), false);
});

await test("rejects oversized WAV before provider invocation", async () => {
  await assertRejectedWithoutProvider(makeWav(0), "audio/wav", 20);
});

await test("rejects a valid WAV longer than 30 seconds without provider invocation", async () => {
  await assertRejectedWithoutProvider(makeWav(32_000 * 31));
});

await test("rejects wrong WAV format and inconsistent headers without provider invocation", async () => {
  await assertRejectedWithoutProvider(makeWav(32_000, { 20: 3 }));
  await assertRejectedWithoutProvider(makeWav(32_000, { 4: 0 }));
  await assertRejectedWithoutProvider(makeWav(32_000, { 41: 0 }));
  await assertRejectedWithoutProvider(makeWav(32_000), "audio/webm");
});

await test("accepts a consistent PCM16 mono 16 kHz WAV and invokes provider once", async () => {
  let providerCalls = 0;
  const result = await withValidatedGeminiWav(makeWav(), "audio/wav", 1024 * 1024, async (duration) => {
    providerCalls += 1;
    assert.equal(duration, 1_000);
    return "transcript";
  });
  assert.equal(result, "transcript");
  assert.equal(providerCalls, 1);
});

await test("reads and trims a Gemini transcript response", () => {
  assert.equal(
    readGeminiTranscript({
      candidates: [{ content: { parts: [{ text: "  صباح الخير  " }] } }],
    }),
    "صباح الخير",
  );
});

await test("rejects empty, malformed, and too-long Gemini responses", () => {
  assert.equal(readGeminiTranscript(null), null);
  assert.equal(readGeminiTranscript({ candidates: [] }), null);
  assert.equal(
    readGeminiTranscript({ candidates: [{ content: { parts: [{ text: " " }] } }] }),
    null,
  );
  assert.equal(
    readGeminiTranscript({
      candidates: [{ content: { parts: [{ text: "x".repeat(2001) }] } }],
    }),
    null,
  );
});

console.log(`\n${total - failed}/${total} Gemini audio tests passed.`);
if (failed > 0) process.exitCode = 1;
