import { NextResponse } from "next/server";
import db, { getPatientRecord } from "@/lib/db";
import {
  clinicianEditSchema,
  requestDoctorSession,
  saveClinicianEdit,
} from "@/lib/doctor-review";
import { hasSameOrigin, readJsonBody } from "@/lib/requestGuards";

export const runtime = "nodejs";

function reply(error: string, status: number): Response {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ intakeId: string }> },
): Promise<Response> {
  if (!requestDoctorSession(request)) return reply("Sign in is required.", 401);
  if (!hasSameOrigin(request)) return reply("Request origin was not accepted.", 403);
  const { intakeId: rawId } = await params;
  const intakeId = Number(rawId);
  if (!Number.isSafeInteger(intakeId) || intakeId < 1) return reply("Invalid intake.", 400);
  const body = await readJsonBody(request, 24_000);
  if (!body.ok) {
    return reply(body.status === 413 ? "The request body is too large." : "Provide valid JSON.", body.status);
  }
  const parsed = clinicianEditSchema.safeParse(body.value);
  if (!parsed.success) return reply("Check the edited fields and try again.", 400);
  if (!getPatientRecordForIntake(intakeId)) return reply("Intake not found.", 404);

  const session = requestDoctorSession(request);
  if (!session) return reply("Sign in is required.", 401);
  try {
    const result = saveClinicianEdit(db, intakeId, session.name, parsed.data);
    if (result.ok) return NextResponse.json({ ok: true, record: result.record });
    const current = getPatientRecordForIntake(intakeId);
    return NextResponse.json({
      ok: false,
      error: "This intake was updated by another clinician. Your edits were not saved.",
      latestVersion: current?.version ?? null,
      latestRecord: current ?? null,
    }, { status: 409 });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === "The intake changed while saving.") {
      const current = getPatientRecordForIntake(intakeId);
      return NextResponse.json({
        ok: false,
        error: "This intake was updated by another clinician. Your edits were not saved.",
        latestVersion: current?.version ?? null,
        latestRecord: current ?? null,
      }, { status: 409 });
    }
    const errorType = error instanceof Error ? error.constructor.name : "UnknownError";
    console.error(`Clinician edit failed (${errorType}).`);
    return reply("The changes could not be saved. Please try again.", 500);
  }
}

function getPatientRecordForIntake(intakeId: number) {
  const row = db.prepare<[number], { patient_id: number }>(
    "SELECT patient_id FROM intakes WHERE id = ?",
  ).get(intakeId);
  return row
    ? getPatientRecord(row.patient_id)?.intakes.find((intake) => intake.id === intakeId)
    : undefined;
}
