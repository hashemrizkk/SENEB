"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { recordingToWav } from "@/lib/audio-wav";
import { appendTranscript } from "@/lib/voice-utils";
import { ar } from "@/lib/strings.ar";

type VoiceInputProps = {
  id: string;
  label: string;
  maxChars: number;
  transcript: string;
  onTranscriptChange: (value: string) => void;
  onAppend?: (value: string, speechPieces: readonly string[]) => void;
  direction?: "rtl" | "ltr";
  context?: "patient" | "doctor_note";
  geminiAvailable?: boolean;
  autoAppend?: boolean;
  showTranscript?: boolean;
};

const LANGUAGES = [
  { code: "ar-EG", label: ar.voice.languages.arabicEgypt },
  { code: "ar", label: ar.voice.languages.arabic },
  { code: "en-US", label: ar.voice.languages.english },
];
const PATIENT_MAX_RECORDING_MS = 30_000;
const PATIENT_MAX_WAV_BYTES = 1024 * 1024;
const DOCTOR_MAX_RECORDING_MS = 180_000;
const DOCTOR_MAX_WAV_BYTES = 8 * 1024 * 1024;

function isSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    Boolean(navigator.mediaDevices?.getUserMedia) &&
    typeof MediaRecorder !== "undefined"
  );
}

function browserCapabilityFlags(): number {
  if (typeof window === "undefined") return 0;
  return (isSupported() ? 1 : 0) | (window.isSecureContext ? 2 : 0);
}

function subscribeToBrowserCapabilities(): () => void {
  return () => {};
}

function serverBrowserCapabilities(): number {
  return 0;
}

function errorMessage(error: string): string {
  switch (error) {
    case "not-allowed":
    case "permission-denied":
      return ar.voice.permissionDenied;
    case "not-found":
    case "devices-not-found":
      return ar.voice.noMicrophone;
    case "not-readable":
    case "track-start":
      return ar.voice.microphoneBusy;
    case "insecure-context":
      return ar.voice.insecureContext;
    case "no-audio":
      return ar.voice.noAudio;
    case "audio-too-large":
      return ar.voice.audioTooLarge;
    case "gemini-not-configured":
      return ar.voice.geminiNotConfigured;
    case "rate-limited":
    case "rate_limited":
      return ar.voice.rateLimited;
    case "empty-transcript":
      return ar.voice.emptyTranscript;
    case "transcription-timeout":
      return ar.voice.timeout;
    case "transcription-failed":
      return ar.voice.failed;
    case "gemini-auth-failed":
    case "provider-auth-failed":
      return ar.voice.authFailed;
    case "gemini-model-unavailable":
      return ar.voice.modelUnavailable;
    case "unsupported-audio":
      return ar.voice.unsupportedAudio;
    case "bad-audio":
    case "recorder-failed":
      return ar.voice.recorderFailed;
    case "provider-unavailable":
    case "transcription-network-error":
      return ar.voice.providerUnavailable;
    case "bad-origin":
      return ar.voice.badOrigin;
    case "request-too-large":
      return ar.voice.requestTooLarge;
    default:
      return ar.errorGeneric;
  }
}

function mediaErrorCode(error: unknown): string {
  const name = error instanceof Error ? error.name : "";
  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return "not-allowed";
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "not-found";
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return "not-readable";
  }
  return "audio-capture";
}

function bestAudioMimeType(): string | undefined {
  const formats = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/ogg",
    "audio/mp4",
  ];
  return formats.find((format) => MediaRecorder.isTypeSupported(format));
}

function releaseStream(stream: MediaStream | null): void {
  stream?.getTracks().forEach((track) => track.stop());
}

