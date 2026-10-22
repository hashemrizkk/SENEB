import assert from "node:assert/strict";
import {
  appendTranscript,
  characterErrorRate,
  deriveInputMethod,
  inputMethodLabel,
  inputMethodNote,
} from "../lib/voice-utils.ts";
import { intakeRequestSchema } from "../lib/intake.ts";
import { registrationSchema } from "../lib/registration.ts";

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

report("input method distinguishes tap, typed, voice, and mixed", () => {
  const method = (text: string, pieces: string[], edited = false) => deriveInputMethod({
    texts: [text], transcriptPieces: [pieces], editedAfterAppend: [edited], maxChars: [500],
  });
  assert.equal(method("  ", []), "tap");
  assert.equal(method("typed words", []), "typed");
  assert.equal(method("spoken words", ["spoken words"]), "voice");
  assert.equal(method("spoken words + typed", ["spoken words"]), "mixed");
  assert.equal(method("spoken words", ["spoken words"], true), "mixed");
  assert.equal(inputMethodLabel("mixed"), "مكتوب + صوت");
  assert.ok(inputMethodNote("voice"));
});

report("intake and registration schemas accept voice and mixed only", () => {
  const intake = {
    patient_id: 1,
    tap_missed_doses: null,
    tap_hypo_episodes: null,
    tap_foot_problem: null,
    tap_vision_change: null,
    free_text: "spoken",
  };
  const registration = {
    full_name: "Test Patient",
    phone: "01012345678",
    answers: {},
    consent: true,
    request_id: "11111111-1111-4111-8111-111111111111",
  };
  for (const input_method of ["voice", "mixed"] as const) {
    assert.equal(intakeRequestSchema.safeParse({ ...intake, input_method }).success, true);
    assert.equal(registrationSchema.safeParse({ ...registration, input_method }).success, true);
  }
  assert.equal(intakeRequestSchema.safeParse({ ...intake, input_method: "unknown" }).success, false);
  assert.equal(registrationSchema.safeParse({ ...registration, input_method: "unknown" }).success, false);
});

console.log(`\n${total - failures}/${total} voice utility tests passed.`);
if (failures > 0) process.exitCode = 1;
