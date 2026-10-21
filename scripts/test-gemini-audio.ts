import assert from "node:assert/strict";
import {
  isSupportedAudioType,
  readGeminiTranscript,
} from "../lib/gemini-audio.ts";

let failed = 0;
let total = 0;

function test(name: string, run: () => void): void {
  total += 1;
  try {
    run();
    console.log(`PASS  ${name}`);
  } catch (error: unknown) {
    failed += 1;
    console.error(`FAIL  ${name}`, error);
  }
}

test("accepts the normalized WAV MIME type", () => {
  assert.equal(isSupportedAudioType("audio/wav"), true);
});

test("rejects unsupported and non-audio MIME types", () => {
  assert.equal(isSupportedAudioType("video/webm"), false);
  assert.equal(isSupportedAudioType("application/octet-stream"), false);
  assert.equal(isSupportedAudioType("audio/webm;codecs=opus"), false);
});

test("reads and trims a Gemini transcript response", () => {
  assert.equal(
    readGeminiTranscript({
      candidates: [{ content: { parts: [{ text: "  صباح الخير  " }] } }],
    }),
    "صباح الخير",
  );
});

test("rejects empty, malformed, and too-long Gemini responses", () => {
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
