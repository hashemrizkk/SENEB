import { NextResponse } from "next/server";
import { requestDoctorSession } from "@/lib/doctor-review";
import { addSessionUtterances, getVisitSession, sessionSegmentExists } from "@/lib/db";
import { hasSameOrigin } from "@/lib/requestGuards";
import { DEFAULT_GEMINI_STT_MODEL, transcribeSessionSegment, withValidatedGeminiWav } from "@/lib/gemini-audio";
import { MAX_SEGMENT_BYTES, MAX_SEGMENTS, SEGMENT_SECONDS } from "@/lib/session-config";
export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!hasSameOrigin(request)) return NextResponse.json({ error: "Same-origin request required." }, { status: 403 });
  const actor = requestDoctorSession(request); if (!actor) return NextResponse.json({ error: "Staff sign-in is required." }, { status: 401 });
  let form: FormData; try { form = await request.formData(); } catch { return NextResponse.json({ error: "Audio upload is invalid." }, { status: 400 }); }
  const audio = form.get("audio"); const segment = Number(form.get("segment_no")); const { id: rawId } = await context.params; const id = Number(rawId);
  if (!(audio instanceof File)) return NextResponse.json({ error: "Audio is required." }, { status: 400 });
  if (audio.size > MAX_SEGMENT_BYTES) return NextResponse.json({ error: "Audio segment is over 3 MB." }, { status: 413 });
  if (audio.type.split(";")[0].toLowerCase() !== "audio/wav") return NextResponse.json({ error: "Use a supported WAV audio segment." }, { status: 415 });
  if (!Number.isInteger(segment) || segment < 1 || segment > MAX_SEGMENTS) return NextResponse.json({ error: "Segment number is out of range." }, { status: 400 });
  const session = getVisitSession(id); if (!session || session.status !== "recording") return NextResponse.json({ error: "Session is not recording." }, { status: 409 });
  if (sessionSegmentExists(id, segment)) return NextResponse.json({ ok: true, duplicate: true });
  try { const model = process.env.STT_GEMINI_MODEL || DEFAULT_GEMINI_STT_MODEL; const utterances = await withValidatedGeminiWav(audio, audio.type, MAX_SEGMENT_BYTES, () => transcribeSessionSegment(audio, model), SEGMENT_SECONDS * 1000); if (!utterances.length) return NextResponse.json({ error: "No speech was recognized in this segment." }, { status: 422 }); addSessionUtterances(id, segment, utterances, { role: "doctor", name: actor.name }); return NextResponse.json({ ok: true, utterances }); }
  catch (error) {
    if (error instanceof Error && error.message === "Gemini session transcription is not configured.") {
      return NextResponse.json({ error: "Gemini transcription is not configured on the server. Check GEMINI_API_KEY." }, { status: 503 });
    }
    const statusMatch = error instanceof Error ? error.message.match(/Gemini session request failed \((\d{3})\)\./) : null;
    const providerStatus = statusMatch ? Number(statusMatch[1]) : undefined;
    const messages: Record<number, string> = {
      400: "Gemini rejected this audio request. Check the uploaded audio and transcription request.",
      401: "Gemini rejected the server API key. Check GEMINI_API_KEY.",
      403: "Gemini denied this request. Check the API key's Gemini access and quota.",
      404: "The configured Gemini transcription model was not found. Check STT_GEMINI_MODEL.",
      429: "Gemini rate limit or quota reached. Wait a moment, then retry the segment.",
    };
    if (providerStatus !== undefined) {
      const message = messages[providerStatus] ?? "Gemini transcription is temporarily unavailable. Retry the segment.";
      return NextResponse.json({ error: message }, { status: providerStatus === 429 ? 429 : providerStatus >= 500 ? 503 : 502 });
    }
    if (error instanceof Error && error.message === "Gemini returned invalid session transcription output.") {
      return NextResponse.json({ error: "Gemini returned an unreadable transcript for this segment. Retry the segment." }, { status: 502 });
    }
    if (error instanceof Error && error.message.startsWith("Session transcription providers failed (")) {
      return NextResponse.json({ error: "Gemini and Groq could not transcribe this segment. Check provider access or quota, then retry." }, { status: 502 });
    }
    return NextResponse.json({ error: "Transcription could not reach Gemini. Check server network access, then retry the segment." }, { status: 502 });
  }
}
