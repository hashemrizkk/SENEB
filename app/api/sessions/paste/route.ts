import { NextResponse } from "next/server";
import { z } from "zod";
import { requestDoctorSession } from "@/lib/doctor-review";
import { insertPastedSession } from "@/lib/db";
import { hasSameOrigin, readJsonBody } from "@/lib/requestGuards";
const schema = z.object({ patient_id: z.number().int().positive(), consent_confirmed: z.literal(true), text: z.string().trim().min(1).max(50000), actor_role: z.enum(["doctor","nurse"]), actor_name: z.string().trim().min(1).max(80) });
export async function POST(request: Request) {
  if (!hasSameOrigin(request)) return NextResponse.json({ error: "Same-origin request required." }, { status: 403 });
  if (!requestDoctorSession(request)) return NextResponse.json({ error: "Staff sign-in is required." }, { status: 401 });
  const bodyResult = await readJsonBody(request, 64_000); if (!bodyResult.ok) return NextResponse.json({ error: "Request body is invalid or too large." }, { status: bodyResult.status });
  try { const body = schema.parse(bodyResult.value); const id = insertPastedSession(body.patient_id, body.text, body.actor_role, body.actor_name); return NextResponse.json({ id }); }
  catch { return NextResponse.json({ error: "Could not save the pasted transcript." }, { status: 400 }); }
}
