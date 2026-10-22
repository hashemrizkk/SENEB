import { after, NextResponse } from "next/server";
import db, { getPatient } from "@/lib/db";
import { intakeRequestSchema } from "@/lib/intake";
import {
  hasSameOrigin,
  isRateLimited,
  readJsonBody,
} from "@/lib/requestGuards";
import { prepareIntake, saveIntake } from "@/lib/submitIntake";
import { generateSummarySafely } from "@/lib/summary-background";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 35;

function errorResponse(error: string, status: number): Response {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function POST(request: Request): Promise<Response> {
  if (!hasSameOrigin(request)) return errorResponse("bad_origin", 403);
  if (isRateLimited(request, "intake")) {
    return errorResponse("rate_limited", 429);
  }

  const body = await readJsonBody(request, 4_096);
  if (!body.ok) return errorResponse("bad_request", body.status);

  const parsed = intakeRequestSchema.safeParse(body.value);
  if (!parsed.success) return errorResponse("invalid", 400);
  const data = parsed.data;

  if (!getPatient(data.patient_id)) {
    return errorResponse("patient_not_found", 404);
  }

  const freeText = data.free_text?.trim() || null;
  const prepared = await prepareIntake(freeText, {
    missed_doses: data.tap_missed_doses,
    hypoglycemia_episodes: data.tap_hypo_episodes,
    foot_problem: data.tap_foot_problem,
    vision_change: data.tap_vision_change,
  });

  try {
    const intakeId = db.transaction(() =>
      saveIntake({
        patient_id: data.patient_id,
        input_method: data.input_method,
        raw_text: freeText,
        fields: prepared.fields,
        flags: prepared.flags,
        meta: prepared.meta,
      }),
    )();

    after(() => generateSummarySafely(data.patient_id));
    return NextResponse.json({ ok: true, intake_id: intakeId });
  } catch (error: unknown) {
    const errorType =
      error instanceof Error ? error.constructor.name : "UnknownError";
    console.error(`Intake save failed (${errorType}).`);
    return errorResponse("server_error", 500);
  }
}
