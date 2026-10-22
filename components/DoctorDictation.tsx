"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { recordingToWav } from "@/lib/audio-wav";
import {
  inaudibleSegment,
  insertDictationAtCursor,
  RecorderChunkManager,
  type ChunkRecorder,
  type RecordedChunk,
} from "@/lib/recorder-chunks";
import type { VoiceLanguage } from "@/lib/gemini-audio";

type DoctorDictationProps = {
  value: string;
  onChange: (value: string) => void;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
};

const MAX_WAV_BYTES = 4 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 255_000;
const LANGUAGES: { code: VoiceLanguage; label: string }[] = [
  { code: "auto", label: "Auto" },
  { code: "ar-EG", label: "العربية" },
  { code: "en-US", label: "English" },
];

class TranscriptionRequestError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

function supported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    Boolean(navigator.mediaDevices?.getUserMedia) &&
    typeof MediaRecorder !== "undefined"
  );
}

function bestAudioMimeType(): string | undefined {
  return [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/ogg",
    "audio/mp4",
  ].find((type) => MediaRecorder.isTypeSupported(type));
}

function createChunkRecorder(stream: MediaStream, mimeType?: string): ChunkRecorder {
  const recorder = new MediaRecorder(
    stream,
    mimeType ? { mimeType } : undefined,
  );
  let dataHandler: ChunkRecorder["ondataavailable"] = null;
  let stopHandler: ChunkRecorder["onstop"] = null;
  let errorHandler: ChunkRecorder["onerror"] = null;
  recorder.ondataavailable = (event) => dataHandler?.({ data: event.data });
  recorder.onstop = () => stopHandler?.();
  recorder.onerror = () => errorHandler?.();
  return {
    get state() {
      return recorder.state;
    },
    get mimeType() {
      return recorder.mimeType;
    },
    get ondataavailable() {
      return dataHandler;
    },
    set ondataavailable(handler) {
      dataHandler = handler;
    },
    get onstop() {
      return stopHandler;
    },
    set onstop(handler) {
      stopHandler = handler;
    },
    get onerror() {
      return errorHandler;
    },
    set onerror(handler) {
      errorHandler = handler;
    },
    start: () => recorder.start(),
    stop: () => recorder.stop(),
  };
}

function releaseStream(stream: MediaStream | null): void {
  stream?.getTracks().forEach((track) => track.stop());
}

