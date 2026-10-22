import { NextResponse } from "next/server";
import { requestDoctorSession } from "@/lib/doctor-review";
import { getVisitSession, getSessionUtterances, default as db } from "@/lib/db";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!request.headers.get("cookie")?.includes("doctor_session=")) return NextResponse.json({ error: "Staff sign-in is required." }, { status: 401 });
  if (!requestDoctorSession(request)) return NextResponse.json({ error: "Staff sign-in is required." }, { status: 401 });
  const { id: rawId } = await context.params; const id = Number(rawId); const session = getVisitSession(id);
  if (!session) return NextResponse.json({ error: "Session not found." }, { status: 404 });
  const utterances = getSessionUtterances(id);
  const summaries = db.prepare("SELECT * FROM session_summaries WHERE session_id=? ORDER BY version DESC").all(id);
  return NextResponse.json({ session, utterances, summaries });
}
