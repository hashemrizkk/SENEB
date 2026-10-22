import assert from "node:assert/strict";
import {
  RecorderChunkManager,
  insertDictationAtCursor,
  inaudibleSegment,
  orderTranscriptChunks,
} from "../lib/recorder-chunks.ts";

class FakeScheduler {
  private callback: (() => void) | null = null;

  setTimeout(callback: () => void): number {
    this.callback = callback;
    return 1;
  }

  clearTimeout(): void {
    this.callback = null;
  }

  fire(): void {
    const callback = this.callback;
    this.callback = null;
    assert.ok(callback, "expected a pending rollover timer");
    callback();
  }
}

class FakeRecorder {
  private readonly sequence: number;
  private readonly lifecycle: string[];
  state = "inactive";
  mimeType = "audio/webm";
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(sequence: number, lifecycle: string[]) {
    this.sequence = sequence;
    this.lifecycle = lifecycle;
  }

  start(): void {
    this.state = "recording";
    this.lifecycle.push(`${this.sequence}:start`);
  }

  stop(): void {
    this.state = "inactive";
    this.lifecycle.push(`${this.sequence}:stop`);
    this.onstop?.();
  }

  add(blob: Blob): void {
    this.ondataavailable?.({ data: blob });
  }
}

function recorderHarness() {
  const scheduler = new FakeScheduler();
  const lifecycle: string[] = [];
  const recorders: FakeRecorder[] = [];
  const chunks: { sequence: number; audio: Blob }[] = [];
  const manager = new RecorderChunkManager(
    () => {
      const recorder = new FakeRecorder(recorders.length, lifecycle);
      recorders.push(recorder);
      return recorder;
    },
    (chunk) => chunks.push(chunk),
    scheduler,
    45,
  );
  return { chunks, lifecycle, manager, recorders, scheduler };
}

async function run(): Promise<void> {
  {
    const { chunks, manager, recorders } = recorderHarness();
    manager.start();
    recorders[0]?.add(new Blob(["short"]));
    manager.stop();
    assert.equal(recorders.length, 1);
    assert.equal(chunks.length, 1);
    assert.equal(chunks[0]?.sequence, 0);
    assert.equal(await chunks[0]?.audio.text(), "short");
  }

  {
    const { chunks, lifecycle, manager, recorders, scheduler } = recorderHarness();
    manager.start();
    recorders[0]?.add(new Blob(["first"]));
    scheduler.fire();
    assert.equal(recorders.length, 2);
    assert.equal(recorders[1]?.state, "recording");
    assert.equal(recorders[0]?.state, "inactive");
    assert.deepEqual(lifecycle, ["0:start", "1:start", "0:stop"]);
    recorders[1]?.add(new Blob(["second"]));
    manager.stop();
    assert.deepEqual(chunks.map((chunk) => chunk.sequence), [0, 1]);
    assert.deepEqual(
      await Promise.all(chunks.map((chunk) => chunk.audio.text())),
      ["first", "second"],
    );
  }

  assert.deepEqual(
    orderTranscriptChunks([
      { sequence: 2, transcript: "third" },
      { sequence: 0, transcript: "first" },
      { sequence: 1, transcript: "second" },
    ]),
    ["first", "second", "third"],
  );
  assert.deepEqual(
    insertDictationAtCursor("typed after", "spoken", 6, 6),
    { value: "typed spoken after", cursor: 13 },
  );
  const dictatedDraftFields = [
    ["Existing instructions.", "Add a reminder."],
    ["Check blood sugar.", "Check twice daily."],
    ["Increase metformin.", "Take with food."],
    ["Return if symptoms worsen.", "Call the clinic."],
    ["Monitor at home.", "Record each reading."],
    ["Follow-up recap.", "Visit next month."],
  ] as const;
  for (const [existingText, dictatedText] of dictatedDraftFields) {
    const inserted = insertDictationAtCursor(
      existingText,
      dictatedText,
      existingText.length,
      existingText.length,
    );
    assert.ok(inserted.value.startsWith(existingText));
    assert.ok(inserted.value.endsWith(dictatedText));
    assert.ok(inserted.value.includes(existingText));
    assert.ok(inserted.value.includes(dictatedText));
    assert.equal(inserted.cursor, inserted.value.length);
  }
  assert.equal(inaudibleSegment(3), "[inaudible segment 4]");

  console.log("PASS  chunk ordering and cursor insertion preserve existing text across editable draft fields");
}

await run();