function elapsedLabel(milliseconds: number): string {
  const seconds = Math.floor(milliseconds / 1_000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function isTranscriptResponse(value: unknown): value is {
  ok: true;
  transcript: string;
  mock?: boolean;
} {
  return (
    value !== null &&
    typeof value === "object" &&
    "ok" in value &&
    value.ok === true &&
    "transcript" in value &&
    typeof value.transcript === "string"
  );
}

export default function DoctorDictation({
  value,
  onChange,
  textareaRef,
}: DoctorDictationProps) {
  const latestValueRef = useRef(value);
  const streamRef = useRef<MediaStream | null>(null);
  const managerRef = useRef<RecorderChunkManager | null>(null);
  const mountedRef = useRef(false);
  const chunkedRef = useRef(false);
  const failedRef = useRef(false);
  const startTimeRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioChunksRef = useRef(new Map<number, RecordedChunk>());
  const expectedSequenceRef = useRef(0);
  const totalChunksRef = useRef<number | null>(null);
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const activeRequestsRef = useRef(new Set<AbortController>());
  const pendingCountRef = useRef(0);
  const [language, setLanguage] = useState<VoiceLanguage>("auto");
  const [isRecording, setIsRecording] = useState(false);
  const [isRequesting, setIsRequesting] = useState(false);
  const [pendingChunks, setPendingChunks] = useState(0);
  const [recordedChunks, setRecordedChunks] = useState(0);
  const [activeChunk, setActiveChunk] = useState(1);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const shortcutRef = useRef({
    isRecording: false,
    isRequesting: false,
    pendingChunks: 0,
    start: async () => {},
    stop: () => {},
  });

  useEffect(() => {
    latestValueRef.current = value;
  }, [value]);

  function insertText(text: string): void {
    const textarea = textareaRef.current;
    const start = textarea?.selectionStart ?? latestValueRef.current.length;
    const end = textarea?.selectionEnd ?? start;
    const result = insertDictationAtCursor(
      latestValueRef.current,
      text,
      start,
      end,
    );
    latestValueRef.current = result.value;
    onChange(result.value);
    if (textarea) {
      requestAnimationFrame(() => {
        if (textareaRef.current === textarea) {
          textarea.setSelectionRange(result.cursor, result.cursor);
        }
      });
    }
  }

  function enqueuePlaceholder(sequence: number, message: string): void {
    queueRef.current = queueRef.current.then(() => {
      if (!mountedRef.current) return;
      insertText(inaudibleSegment(sequence));
      failedRef.current = true;
      setError(message);
      setStatus("A failed segment placeholder was added to the note.");
    });
  }

  async function transcribeChunk(chunk: RecordedChunk): Promise<void> {
    let failure: unknown = null;
    let attemptsMade = 0;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      attemptsMade = attempt + 1;
      if (!mountedRef.current) return;
      const controller = new AbortController();
      activeRequestsRef.current.add(controller);
      const timeout = setTimeout(
        () => controller.abort(),
        REQUEST_TIMEOUT_MS,
      );
      try {
        const wavAudio = await recordingToWav(chunk.audio);
        if (!mountedRef.current) return;
        if (wavAudio.size > MAX_WAV_BYTES) {
          throw new Error("audio-too-large");
        }
        const form = new FormData();
        form.append("audio", wavAudio, "voice.wav");
        form.append("language", language);
        form.append("mode", "dictation");
        if (chunkedRef.current) {
          form.append("sequence", String(chunk.sequence));
        }
        const response = await fetch("/api/voice/transcribe", {
          method: "POST",
          body: form,
          signal: controller.signal,
        });
        const result: unknown = await response.json().catch(() => null);
        if (!response.ok || !isTranscriptResponse(result)) {
          const errorCode = response.status === 413
            ? "audio-too-large"
            : result !== null &&
                  typeof result === "object" &&
                  "error" in result &&
                  typeof result.error === "string"
                ? result.error
                : "transcription-failed";
          const retryable = response.status !== 413 && (
            result !== null &&
            typeof result === "object" &&
            "retryable" in result &&
            typeof result.retryable === "boolean"
              ? result.retryable
              : response.status === 408 ||
                response.status === 429 ||
                response.status >= 500
          );
          throw new TranscriptionRequestError(errorCode, retryable);
        }
        if (!mountedRef.current) return;
        const transcript = result.transcript.trim();
        if (!transcript) throw new Error("empty-transcript");
        insertText(transcript);
        setRecordedChunks((count) => count + 1);
        setStatus(
          result.mock
            ? "MOCK transcription inserted. Review and edit it before saving."
            : "Transcribed note text inserted. Review it before saving.",
        );
        return;
      } catch (caught: unknown) {
        failure = caught;
        const retryable = caught instanceof TranscriptionRequestError
          ? caught.retryable
          : !(caught instanceof Error && caught.message === "audio-too-large");
        if (attempt === 0 && retryable) continue;
        break;
      } finally {
        clearTimeout(timeout);
        activeRequestsRef.current.delete(controller);
      }
    }
    const detail =
      failure instanceof Error && failure.message === "audio-too-large"
        ? "A dictation chunk exceeded the audio size limit."
        : `A dictation chunk could not be transcribed${attemptsMade > 1 ? " after one retry" : ""}.`;
    if (!mountedRef.current) return;
    insertText(inaudibleSegment(chunk.sequence));
    failedRef.current = true;
    setError(`${detail} Edit the placeholder or dictate that segment again.`);
    setStatus("A failed segment placeholder was added to the note.");
  }

  function queueChunk(chunk: RecordedChunk): void {
    pendingCountRef.current += 1;
    setPendingChunks(pendingCountRef.current);
    queueRef.current = queueRef.current
      .then(() => transcribeChunk(chunk))
      .catch(() => {
        if (!mountedRef.current) return;
        insertText(inaudibleSegment(chunk.sequence));
        failedRef.current = true;
        setError("An unexpected transcription error occurred.");
        setStatus("A failed segment placeholder was added to the note.");
      })
      .finally(() => {
        pendingCountRef.current -= 1;
        if (mountedRef.current) setPendingChunks(pendingCountRef.current);
      });
  }

  function drainChunks(): void {
    const total = totalChunksRef.current;
    while (true) {
      const sequence = expectedSequenceRef.current;
      const chunk = audioChunksRef.current.get(sequence);
      if (chunk) {
        audioChunksRef.current.delete(sequence);
        expectedSequenceRef.current += 1;
        queueChunk(chunk);
      } else if (total !== null && sequence < total) {
        expectedSequenceRef.current += 1;
        enqueuePlaceholder(
          sequence,
          `Dictation chunk ${sequence + 1} was empty. Review the placeholder before saving.`,
        );
      } else {
        break;
      }
    }
  }

  function receiveChunk(chunk: RecordedChunk): void {
    if (!mountedRef.current) return;
    audioChunksRef.current.set(chunk.sequence, chunk);
    drainChunks();
  }

  function finishRecording(totalChunks: number): void {
    totalChunksRef.current = totalChunks;
    if (!mountedRef.current) {
      audioChunksRef.current.clear();
      return;
    }
    setIsRecording(false);
    if (timerRef.current !== null) clearInterval(timerRef.current);
    timerRef.current = null;
    releaseStream(streamRef.current);
    streamRef.current = null;
    setStatus("Recording stopped. Transcribing the captured chunks in order…");
    drainChunks();
    void queueRef.current.then(() => {
      if (mountedRef.current && !failedRef.current && pendingCountRef.current === 0) {
        setStatus("Dictation is ready. Review and edit the note before saving.");
      }
    });
  }

  async function startRecording(): Promise<void> {
    if (!supported()) {
      setError("This browser does not support microphone recording.");
      return;
    }
    if (!window.isSecureContext) {
      setError("Microphone access requires a secure (HTTPS) connection.");
      return;
    }
    if (isRecording || isRequesting || pendingChunks > 0) return;

    setIsRequesting(true);
    setError("");
    setStatus("Requesting microphone access…");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      if (!mountedRef.current) {
        releaseStream(stream);
        return;
      }
      const mimeType = bestAudioMimeType();
      audioChunksRef.current.clear();
      expectedSequenceRef.current = 0;
      totalChunksRef.current = null;
      queueRef.current = Promise.resolve();
      chunkedRef.current = false;
      failedRef.current = false;
      pendingCountRef.current = 0;
      setPendingChunks(0);
      setRecordedChunks(0);
      setActiveChunk(1);
      setElapsedMs(0);
      streamRef.current = stream;
      const manager = new RecorderChunkManager(
        () => createChunkRecorder(stream, mimeType),
        receiveChunk,
        undefined,
        undefined,
        () => {
          setError("The microphone recorder stopped unexpectedly.");
          setStatus("Recording stopped because of a microphone error.");
        },
        finishRecording,
        (sequence) => {
          chunkedRef.current = true;
          setActiveChunk(sequence + 1);
        },
      );
      managerRef.current = manager;
      manager.start();
      const now = performance.now();
      startTimeRef.current = now;
      setIsRecording(true);
      setStatus("Recording. Speak naturally; captured audio is transcribed in the background.");
      timerRef.current = setInterval(() => {
        if (startTimeRef.current !== null) {
          setElapsedMs(performance.now() - startTimeRef.current);
        }
      }, 1_000);
    } catch (caught: unknown) {
      releaseStream(streamRef.current);
      streamRef.current = null;
      setError(
        caught instanceof Error && caught.name === "NotAllowedError"
          ? "Microphone permission was denied. Allow access and retry."
          : "The microphone could not start. Check its connection and retry.",
      );
      setStatus("Recording did not start.");
    } finally {
      if (mountedRef.current) setIsRequesting(false);
    }
  }

  function stopRecording(): void {
    setStatus("Stopping recording…");
    managerRef.current?.stop();
    managerRef.current = null;
  }

  useEffect(() => {
    shortcutRef.current = {
      isRecording,
      isRequesting,
      pendingChunks,
      start: startRecording,
      stop: stopRecording,
    };
  });

  useEffect(() => {
    mountedRef.current = true;
    const activeRequests = activeRequestsRef.current;
    return () => {
      mountedRef.current = false;
      if (timerRef.current !== null) clearInterval(timerRef.current);
      activeRequests.forEach((controller) => controller.abort());
      managerRef.current?.stop();
      releaseStream(streamRef.current);
      streamRef.current = null;
    };
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (
        (event.ctrlKey || event.metaKey) &&
        event.shiftKey &&
        event.key.toLowerCase() === "k"
      ) {
        event.preventDefault();
        const actions = shortcutRef.current;
        if (actions.isRecording) actions.stop();
        else if (!actions.isRequesting && actions.pendingChunks === 0) {
          void actions.start();
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const busy = isRequesting || pendingChunks > 0;
  const hasError = Boolean(error);
  const languageLabel = LANGUAGES.find((option) => option.code === language)?.label ?? "Auto";

  return (
    <section aria-label="Doctor voice dictation" style={containerStyle}>
      <div style={controlsStyle}>
        <details>
          <summary style={languageSummaryStyle}>Language: {languageLabel}</summary>
          <label style={labelStyle}>
            Dictation language
            <select
              value={language}
              disabled={isRecording || busy}
              onChange={(event) => setLanguage(event.target.value as VoiceLanguage)}
              style={selectStyle}
            >
              {LANGUAGES.map((option) => (
                <option key={option.code} value={option.code}>{option.label}</option>
              ))}
            </select>
          </label>
        </details>
        <button
          type="button"
          onClick={isRecording ? stopRecording : () => void startRecording()}
          disabled={!isRecording && (isRequesting || busy)}
          style={buttonStyle}
          onMouseDown={(event) => event.preventDefault()}
        >
          {isRecording
            ? "Stop dictation"
            : isRequesting
              ? "Starting…"
              : hasError
                ? "Retry dictation"
                : "Record note"}
          {!isRecording ? <span style={shortcutStyle}> Ctrl/⌘+Shift+K</span> : null}
        </button>
        {isRecording ? (
          <span role="status" aria-live="polite" style={recordingStyle}>
            <span aria-hidden="true">●</span> Recording {elapsedLabel(elapsedMs)} ·
            {" "}chunk {activeChunk}
          </span>
        ) : null}
        {pendingChunks > 0 ? (
          <span role="status" aria-live="polite">
            Transcribing {pendingChunks} chunk{pendingChunks === 1 ? "" : "s"} in order…
          </span>
        ) : recordedChunks > 0 ? (
          <span>{recordedChunks} chunk{recordedChunks === 1 ? "" : "s"} transcribed</span>
        ) : null}
      </div>
      {status ? <p role="status" aria-live="polite" style={messageStyle}>{status}</p> : null}
      {error ? <p role="alert" style={errorStyle}>{error}</p> : null}
    </section>
  );
}

const containerStyle: React.CSSProperties = {
  marginBlock: "0.5rem",
  padding: "0.75rem",
  border: "1px solid #cbd5e1",
  borderRadius: 8,
  background: "#f8fafc",
};

const controlsStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: "0.6rem",
};

const labelStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.4rem",
};

const languageSummaryStyle: React.CSSProperties = {
  minHeight: 48,
  display: "flex",
  alignItems: "center",
  cursor: "pointer",
  color: "#475569",
};

const selectStyle: React.CSSProperties = {
  minHeight: 48,
  padding: "0.4rem",
  font: "inherit",
};

const buttonStyle: React.CSSProperties = {
  minHeight: 48,
  padding: "0.45rem 0.75rem",
  border: "1px solid #0f6f5c",
  borderRadius: 8,
  background: "#fff",
  color: "#0f6f5c",
  font: "inherit",
  cursor: "pointer",
};

const shortcutStyle: React.CSSProperties = {
  marginInlineStart: "0.25rem",
  fontSize: "0.85rem",
};

const recordingStyle: React.CSSProperties = {
  color: "#b91c1c",
  fontWeight: 700,
};

const messageStyle: React.CSSProperties = {
  marginBlock: "0.5rem 0",
  color: "#475569",
};

const errorStyle: React.CSSProperties = {
  marginBlock: "0.5rem 0",
  color: "#b91c1c",
};
