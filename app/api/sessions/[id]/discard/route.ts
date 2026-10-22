import { NextResponse } from "next/server";
import { requestDoctorSession } from "@/lib/doctor-review";
import { discardVisitSession } from "@/lib/db";
import { hasSameOrigin } from "@/lib/requestGuards";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!hasSameOrigin(request)) return NextResponse.json({ error: "Same-origin request required." }, { status: 403 });
  const actor = requestDoctorSession(request); if (!actor) return NextResponse.json({ error: "Staff sign-in is required." }, { status: 401 });
  try { const { id } = await context.params; discardVisitSession(Number(id), "doctor", actor.name); return NextResponse.json({ ok: true }); }
  catch { return NextResponse.json({ error: "Approved sessions cannot be discarded." }, { status: 409 }); }
}
