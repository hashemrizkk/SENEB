import { NextResponse } from "next/server";
import { requestDoctorSession } from "@/lib/doctor-review";
import { getVisitSession, endVisitSession } from "@/lib/db";
import { hasSameOrigin } from "@/lib/requestGuards";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!hasSameOrigin(request)) return NextResponse.json({ error: "Same-origin request required." }, { status: 403 });
  const actor = requestDoctorSession(request); if (!actor) return NextResponse.json({ error: "Staff sign-in is required." }, { status: 401 });
  const { id } = await context.params;
  try { if (!getVisitSession(Number(id))) return NextResponse.json({ error: "Session not found." }, { status: 404 }); endVisitSession(Number(id), "doctor", actor.name); return NextResponse.json({ ok: true }); }
  catch { return NextResponse.json({ error: "Could not end this session." }, { status: 400 }); }
}
