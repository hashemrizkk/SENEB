import { NextResponse } from "next/server";
import { z } from "zod";
import { requestDoctorSession } from "@/lib/doctor-review";
import { createVisitSession } from "@/lib/db";
import { hasSameOrigin, readJsonBody } from "@/lib/requestGuards";
export const dynamic = "force-dynamic";
const schema = z.object({ patient_id: z.number().int().positive(), consent_confirmed: z.literal(true), actor_role: z.enum(["doctor","nurse"]), actor_name: z.string().trim().min(1).max(80) });
export async function POST(request: Request) {
  if (!hasSameOrigin(request)) return NextResponse.json({ error: "Same-origin request required." }, { status: 403 });
  if (!requestDoctorSession(request)) return NextResponse.json({ error: "Staff sign-in is required." }, { status: 401 });
  const bodyResult = await readJsonBody(request, 4096); if (!bodyResult.ok) return NextResponse.json({ error: "Request body is invalid or too large." }, { status: bodyResult.status });
  try { const body = schema.parse(bodyResult.value); const id = createVisitSession({ patientId: body.patient_id, consent: true, actorRole: body.actor_role, actorName: body.actor_name }); return NextResponse.json({ id }); }
  catch { return NextResponse.json({ error: "Could not start session; confirm consent and staff details." }, { status: 400 }); }
}
