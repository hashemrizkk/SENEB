import { NextResponse } from "next/server";
import { z } from "zod";
import db, { getVisitNote, overrideVisitNote } from "@/lib/db";
import { requestDoctorSession } from "@/lib/doctor-review";
import { hasSameOrigin, readJsonBody } from "@/lib/requestGuards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestSchema = z.object({
  new_light: z.enum(["green", "yellow", "red"]),
  reason: z.string().trim().min(3).max(500),
  actor_role: z.enum(["nurse", "doctor"]),
  actor_name: z.string().trim().min(2).max(80),
  confirm_lighter: z.boolean().optional().default(false),
}).strict();
const ranks = { red: 3, yellow: 2, green: 1 } as const;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  if (!requestDoctorSession(request)) return NextResponse.json({ error: "Doctor sign-in is required." }, { status: 401 });
  if (!hasSameOrigin(request)) return NextResponse.json({ error: "Request origin was not accepted." }, { status: 403 });
  const { id: rawId } = await params;
  const noteId = Number(rawId);
  if (!Number.isSafeInteger(noteId) || noteId < 1) return NextResponse.json({ error: "Invalid note." }, { status: 400 });
  const body = await readJsonBody(request, 2_000);
  if (!body.ok) return NextResponse.json({ error: "Provide a valid override request." }, { status: body.status });
  const parsed = requestSchema.safeParse(body.value);
  if (!parsed.success) return NextResponse.json({ error: "Provide a light, a reason of at least 3 characters, and the reviewer name and role." }, { status: 400 });
  const existing = getVisitNote(db, noteId);
  if (!existing) return NextResponse.json({ error: "Note not found." }, { status: 404 });
  const isLighter = existing.light === null || ranks[parsed.data.new_light] < ranks[existing.light];
  if (isLighter && !parsed.data.confirm_lighter) return NextResponse.json({ error: "Confirm before changing to a lighter light." }, { status: 409 });
  const result = overrideVisitNote(db, {
    noteId, newLight: parsed.data.new_light, reason: parsed.data.reason,
    actorRole: parsed.data.actor_role, actorName: parsed.data.actor_name, now: new Date(),
  });
  if (!result.ok) return NextResponse.json({ error: result.reason === "not_found" ? "Note not found." : "This note already has an override." }, { status: result.reason === "not_found" ? 404 : 409 });
  return NextResponse.json({ ok: true, originalLight: result.oldLight, overrideLight: parsed.data.new_light });
}
