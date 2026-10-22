import { after, NextResponse } from "next/server";
import db, { getPatientRecord, saveRecordedFollowup } from "@/lib/db";
import { generateAndSaveAfterWorkRating } from "@/lib/after-work-rating";
import {
  draftFollowupPlan,
  draftPatientRecap,
  hasSummaryProviderConfigured,
} from "@/lib/llm";
import { createRecapMessage, createReminderMessage } from "@/lib/messaging";
import {
  confirmFollowupRequestSchema,
  confirmRecordFollowup,
  extractFollowupRequestSchema,
  extractRecordFollowup,
} from "@/lib/record-followup";
import { requestDoctorSession } from "@/lib/doctor-review";
import {
  hasSameOrigin,
  isRateLimited,
  readJsonBody,
} from "@/lib/requestGuards";

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
  const body = await readJsonBody(request, 24_000);
  if (!body.ok) {
    return reply(body.status === 413 ? "The request body is too large." : "Provide valid JSON.", body.status);
  }
  if (body.value === null || typeof body.value !== "object" || !("action" in body.value)) {
    return reply("Check the follow-up and try again.", 400);
  }

  const action = body.value.action;
  if (action === "extract") {
    const parsed = extractFollowupRequestSchema.safeParse(body.value);
    if (!parsed.success || parsed.data.patient_id !== patientId) {
      return reply("Check the follow-up answers and note, then try again.", 400);
    }
    const record = getPatientRecord(patientId);
    if (!record) return reply("Patient not found.", 404);
    try {
      const draft = await extractRecordFollowup(
        parsed.data,
        record.patient,
        {
          providerConfigured: hasSummaryProviderConfigured(),
          generatePlan: draftFollowupPlan,
          generateRecap: draftPatientRecap,
        },
      );
      return NextResponse.json({
        ok: true,
        ...draft,
        recapEligible: Boolean(record.patient.consent_at && record.patient.phone),
      });
    } catch (error: unknown) {
      const errorType = error instanceof Error ? error.constructor.name : "UnknownError";
      console.error(`Clinician follow-up extraction failed (${errorType}).`);
      return reply("The follow-up draft could not be prepared. Your note was not saved; check it and try again.", 503);
    }
  }

  const parsed = confirmFollowupRequestSchema.safeParse(body.value);
  if (!parsed.success || parsed.data.patient_id !== patientId) {
    return reply("Check the follow-up answers and try again.", 400);
  }
  const record = getPatientRecord(patientId);
  if (!record) return reply("Patient not found.", 404);
  let followup: ReturnType<typeof confirmRecordFollowup>;
  try {
    followup = confirmRecordFollowup(
      parsed.data,
      record.patient.next_visit_date,
      {
        save: (data) => {
          const recapMessage = createRecapMessage({
            patientId,
            consentAt: record.patient.consent_at,
            phone: record.patient.phone,
            recap: data.recap,
            returnPrecautions: data.plan.return_precautions,
            nextVisitDate: data.plan.next_visit_date ?? record.patient.next_visit_date,
            patientInstructions: data.plan.patient_instructions,
          });
          const reminderMessage = data.plan.next_visit_date
            ? createReminderMessage({
                patientId,
                visitDate: data.plan.next_visit_date,
              })
            : null;
          return saveRecordedFollowup(db, {
            patientId,
            requestId: data.request_id,
            staffName: session.name,
            note: data.note,
            fields: data.fields,
            plan: data.plan,
            recapBody: recapMessage?.body ?? null,
            recapScheduledAt: recapMessage?.scheduled_at ?? null,
            reminderBody: reminderMessage?.body ?? null,
            reminderScheduledAt: reminderMessage?.scheduled_at ?? null,
          });
        },
        afterSaved: (intakeId, note) => {
          try {
            after(() => generateAndSaveAfterWorkRating(intakeId, note));
          } catch (error: unknown) {
            const errorType = error instanceof Error ? error.constructor.name : "UnknownError";
            console.error(`Could not schedule after-work rating (${errorType}).`);
          }
        },
      },
    );
  } catch (error: unknown) {
    const errorType = error instanceof Error ? error.constructor.name : "UnknownError";
    console.error(`Clinician follow-up save failed (${errorType}).`);
    return reply("The follow-up could not be saved. Check the follow-up history before retrying.", 500);
  }
  if (!followup) {
    return reply("The plan contains information that is not supported by the note. Review its intervals, dates, and medication details.", 400);
  }
  return NextResponse.json({
    ok: true,
    intake_id: followup.intakeId,
    duplicate: followup.duplicate,
    recapQueued: followup.recapQueued,
    reminderQueued: followup.reminderQueued,
  });
}
