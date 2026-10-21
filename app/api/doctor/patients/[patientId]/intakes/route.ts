import { NextResponse } from "next/server";
import db, { getPatient } from "@/lib/db";
import { intakeRequestSchema } from "@/lib/intake";
import {
  requestDoctorSession,
  savePatientIntake,
} from "@/lib/doctor-review";
import {
  hasSameOrigin,
  isRateLimited,
  readJsonBody,
} from "@/lib/requestGuards";
import { prepareIntake } from "@/lib/submitIntake";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 35;

function reply(error: string, status: number): Response {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ patientId: string }> },
): Promise<Response> {
  const session = requestDoctorSession(request);
  if (!session) return reply("Sign in is required.", 401);
  if (!hasSameOrigin(request)) return reply("Request origin was not accepted.", 403);
  if (isRateLimited(request, "doctor-followup")) {
    return reply("Too many requests. Please wait before trying again.", 429);
  }

  const { patientId: rawPatientId } = await params;
  const patientId = Number(rawPatientId);
  if (!Number.isSafeInteger(patientId) || patientId < 1) {
    return reply("Invalid patient.", 400);
  }

  const body = await readJsonBody(request, 4_096);
  if (!body.ok) {
    return reply(body.status === 413 ? "The request body is too large." : "Provide valid JSON.", body.status);
  }

  const parsed = intakeRequestSchema.safeParse(body.value);
  if (!parsed.success || parsed.data.patient_id !== patientId) {
    return reply("Check the follow-up answers and try again.", 400);
  }
  if (!getPatient(patientId)) return reply("Patient not found.", 404);

  const data = parsed.data;
  const freeText = data.free_text?.trim() || null;

  try {
    const prepared = await prepareIntake(freeText, {
      missed_doses: data.tap_missed_doses,
      hypoglycemia_episodes: data.tap_hypo_episodes,
      foot_problem: data.tap_foot_problem,
      vision_change: data.tap_vision_change,
    });
    const intakeId = savePatientIntake(
      db,
      {
        patient_id: patientId,
        input_method: data.input_method,
        raw_text: freeText,
        structured_json: JSON.stringify(prepared.fields),
        red_flags_json: JSON.stringify(prepared.flags),
        meta_json: JSON.stringify(prepared.meta),
      },
      new Date().toISOString(),
      {
        source: "clinician",
        editedBy: session.name,
        reason: "Clinic follow-up",
      },
    );

    return NextResponse.json({ ok: true, intake_id: intakeId });
  } catch (error: unknown) {
    const errorType = error instanceof Error ? error.constructor.name : "UnknownError";
    console.error(`Clinician follow-up save failed (${errorType}).`);
    return reply("The follow-up could not be saved. Check the record history before retrying.", 500);
  }
}
