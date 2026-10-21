import assert from "node:assert/strict";
import {
  encodeMonoPcmWav,
  resampleToMono,
} from "../lib/audio-wav.ts";

let failures = 0;
let total = 0;
const pending: Promise<void>[] = [];

function test(name: string, run: () => void | Promise<void>): void {
  total += 1;
  pending.push(
    Promise.resolve()
      .then(run)
      .then(
        () => console.log(`PASS  ${name}`),
        (error: unknown) => {
          failures += 1;
          console.error(`FAIL  ${name}`, error);
        },
      ),
  );
}

test("combines stereo samples into mono", () => {
  const left = new Float32Array([0, 0.5, 1, 0.5]);
  const right = new Float32Array([0, -0.5, -1, -0.5]);
  const mono = resampleToMono([left, right], 16_000);
  assert.equal(mono.length, 4);
  assert.deepEqual(Array.from(mono), [0, 0, 0, 0]);
});

test("resamples audio to the expected target length", () => {
  const samples = new Float32Array(48_000);
  assert.equal(resampleToMono([samples], 48_000, 16_000).length, 16_000);
});

test("encodes valid mono 16-bit PCM WAV data", async () => {
  const wav = encodeMonoPcmWav(new Float32Array([-1, 0, 1]), 16_000);
  assert.equal(wav.type, "audio/wav");
  assert.equal(wav.size, 50);
  const buffer = await wav.arrayBuffer();
  const view = new DataView(buffer);
  const readText = (start: number, length: number) =>
    String.fromCharCode(...new Uint8Array(buffer.slice(start, start + length)));
  assert.equal(readText(0, 4), "RIFF");
  assert.equal(readText(8, 4), "WAVE");
  assert.equal(view.getUint32(24, true), 16_000);
  assert.equal(view.getUint16(22, true), 1);
  assert.equal(view.getInt16(44, true), -32768);
  assert.equal(view.getInt16(46, true), 0);
  assert.equal(view.getInt16(48, true), 32767);
});

async function main(): Promise<void> {
  await Promise.all(pending);
  console.log(`\n${total - failures}/${total} WAV conversion tests passed.`);
  if (failures > 0) process.exitCode = 1;
}

await main();
