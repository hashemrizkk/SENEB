import { NextResponse } from "next/server";
import { z } from "zod";
import { requestDoctorSession } from "@/lib/doctor-review";
import { confirmSessionRoles } from "@/lib/db";
import { hasSameOrigin, readJsonBody } from "@/lib/requestGuards";
const schema = z.object({ assignments: z.array(z.object({ utterance_id: z.number().int().positive(), confirmed_role: z.enum(["doctor","patient","other","unattributed"]) })).max(300) });
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!hasSameOrigin(request)) return NextResponse.json({ error: "Same-origin request required." }, { status: 403 });
  const actor = requestDoctorSession(request); if (!actor) return NextResponse.json({ error: "Staff sign-in is required." }, { status: 401 });
  const bodyResult = await readJsonBody(request, 32_000); if (!bodyResult.ok) return NextResponse.json({ error: "Request body is invalid or too large." }, { status: bodyResult.status });
  try { const { id } = await context.params; const body = schema.parse(bodyResult.value); confirmSessionRoles(Number(id), body.assignments, "doctor", actor.name); return NextResponse.json({ ok: true }); }
  catch { return NextResponse.json({ error: "Every utterance needs a confirmed speaker." }, { status: 400 }); }
}
