import assert from "node:assert/strict";
import {
  appendTranscript,
  characterErrorRate,
} from "../lib/voice-utils.ts";

let failures = 0;
let total = 0;

function report(name: string, run: () => void): void {
  total += 1;
  try {
    run();
    console.log(`PASS  ${name}`);
  } catch (error: unknown) {
    failures += 1;
    console.error(`FAIL  ${name}`, error);
  }
}

report("transcript appends without overwriting existing text", () => {
  assert.equal(appendTranscript("كلام مكتوب", "كلام جديد", 100), "كلام مكتوب كلام جديد");
});

report("append preserves existing whitespace and caps target length", () => {
  assert.equal(appendTranscript("written ", "spoken", 100), "written spoken");
  assert.equal(appendTranscript("12345", "67890", 8), "12345 67");
});

report("empty transcript is a no-op", () => {
  assert.equal(appendTranscript("existing text", "   ", 100), "existing text");
});

report("CER is zero for equivalent text despite Arabic marks and punctuation", () => {
  assert.equal(characterErrorRate("السَّلَامُ!", "السلام"), 0);
});

report("CER counts a character substitution", () => {
  assert.equal(characterErrorRate("سلام", "كلام"), 0.25);
});

report("CER handles insertions, deletions, and empty references", () => {
  assert.equal(characterErrorRate("abc", "ab"), 1 / 3);
  assert.equal(characterErrorRate("", "abc"), 1);
  assert.equal(characterErrorRate("", ""), 0);
});

console.log(`\n${total - failures}/${total} voice utility tests passed.`);
if (failures > 0) process.exitCode = 1;