export default function VoiceInput({
  id,
  label,
  maxChars,
  transcript,
  onTranscriptChange,
  onAppend,
  direction = "rtl",
  context = "patient",
  geminiAvailable = true,
  autoAppend = false,
  showTranscript = true,
}: VoiceInputProps) {
  const maxRecordingMs = context === "doctor_note" ? DOCTOR_MAX_RECORDING_MS : PATIENT_MAX_RECORDING_MS;
  const maxWavBytes = context === "doctor_note" ? DOCTOR_MAX_WAV_BYTES : PATIENT_MAX_WAV_BYTES;
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderErrorRef = useRef(false);
  const mountedRef = useRef(false);
  const chunksRef = useRef<Blob[]>([]);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const finalTranscriptRef = useRef("");
  const speechPiecesRef = useRef<string[]>([]);
  const recordingStartedAtRef = useRef<number | null>(null);
  const recordingDurationRef = useRef(0);
  const stoppedAtRef = useRef<number | null>(null);
  const pendingRenderAtRef = useRef<number | null>(null);
  const wavConversionMsRef = useRef(0);
  const uploadToResponseMsRef = useRef(0);
  const providerMsRef = useRef(0);
  const audioBytesRef = useRef(0);
  const timingLoggedRef = useRef(false);
  const [language, setLanguage] = useState("ar-EG");
  const [status, setStatus] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [isRequestingMic, setIsRequestingMic] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [showVoiceConsent, setShowVoiceConsent] = useState(false);
  const [voiceConsentAccepted, setVoiceConsentAccepted] = useState(false);
  const capabilityFlags = useSyncExternalStore(
    subscribeToBrowserCapabilities,
    browserCapabilityFlags,
    serverBrowserCapabilities,
  );
  const supported = (capabilityFlags & 1) !== 0;
  const secureContext = (capabilityFlags & 2) !== 0;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      abortRef.current?.abort();
      if (recorderRef.current) {
        recorderRef.current.ondataavailable = null;
        recorderRef.current.onerror = null;
        recorderRef.current.onstop = null;
        if (recorderRef.current.state === "recording") {
          recorderRef.current.stop();
        }
      }
      releaseStream(streamRef.current);
    };
  }, []);

  useEffect(() => {
    const renderedAt = pendingRenderAtRef.current;
    if (renderedAt === null) return;
    pendingRenderAtRef.current = null;
    if (process.env.NODE_ENV === "development") {
      console.info("Voice response-to-text-rendered ms", Math.round(performance.now() - renderedAt));
    }
  }, [transcript]);

  async function transcribeAudio(audio: Blob): Promise<void> {
    const controller = new AbortController();
    setIsTranscribing(true);
    setStatus(ar.voice.sendingStatus);
    try {
      if (!audio.size) {
        setStatus(errorMessage("no-audio"));
        return;
      }
      const conversionStartedAt = performance.now();
      let wavAudio: Blob;
      try {
        wavAudio = await recordingToWav(audio);
      } catch {
        setStatus(errorMessage("unsupported-audio"));
        return;
      } finally {
        wavConversionMsRef.current = Math.round(performance.now() - conversionStartedAt);
      }
      if (wavAudio.size > maxWavBytes) {
        setStatus(errorMessage("audio-too-large"));
        return;
      }
      audioBytesRef.current = wavAudio.size;

      const form = new FormData();
      form.append("audio", wavAudio, "voice.wav");
      form.append("language", language);
      form.append("context", context);
      if (context === "doctor_note") form.append("mode", "dictation");
      abortRef.current = controller;
      const requestTimeout = setTimeout(() => controller.abort(), 255_000);

      try {
        const uploadStartedAt = performance.now();
        const response = await fetch("/api/voice/transcribe", {
          method: "POST",
          body: form,
          signal: controller.signal,
        });
        const responseHeadersAt = performance.now();
        const result: unknown = await response.json().catch(() => null);
        uploadToResponseMsRef.current = Math.round(performance.now() - uploadStartedAt);
        if (
          result && typeof result === "object" && "timings" in result &&
          result.timings && typeof result.timings === "object" &&
          "providerMs" in result.timings && typeof result.timings.providerMs === "number"
        ) {
          providerMsRef.current = result.timings.providerMs;
        }
        if (process.env.NODE_ENV === "development") {
          const stoppedAt = stoppedAtRef.current ?? uploadStartedAt;
          console.info("Voice stop-to-upload-start ms", Math.round(uploadStartedAt - stoppedAt));
          console.info("Voice upload and response timing ms", {
            estimatedUploadMs: Math.max(0, Math.round(responseHeadersAt - uploadStartedAt - providerMsRef.current)),
            fetchToHeadersMs: Math.round(responseHeadersAt - uploadStartedAt),
            responseBodyMs: Math.round(performance.now() - responseHeadersAt),
            serverGeminiRoundTripMs: providerMsRef.current,
          });
        }

        if (response.status === 413) {
          setStatus(errorMessage("request-too-large"));
          return;
        }
        if (result === null || typeof result !== "object") {
          setStatus(errorMessage("unexpected-response"));
          return;
        }
        if (
          !("ok" in result) ||
          result.ok !== true ||
          !("transcript" in result) ||
          typeof result.transcript !== "string"
        ) {
          const error = "error" in result && typeof result.error === "string"
            ? result.error
            : "transcription-failed";
          setStatus(errorMessage(error));
          return;
        }

        const cleanTranscript = result.transcript.trim().slice(0, maxChars);
        if (!cleanTranscript) {
          setStatus(errorMessage("empty-transcript"));
          return;
        }
        finalTranscriptRef.current = appendTranscript(
          finalTranscriptRef.current,
          cleanTranscript,
          maxChars,
        );
        speechPiecesRef.current = [...speechPiecesRef.current, cleanTranscript];
        pendingRenderAtRef.current = performance.now();
        onTranscriptChange(finalTranscriptRef.current);
        if (autoAppend && onAppend) {
          onAppend(cleanTranscript, [cleanTranscript]);
          setStatus("Dictated text appended to the note.");
        } else {
          setStatus(ar.voice.completeStatus);
        }
      } finally {
        clearTimeout(requestTimeout);
        abortRef.current = null;
      }
    } catch {
      if (mountedRef.current) {
        setStatus(
          controller.signal.aborted
            ? errorMessage("transcription-timeout")
            : errorMessage("transcription-failed"),
        );
      }
    } finally {
      if (process.env.NODE_ENV === "development" && !timingLoggedRef.current) {
        timingLoggedRef.current = true;
        const stoppedAt = stoppedAtRef.current ?? performance.now();
        console.info("Voice timing metrics (numeric only)", {
          recordingDurationMs: Math.round(recordingDurationRef.current),
          wavConversionMs: wavConversionMsRef.current,
          uploadToResponseMs: uploadToResponseMsRef.current,
          providerMs: providerMsRef.current,
          totalPostStopMs: Math.round(performance.now() - stoppedAt),
          audioBytes: audioBytesRef.current,
        });
      }
      if (mountedRef.current) setIsTranscribing(false);
    }
  }

  async function startRecording(consentConfirmed = false): Promise<void> {
    if (!voiceConsentAccepted && !consentConfirmed) {
      setShowVoiceConsent(true);
      setStatus(ar.voice.consentPrompt);
      return;
    }
    if (!secureContext) {
      setStatus(errorMessage("insecure-context"));
      return;
    }
    if (!supported || isRecording || isRequestingMic || isTranscribing) {
      if (!supported) {
        setStatus(ar.voice.unsupportedShort);
      }
      return;
    }

    setIsRequestingMic(true);
    setStatus(ar.voice.permissionPrompt);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
    } catch (error: unknown) {
      const name = error instanceof Error ? error.name : "";
      if (name === "OverconstrainedError" || name === "TypeError") {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (fallbackError: unknown) {
          if (!mountedRef.current) return;
          setStatus(errorMessage(mediaErrorCode(fallbackError)));
          setIsRequestingMic(false);
          return;
        }
      } else {
        if (!mountedRef.current) return;
        setStatus(errorMessage(mediaErrorCode(error)));
        setIsRequestingMic(false);
        return;
      }
    }
    if (!mountedRef.current) {
      releaseStream(stream);
      return;
    }
    setIsRequestingMic(false);
    const track = stream.getAudioTracks()[0];
    if (process.env.NODE_ENV === "development" && track) {
      const settings = track.getSettings();
      console.info("Voice microphone settings", {
        echoCancellation: settings.echoCancellation,
        noiseSuppression: settings.noiseSuppression,
        autoGainControl: settings.autoGainControl,
        sampleRate: settings.sampleRate,
        channelCount: settings.channelCount,
        sampleSize: settings.sampleSize,
      });
    }

    const mimeType = bestAudioMimeType();
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    } catch {
      releaseStream(stream);
      setStatus(ar.voice.unsupportedRecorder);
      return;
    }

    streamRef.current = stream;
    recorderRef.current = recorder;
    recorderErrorRef.current = false;
    chunksRef.current = [];
    finalTranscriptRef.current = transcript;
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };
    recorder.onerror = () => {
      recorderErrorRef.current = true;
      releaseStream(streamRef.current);
      streamRef.current = null;
      recorderRef.current = null;
      setIsRecording(false);
      setStatus(errorMessage("recorder-failed"));
    };
    recorder.onstop = () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
      const recordedAudio = new Blob(chunksRef.current, {
        type: recorder.mimeType || mimeType || "audio/webm",
      });
      chunksRef.current = [];
      releaseStream(streamRef.current);
      streamRef.current = null;
      recorderRef.current = null;
      setIsRecording(false);
      const stoppedAt = performance.now();
      const recordingStartedAt = recordingStartedAtRef.current;
      recordingDurationRef.current = recordingStartedAt === null
        ? 0
        : stoppedAt - recordingStartedAt;
      stoppedAtRef.current = stoppedAt;
      if (recorderErrorRef.current) return;
      void transcribeAudio(recordedAudio);
    };

    try {
      recorder.start();
      setIsRecording(true);
      recordingStartedAtRef.current = performance.now();
      recordingDurationRef.current = 0;
      stoppedAtRef.current = null;
      wavConversionMsRef.current = 0;
      uploadToResponseMsRef.current = 0;
      providerMsRef.current = 0;
      audioBytesRef.current = 0;
      timingLoggedRef.current = false;
      setStatus(ar.voice.recordingStatus);
      timeoutRef.current = setTimeout(() => {
        if (recorder.state === "recording") recorder.stop();
      }, maxRecordingMs);
    } catch {
      releaseStream(streamRef.current);
      streamRef.current = null;
      recorderRef.current = null;
      setStatus(ar.voice.recorderStartFailed);
    }
  }

  function stopRecording(): void {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
    if (recorderRef.current?.state === "recording") {
      setStatus(ar.voice.preparingStatus);
      recorderRef.current.stop();
    }
  }

  function clearTranscript(): void {
    abortRef.current?.abort();
    finalTranscriptRef.current = "";
    speechPiecesRef.current = [];
    onTranscriptChange("");
    setStatus(ar.voice.clearedStatus);
  }

  function appendToForm(): void {
    if (!transcript.trim() || !onAppend) {
      setStatus(ar.voice.noTranscript);
      return;
    }
    onAppend(transcript, speechPiecesRef.current);
    setStatus(ar.voice.appendedStatus);
  }

  function acceptVoiceConsent(): void {
    setVoiceConsentAccepted(true);
    setShowVoiceConsent(false);
    void startRecording(true);
  }

  return (
    <section
      aria-label={label}
      style={{
        margin: "0.75rem 0",
        padding: "0.8rem",
        border: "1px solid var(--card-border)",
        borderRadius: 10,
        background: "var(--secondary)",
      }}
    >
      {showTranscript ? <>
      <label
        htmlFor={`${id}-language`}
        style={{ display: "block", fontWeight: 600, marginBottom: "0.4rem" }}
      >
        {ar.voice.captureLabel}
      </label>
      <label
        htmlFor={`${id}-transcript`}
        style={{ display: "block", fontWeight: 600, marginTop: "0.6rem" }}
      >
        {ar.voice.typeOrReviewLabel}
      </label>
      <textarea
        id={`${id}-transcript`}
        aria-label={ar.voice.transcriptLabel}
        dir={direction}
        lang={language}
        maxLength={maxChars}
        value={transcript}
        onChange={(event) => {
          finalTranscriptRef.current = event.target.value;
          onTranscriptChange(event.target.value);
        }}
        placeholder={ar.voice.transcriptPlaceholder}
        style={{
          width: "100%",
          minHeight: 96,
          boxSizing: "border-box",
          marginTop: "0.35rem",
          padding: "0.65rem",
          border: "1px solid var(--control-border)",
          borderRadius: 8,
          font: "inherit",
          fontSize: 18,
          resize: "vertical",
        }}
      />
      </> : null}
      {showTranscript ? <p style={hintStyle}>{ar.voice.characterCount(transcript.length, maxChars)}</p> : null}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
        <select
          id={`${id}-language`}
          value={language}
          disabled={isRecording || isTranscribing}
          onChange={(event) => setLanguage(event.target.value)}
          aria-label={ar.voice.languageLabel}
          style={{ minHeight: 44, padding: "0.45rem", font: "inherit" }}
        >
          {LANGUAGES.map((option) => (
            <option key={option.code} value={option.code}>
              {option.label}
            </option>
          ))}
        </select>
        {isRecording ? (
          <button type="button" onClick={stopRecording} style={buttonStyle}>
            {ar.voice.stopButton}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void startRecording()}
            disabled={!supported || !secureContext || isRequestingMic || isTranscribing || (context === "doctor_note" && !geminiAvailable)}
            style={buttonStyle}
          >
            {isRequestingMic
              ? ar.voice.requestingMic
              : isTranscribing
                ? ar.voice.transcribing
                : ar.voice.recordButton}
          </button>
        )}
        {showTranscript ? <button
          type="button"
          onClick={clearTranscript}
          disabled={
            !transcript || isRecording || isRequestingMic || isTranscribing
          }
          style={buttonStyle}
        >
          {ar.voice.clearButton}
        </button> : null}
        {onAppend && !autoAppend && showTranscript ? (
          <button
            type="button"
            onClick={appendToForm}
            disabled={!transcript.trim()}
            style={buttonStyle}
          >
            {ar.voice.appendButton}
          </button>
        ) : null}
      </div>
      {!supported ? (
        <p style={hintStyle}>
          {ar.voice.unsupportedBrowser}
        </p>
      ) : !secureContext ? (
        <p style={hintStyle}>{ar.voice.secureContextHint}</p>
      ) : null}
      {showVoiceConsent ? (
        <div role="group" aria-labelledby={`${id}-consent-title`} style={consentStyle}>
          <h3 id={`${id}-consent-title`} style={{ marginTop: 0 }}>
            {ar.voice.consentTitle}
          </h3>
          <p>{ar.voice.consentNotice}</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
            <button type="button" onClick={acceptVoiceConsent} style={buttonStyle}>
              {ar.voice.consentContinue}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowVoiceConsent(false);
                setStatus("");
              }}
              style={buttonStyle}
            >
              {ar.voice.consentCancel}
            </button>
          </div>
        </div>
      ) : null}
      <p role="status" aria-live="polite" style={hintStyle}>
        {status}
      </p>
      <p style={hintStyle}>
        {ar.voice.transferHint}
      </p>
    </section>
  );
}

const buttonStyle: React.CSSProperties = {
  minHeight: 48,
  padding: "0.45rem 0.75rem",
  border: "1px solid var(--primary-strong)",
  borderRadius: 8,
  background: "var(--surface)",
  color: "var(--primary-strong)",
  font: "inherit",
  cursor: "pointer",
};

const hintStyle: React.CSSProperties = {
  margin: "0.45rem 0 0",
  color: "var(--text-secondary)",
  fontSize: "0.9rem",
};

const consentStyle: React.CSSProperties = {
  marginTop: "0.65rem",
  padding: "0.75rem",
  border: "1px solid var(--important-border)",
  borderRadius: "var(--radius-control)",
  background: "var(--important-bg)",
};
