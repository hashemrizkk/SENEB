import { NextResponse } from "next/server";
import { z } from "zod";
import { requestDoctorSession } from "@/lib/doctor-review";
import { approveSessionSummary } from "@/lib/db";
import { hasSameOrigin, readJsonBody } from "@/lib/requestGuards";
const schema = z.object({ final_points: z.array(z.object({ text: z.string().trim().min(1).max(1000), origin: z.enum(["ai","edited","manual"]) })).max(30) });
export async function POST(request: Request, context: { params: Promise<{ id: string; summaryId: string }> }) {
  if (!hasSameOrigin(request)) return NextResponse.json({ error: "Same-origin request required." }, { status: 403 });
  const actor = requestDoctorSession(request); if (!actor) return NextResponse.json({ error: "Staff sign-in is required." }, { status: 401 });
  const bodyResult = await readJsonBody(request, 40_000); if (!bodyResult.ok) return NextResponse.json({ error: "Request body is invalid or too large." }, { status: bodyResult.status });
  try { const { id, summaryId } = await context.params; const body = schema.parse(bodyResult.value); approveSessionSummary(Number(id), Number(summaryId), body.final_points, "doctor", actor.name); return NextResponse.json({ ok: true }); }
  catch { return NextResponse.json({ error: "This draft could not be approved." }, { status: 400 }); }
}
