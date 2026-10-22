import { after, NextResponse } from "next/server";
import db, {
  buildAfterWorkRatingInput,
  hasAfterWorkRating,
  getLatestClinicianNote,
  getPatientRecord,
  saveAfterWorkRating,
  saveFollowupPlanDraft,
} from "@/lib/db";
import {
  clinicianEditSchema,
  requestDoctorSession,
  saveClinicianEdit,
} from "@/lib/doctor-review";
import { generateFollowupPlanDraft } from "@/lib/followup-plan-drafts";
import {
  draftFollowupPlan,
  generateAfterWorkRating,
  hasSummaryProviderConfigured,
  verifyAfterWorkRatingQuotes,
} from "@/lib/llm";
import { hasSameOrigin, readJsonBody } from "@/lib/requestGuards";
import { afterWorkRatingSchema } from "@/lib/summary-types";

export const runtime = "nodejs";

function reply(error: string, status: number): Response {
  return NextResponse.json({ ok: false, error }, { status });
}

async function generateAndSaveAfterWorkRating(intakeId: number, note: string): Promise<void> {
  try {
    const safeNote = /requestedSchema/i.test(note) ? "" : note;
    const context = buildAfterWorkRatingInput(db, intakeId, safeNote);
    if (!context || hasAfterWorkRating(db, intakeId, note)) return;
    const generated = await generateAfterWorkRating(context.input);
    if (!generated) return;
    const output = afterWorkRatingSchema.safeParse(
      verifyAfterWorkRatingQuotes(generated.output, safeNote),
    );
    if (!output.success) {
      console.error("After-work rating output did not pass validation.");
      return;
    }
    const mode = generated.model === "fallback"
      ? "fallback"
      : generated.model === "mock"
        ? "mock"
        : "llm";
    saveAfterWorkRating(db, {
      patientId: context.patientId,
      intakeId,
      note,
      output: output.data,
      mode,
      model: mode === "llm" ? generated.model : null,
    });
  } catch (error: unknown) {
    const errorType = error instanceof Error ? error.constructor.name : "UnknownError";
    console.error(`After-work rating failed (${errorType}).`);
  }
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
    const previousNote = getLatestClinicianNote(db, intakeId);
    const result = saveClinicianEdit(
      db,
      intakeId,
      session.name,
      parsed.data,
      previousNote,
    );
    if (result.ok) {
      if (result.noteChanged && parsed.data.note) {
        const note = parsed.data.note;
        const patientRecord = getPatientRecord(result.record.patient_id);
        const intake = patientRecord?.intakes.find((item) => item.id === intakeId);
        if (patientRecord && intake) {
          const payload = {
            patient: {
              age: patientRecord.patient.age,
              diabetes_type: patientRecord.patient.diabetes_type,
              next_visit_date: patientRecord.patient.next_visit_date,
            },
            intake: {
              answers: intake.fields,
              flags: intake.flags,
              patient_text: intake.raw_text,
            },
            doctor_note: parsed.data.note,
          };
          after(async () => {
            await Promise.all([
              generateFollowupPlanDraft(
                {
                  intakeId,
                  noteChanged: true,
                  note,
                  existingDate: patientRecord.patient.next_visit_date,
                  patientDates: patientRecord.patient,
                  payload,
                },
                {
                  providerConfigured: hasSummaryProviderConfigured(),
                  generate: draftFollowupPlan,
                  save: (id, note, plan, mode) =>
                    saveFollowupPlanDraft(db, id, note, plan, mode),
                },
              ),
              generateAndSaveAfterWorkRating(intakeId, note),
            ]);
          });
        } else {
          console.error("Automatic follow-up draft could not load the saved intake.");
        }
      }
      return NextResponse.json({
        ok: true,
        record: result.record,
        noteChanged: result.noteChanged,
      });
    }
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
