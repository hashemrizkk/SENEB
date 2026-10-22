import { NextResponse } from "next/server";
import db from "@/lib/db";
import { saveNoteAndCheck, saveNoteRequestSchema } from "@/lib/note-pipeline";
import { hasSameOrigin, readJsonBody } from "@/lib/requestGuards";
import { requestDoctorSession } from "@/lib/doctor-review";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  if (!requestDoctorSession(request)) return NextResponse.json({ error: "Doctor sign-in is required." }, { status: 401 });
  if (!hasSameOrigin(request)) return NextResponse.json({ error: "Request origin was not accepted." }, { status: 403 });
  const body = await readJsonBody(request, 24_000);
  if (!body.ok) return NextResponse.json({ error: "Provide a valid note request." }, { status: body.status });
  const parsed = saveNoteRequestSchema.safeParse(body.value);
  if (!parsed.success) return NextResponse.json({ error: "Check the note, author name, and role." }, { status: 400 });
  try {
    const result = await saveNoteAndCheck(parsed.data, { database: db });
    return NextResponse.json({ ok: true, ...result }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === "NOTE_RATE_LIMIT") {
      return NextResponse.json({ error: "Please wait 3 seconds before saving another visit note." }, { status: 429 });
    }
    const kind = error instanceof Error ? error.constructor.name : "UnknownError";
    console.error(`Visit note save failed (${kind}).`);
    return NextResponse.json({ error: "The note could not be saved. Your text remains in the form; try again." }, { status: 500 });
  }
}
