export const RECORDER_CHUNK_INTERVAL_MS = 45_000;

export interface ChunkRecorder {
  readonly state: string;
  readonly mimeType: string;
  ondataavailable: ((event: { data: Blob }) => void) | null;
  onstop: (() => void) | null;
  onerror: (() => void) | null;
  start(): void;
  stop(): void;
}

export interface ChunkTimerScheduler {
  setTimeout(
    callback: () => void,
    delayMs: number,
  ): ReturnType<typeof setTimeout> | number;
  clearTimeout(timer: ReturnType<typeof setTimeout> | number): void;
}

export type RecordedChunk = {
  sequence: number;
  audio: Blob;
};

const systemScheduler: ChunkTimerScheduler = {
  setTimeout: (callback, delayMs) => globalThis.setTimeout(callback, delayMs),
  clearTimeout: (timer) => globalThis.clearTimeout(timer),
};

export class RecorderChunkManager {
  private readonly createRecorder: () => ChunkRecorder;
  private readonly onChunk: (chunk: RecordedChunk) => void;
  private readonly scheduler: ChunkTimerScheduler;
  private readonly intervalMs: number;
  private readonly onError: () => void;
  private readonly onComplete: (totalChunks: number) => void;
  private readonly onRollover: (sequence: number) => void;
  private readonly active = new Set<ChunkRecorder>();
  private current: ChunkRecorder | null = null;
  private timer: ReturnType<typeof setTimeout> | number | null = null;
  private sequence = 0;
  private started = false;
  private stopped = false;
  private completed = false;

  constructor(
    createRecorder: () => ChunkRecorder,
    onChunk: (chunk: RecordedChunk) => void,
    scheduler: ChunkTimerScheduler = systemScheduler,
    intervalMs = RECORDER_CHUNK_INTERVAL_MS,
    onError: () => void = () => {},
    onComplete: (totalChunks: number) => void = () => {},
    onRollover: (sequence: number) => void = () => {},
  ) {
    this.createRecorder = createRecorder;
    this.onChunk = onChunk;
    this.scheduler = scheduler;
    this.intervalMs = intervalMs;
    this.onError = onError;
    this.onComplete = onComplete;
    this.onRollover = onRollover;
  }

  start(): void {
    if (this.started) throw new Error("Recorder chunk manager has already started.");
    this.started = true;
    this.current = this.startRecorder(this.sequence);
    this.scheduleRollover();
  }

  stop(): void {
    if (!this.started || this.stopped) return;
    this.stopped = true;
    if (this.timer !== null) this.scheduler.clearTimeout(this.timer);
    this.timer = null;
    if (this.current?.state === "recording") this.current.stop();
    this.current = null;
    this.notifyCompleteIfReady();
  }

  private startRecorder(sequence: number): ChunkRecorder {
    const recorder = this.createRecorder();
    const pieces: Blob[] = [];
    this.active.add(recorder);
    recorder.ondataavailable = ({ data }) => {
      if (data.size > 0) pieces.push(data);
    };
    recorder.onstop = () => {
      recorder.ondataavailable = null;
      recorder.onstop = null;
      recorder.onerror = null;
      this.active.delete(recorder);
      const audio = new Blob(pieces, { type: recorder.mimeType || "audio/webm" });
      if (audio.size > 0) this.onChunk({ sequence, audio });
      this.notifyCompleteIfReady();
    };
    recorder.onerror = () => {
      this.onError();
      this.stop();
    };
    try {
      recorder.start();
    } catch (error: unknown) {
      this.active.delete(recorder);
      recorder.ondataavailable = null;
      recorder.onstop = null;
      recorder.onerror = null;
      throw error;
    }
    return recorder;
  }

  private scheduleRollover(): void {
    if (this.stopped) return;
    this.timer = this.scheduler.setTimeout(() => {
      this.timer = null;
      this.rollover();
    }, this.intervalMs);
  }

  private rollover(): void {
    const previous = this.current;
    if (this.stopped || !previous) return;
    this.sequence += 1;
    try {
      const next = this.startRecorder(this.sequence);
      this.current = next;
      this.onRollover(this.sequence);
      if (previous.state === "recording") previous.stop();
      this.scheduleRollover();
    } catch {
      this.onError();
      this.stop();
    }
  }

  private notifyCompleteIfReady(): void {
    if (!this.stopped || this.active.size !== 0 || this.completed) return;
    this.completed = true;
    this.onComplete(this.sequence + 1);
  }
}

export function orderTranscriptChunks(
  chunks: readonly { sequence: number; transcript: string }[],
): string[] {
  return [...chunks]
    .sort((left, right) => left.sequence - right.sequence)
    .map((chunk) => chunk.transcript);
}

export function insertDictationAtCursor(
  value: string,
  transcript: string,
  selectionStart: number,
  selectionEnd: number,
): { value: string; cursor: number } {
  const spokenText = transcript.trim();
  if (!spokenText) return { value, cursor: selectionStart };
  const start = Math.max(0, Math.min(selectionStart, value.length));
  const end = Math.max(start, Math.min(selectionEnd, value.length));
  const before = value.slice(0, start);
  const after = value.slice(end);
  const separatorBefore = before && !/\s$/.test(before) ? " " : "";
  const separatorAfter = after && !/^\s/.test(after) ? " " : "";
  const inserted = `${separatorBefore}${spokenText}${separatorAfter}`;
  return {
    value: `${before}${inserted}${after}`,
    cursor: before.length + inserted.length,
  };
}

export function inaudibleSegment(sequence: number): string {
  return `[inaudible segment ${sequence + 1}]`;
}

export function replaceInaudibleSegment(
  value: string,
  sequence: number,
  transcript: string,
): { value: string; cursor: number } | null {
  const placeholder = inaudibleSegment(sequence);
  const start = value.indexOf(placeholder);
  const spokenText = transcript.trim();
  if (start < 0 || !spokenText) return null;
  const nextValue = `${value.slice(0, start)}${spokenText}${value.slice(start + placeholder.length)}`;
  return { value: nextValue, cursor: start + spokenText.length };
}
