"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { recordingToWav } from "@/lib/audio-wav";
import { appendTranscript } from "@/lib/voice-utils";

type VoiceInputProps = {
  id: string;
  label: string;
  maxChars: number;
  transcript: string;
  onTranscriptChange: (value: string) => void;
  onAppend?: (value: string) => void;
  direction?: "rtl" | "ltr";
};

const LANGUAGES = [
  { code: "ar-EG", label: "العربية (مصر)" },
  { code: "ar", label: "العربية" },
  { code: "en-US", label: "English" },
];
const MAX_RECORDING_MS = 30_000;
const MAX_AUDIO_BYTES = 8 * 1024 * 1024;

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
      return "لم يُسمح باستخدام الميكروفون. فعّل الإذن من إعدادات الموقع.";
    case "not-found":
    case "devices-not-found":
      return "لم يتم العثور على ميكروفون متاح.";
    case "not-readable":
    case "track-start":
      return "الميكروفون مستخدم من تطبيق آخر أو تعذّر تشغيله.";
    case "insecure-context":
      return "يلزم اتصال آمن (HTTPS أو localhost) لاستخدام الميكروفون.";
    case "no-audio":
      return "لم يتم تسجيل صوت. حاول التحدث بوضوح بعد بدء التسجيل.";
    case "audio-too-large":
      return "التسجيل طويل جدًا. حاول تسجيل مقطع أقصر.";
    case "gemini-not-configured":
      return "مفتاح Gemini غير مضبوط على الخادم. أضفه إلى .env.local ثم أعد تشغيل التطبيق.";
    case "rate-limited":
    case "rate_limited":
      return "تم تجاوز عدد المحاولات المسموح به. انتظر قليلًا ثم حاول مرة أخرى.";
    case "empty-transcript":
      return "لم يتمكن Gemini من التعرف على كلمات. اقترب من الميكروفون وحاول مجددًا.";
    case "transcription-timeout":
      return "استغرق تحويل الصوت وقتًا طويلًا. تحقق من الاتصال وحاول مجددًا.";
    case "transcription-failed":
      return "تعذّر تحويل الصوت عبر Gemini. تحقق من المفتاح والاتصال، ثم حاول مجددًا.";
    case "gemini-auth-failed":
      return "رفض Gemini مفتاح API. تأكد من GEMINI_API_KEY في .env.local ثم أعد تشغيل الخادم.";
    case "gemini-model-unavailable":
      return "نموذج Gemini المستخدم غير متاح لهذا المفتاح أو المنطقة.";
    case "unsupported-audio":
      return "تعذّر قراءة التسجيل الصوتي. حاول مجددًا بعبارة أقصر.";
    case "bad-audio":
    case "recorder-failed":
      return "تعذّر تجهيز التسجيل الصوتي. حاول مرة أخرى.";
    case "provider-unavailable":
      return "خدمة Gemini غير متاحة مؤقتًا. تحقق من الاتصال وحاول لاحقًا.";
    case "bad-origin":
      return "تعذّر إرسال التسجيل من هذه الصفحة. أعد تحميل التطبيق وحاول مجددًا.";
    default:
      return "حدث خطأ أثناء التسجيل. يمكنك كتابة النص يدويًا.";
  }
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
}: VoiceInputProps) {
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderErrorRef = useRef(false);
  const mountedRef = useRef(false);
  const chunksRef = useRef<Blob[]>([]);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const finalTranscriptRef = useRef("");
  const [language, setLanguage] = useState("ar-EG");
  const [status, setStatus] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [isRequestingMic, setIsRequestingMic] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
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

  async function transcribeAudio(audio: Blob): Promise<void> {
    if (!audio.size) {
      setStatus(errorMessage("no-audio"));
      return;
    }
    if (audio.size > MAX_AUDIO_BYTES) {
      setStatus(errorMessage("audio-too-large"));
      return;
    }

    setIsTranscribing(true);
    setStatus("جارٍ إرسال التسجيل إلى Gemini لتحويله إلى نص...");
    let wavAudio: Blob;
    try {
      wavAudio = await recordingToWav(audio);
    } catch {
      if (mountedRef.current) {
        setStatus(errorMessage("unsupported-audio"));
        setIsTranscribing(false);
      }
      return;
    }
    const form = new FormData();
    form.append("audio", wavAudio, "voice.wav");
    form.append("language", language);
    const controller = new AbortController();
    abortRef.current = controller;
    const requestTimeout = setTimeout(() => controller.abort(), 50_000);

    try {
      const response = await fetch("/api/voice/transcribe", {
        method: "POST",
        body: form,
        signal: controller.signal,
      });
      const result: unknown = await response.json().catch(() => null);
      if (
        result === null ||
        typeof result !== "object" ||
        !("ok" in result) ||
        result.ok !== true ||
        !("transcript" in result) ||
        typeof result.transcript !== "string"
      ) {
        const error =
          result && typeof result === "object" && "error" in result &&
          typeof result.error === "string"
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
      onTranscriptChange(finalTranscriptRef.current);
      setStatus("اكتمل التحويل. راجع النص وعدّله قبل إضافته إلى الحقل.");
    } catch {
      if (mountedRef.current) {
        setStatus(
          controller.signal.aborted
            ? errorMessage("transcription-timeout")
            : errorMessage("transcription-failed"),
        );
      }
    } finally {
      clearTimeout(requestTimeout);
      abortRef.current = null;
      if (mountedRef.current) setIsTranscribing(false);
    }
  }

  async function startRecording(): Promise<void> {
    if (!secureContext) {
      setStatus(errorMessage("insecure-context"));
      return;
    }
    if (!supported || isRecording || isRequestingMic || isTranscribing) {
      if (!supported) {
        setStatus("هذا المتصفح أو الجهاز لا يدعم تسجيل الصوت. يمكنك الكتابة يدويًا.");
      }
      return;
    }

    setIsRequestingMic(true);
    setStatus("يرجى السماح باستخدام الميكروفون في نافذة المتصفح.");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (error: unknown) {
      if (!mountedRef.current) return;
      const name = error instanceof Error ? error.name : "";
      const mapped =
        name === "NotAllowedError" || name === "PermissionDeniedError"
          ? "not-allowed"
          : name === "NotFoundError" || name === "DevicesNotFoundError"
            ? "not-found"
            : name === "NotReadableError" || name === "TrackStartError"
              ? "not-readable"
              : "audio-capture";
      setStatus(errorMessage(mapped));
      setIsRequestingMic(false);
      return;
    }
    if (!mountedRef.current) {
      releaseStream(stream);
      return;
    }
    setIsRequestingMic(false);

    const mimeType = bestAudioMimeType();
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    } catch {
      releaseStream(stream);
      setStatus("تعذّر تهيئة تسجيل الصوت في هذا المتصفح. يمكنك الكتابة يدويًا.");
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
      if (recorderErrorRef.current) return;
      void transcribeAudio(recordedAudio);
    };

    try {
      recorder.start();
      setIsRecording(true);
      setStatus("جارٍ التسجيل... تحدث الآن، وسيتم الإيقاف تلقائيًا بعد 30 ثانية.");
      timeoutRef.current = setTimeout(() => {
        if (recorder.state === "recording") recorder.stop();
      }, MAX_RECORDING_MS);
    } catch {
      releaseStream(streamRef.current);
      streamRef.current = null;
      recorderRef.current = null;
      setStatus("تعذّر بدء تسجيل الصوت. حاول مرة أخرى أو اكتب النص يدويًا.");
    }
  }

  function stopRecording(): void {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
    if (recorderRef.current?.state === "recording") {
      setStatus("جارٍ تجهيز التسجيل...");
      recorderRef.current.stop();
    }
  }

  function clearTranscript(): void {
    abortRef.current?.abort();
    finalTranscriptRef.current = "";
    onTranscriptChange("");
    setStatus("تم مسح النص.");
  }

  function appendToForm(): void {
    if (!transcript.trim() || !onAppend) {
      setStatus("لا يوجد نص لإضافته.");
      return;
    }
    onAppend(transcript);
    setStatus("تمت إضافة النص إلى الحقل. راجعه قبل الإرسال.");
  }

  return (
    <section
      aria-label={label}
      style={{
        margin: "0.75rem 0",
        padding: "0.8rem",
        border: "1px solid #cbd5e1",
        borderRadius: 10,
        background: "#f8fafc",
      }}
    >
      <label
        htmlFor={`${id}-language`}
        style={{ display: "block", fontWeight: 600, marginBottom: "0.4rem" }}
      >
        التسجيل الصوتي والنسخ إلى نص
      </label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
        <select
          id={`${id}-language`}
          value={language}
          disabled={isRecording || isTranscribing}
          onChange={(event) => setLanguage(event.target.value)}
          aria-label="لغة التسجيل"
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
            إيقاف وإرسال للتحويل
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void startRecording()}
            disabled={
              !supported || !secureContext || isRequestingMic || isTranscribing
            }
            style={buttonStyle}
          >
            {isRequestingMic
              ? "بانتظار إذن الميكروفون..."
              : isTranscribing
                ? "جارٍ التحويل..."
                : "ابدأ التسجيل"}
          </button>
        )}
        <button
          type="button"
          onClick={clearTranscript}
          disabled={
            !transcript || isRecording || isRequestingMic || isTranscribing
          }
          style={buttonStyle}
        >
          مسح النص
        </button>
        {onAppend ? (
          <button
            type="button"
            onClick={appendToForm}
            disabled={!transcript.trim()}
            style={buttonStyle}
          >
            أضف إلى الحقل
          </button>
        ) : null}
      </div>
      {!supported ? (
        <p style={hintStyle}>
          هذا المتصفح لا يدعم تسجيل الصوت. استخدم متصفحًا حديثًا أو اكتب يدويًا.
        </p>
      ) : !secureContext ? (
        <p style={hintStyle}>افتح الموقع عبر HTTPS أو localhost لتسجيل الصوت.</p>
      ) : null}
      <textarea
        aria-label="النص المحوّل، قابل للتعديل"
        dir={direction}
        lang={language}
        maxLength={maxChars}
        value={transcript}
        onChange={(event) => {
          finalTranscriptRef.current = event.target.value;
          onTranscriptChange(event.target.value);
        }}
        placeholder="سيظهر النص هنا ويمكنك تعديله..."
        style={{
          width: "100%",
          minHeight: 76,
          boxSizing: "border-box",
          marginTop: "0.6rem",
          padding: "0.65rem",
          border: "1px solid #94a3b8",
          borderRadius: 8,
          font: "inherit",
          resize: "vertical",
        }}
      />
      <p style={hintStyle}>{transcript.length}/{maxChars} حرف</p>
      <p role="status" aria-live="polite" style={hintStyle}>
        {status}
      </p>
      <p style={hintStyle}>
        يتم التسجيل لمدة تصل إلى 30 ثانية. بعد الإيقاف، يُرسل الصوت إلى خادم
        التطبيق ثم إلى Google Gemini باستخدام مفتاحك لتحويله إلى نص؛ لا يُحفظ
        التسجيل في قاعدة بيانات التطبيق. استخدم تسجيلات تجريبية فقط وراجع النص
        قبل استخدامه. يستلزم ذلك اتصالًا بالإنترنت وقد يستهلك حصة API.
      </p>
    </section>
  );
}

const buttonStyle: React.CSSProperties = {
  minHeight: 44,
  padding: "0.45rem 0.75rem",
  border: "1px solid #0f6f5c",
  borderRadius: 8,
  background: "#fff",
  color: "#0f6f5c",
  font: "inherit",
  cursor: "pointer",
};

const hintStyle: React.CSSProperties = {
  margin: "0.45rem 0 0",
  color: "#475569",
  fontSize: "0.9rem",
};
