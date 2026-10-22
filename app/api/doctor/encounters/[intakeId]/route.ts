import { NextResponse } from "next/server";
import { z } from "zod";
import db, {
  cancelQueuedRecap,
  getFollowupPlanDraft,
  getPatientRecord,
  saveFollowupPlanDraft,
  saveEncounterClose,
} from "@/lib/db";
import { createFollowupPlanSchema } from "@/lib/followup-plan";
import { generateEncounterDraft } from "@/lib/encounter-draft";
import { hasSummaryProviderConfigured, draftFollowupPlan, draftPatientRecap } from "@/lib/llm";
import { createRecapMessage, createReminderMessage } from "@/lib/messaging";
import { requestDoctorSession } from "@/lib/doctor-review";
import { hasSameOrigin, isRateLimited, readJsonBody } from "@/lib/requestGuards";

export const runtime = "nodejs";

const draftSchema = z.object({
  action: z.literal("draft"),
  version: z.number().int().positive(),
  note: z.string().trim().min(1).max(4_000),
}).strict();

const confirmSchema = z.object({
  action: z.literal("confirm"),
  version: z.number().int().positive(),
  note: z.string().trim().min(1).max(4_000),
  plan: z.unknown(),
  recap: z.string().trim().min(1).max(440),
}).strict();

const cancelSchema = z.object({
  action: z.literal("cancel-recap"),
  messageId: z.number().int().positive(),
}).strict();

function reply(error: string, status: number): Response {
  return NextResponse.json({ ok: false, error }, { status });
}

function recordForIntake(intakeId: number) {
  const row = db.prepare<[number], { patient_id: number }>(
    "SELECT patient_id FROM intakes WHERE id = ?",
  ).get(intakeId);
  const record = row ? getPatientRecord(row.patient_id) : null;
  const intake = record?.intakes.find((item) => item.id === intakeId);
  return record && intake ? { record, intake } : null;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ intakeId: string }> },
): Promise<Response> {
  const session = requestDoctorSession(request);
  if (!session) return reply("Sign in is required.", 401);
  if (!hasSameOrigin(request)) return reply("Request origin was not accepted.", 403);
  if (isRateLimited(request, "doctor-encounter-close")) {
    return reply("Too many requests. Please wait before trying again.", 429);
  }
  const { intakeId: rawId } = await params;
  const intakeId = Number(rawId);
  if (!Number.isSafeInteger(intakeId) || intakeId < 1) return reply("Invalid intake.", 400);
  const body = await readJsonBody(request, 24_000);
  if (!body.ok) return reply("Provide valid JSON within the request limit.", body.status);
  if (body.value === null || typeof body.value !== "object" || !("action" in body.value)) {
    return reply("Check the request and try again.", 400);
  }

  const action = body.value.action;
  if (action === "cancel-recap") {
    const parsed = cancelSchema.safeParse(body.value);
    if (!parsed.success) return reply("Invalid message cancellation request.", 400);
    const context = recordForIntake(intakeId);
    if (!context) return reply("Intake not found.", 404);
    const canceled = cancelQueuedRecap(context.record.patient.id, parsed.data.messageId);
    return NextResponse.json({ ok: canceled });
  }

  const context = recordForIntake(intakeId);
  if (!context) return reply("Intake not found.", 404);
  if (action === "draft") {
    const parsed = draftSchema.safeParse(body.value);
    if (!parsed.success) return reply("Check the note and try again.", 400);
    const { record, intake } = context;
    const llmPayload = {
      patient: {
        age: record.patient.age,
        diabetes_type: record.patient.diabetes_type,
        next_visit_date: record.patient.next_visit_date,
        last_hba1c_date: record.patient.last_hba1c_date,
        last_kidney_labs_date: record.patient.last_kidney_labs_date,
        last_foot_exam_date: record.patient.last_foot_exam_date,
        last_eye_exam_date: record.patient.last_eye_exam_date,
        last_bp_date: record.patient.last_bp_date,
      },
      intake: {
        answers: intake.fields,
        flags: intake.flags,
        patient_text: intake.raw_text,
      },
      doctor_note: parsed.data.note,
    };
    const mockMode = !hasSummaryProviderConfigured();
    try {
      const savedPlanDraft = getFollowupPlanDraft(db, intakeId, parsed.data.note);
      const draft = await generateEncounterDraft(
        {
          note: parsed.data.note,
          existingDate: record.patient.next_visit_date,
          patientDates: record.patient,
          savedDraft: savedPlanDraft,
          providerConfigured: !mockMode,
          payload: llmPayload,
        },
        {
          generatePlan: draftFollowupPlan,
          generateRecap: draftPatientRecap,
        },
      );
      if (!savedPlanDraft) {
        saveFollowupPlanDraft(db, intakeId, parsed.data.note, draft.plan, draft.mode);
      }
      return NextResponse.json({
        ok: true,
        mode: draft.mode,
        plan: draft.plan,
        recap: draft.recap,
        preview: draft.preview,
        recapEligible: Boolean(record.patient.consent_at && record.patient.phone),
      });
    } catch (error: unknown) {
      const errorType = error instanceof Error ? error.constructor.name : "UnknownError";
      console.error(`Encounter draft failed (${errorType}).`);
      return reply("A safe draft could not be created. Nothing was saved.", 503);
    }
  }

  const parsed = confirmSchema.safeParse(body.value);
  if (!parsed.success) return reply("Check the plan and recap before confirming.", 400);
  const { record } = context;
  const planResult = createFollowupPlanSchema(
    parsed.data.note,
    record.patient.next_visit_date,
  ).safeParse(parsed.data.plan);
  if (!planResult.success) return reply("The follow-up plan does not match the note evidence.", 400);
  const recapText = z.string().trim().min(1).max(440).safeParse(parsed.data.recap);
  if (!recapText.success) return reply("The recap is too long or empty.", 400);
  try {
    const recapMessage = createRecapMessage({
      patientId: record.patient.id,
      consentAt: record.patient.consent_at,
      phone: record.patient.phone,
      recap: recapText.data,
      returnPrecautions: planResult.data.return_precautions,
      nextVisitDate: planResult.data.next_visit_date ?? record.patient.next_visit_date,
      patientInstructions: planResult.data.patient_instructions,
    });
    const reminderMessage = planResult.data.next_visit_date
      ? createReminderMessage({
          patientId: record.patient.id,
          visitDate: planResult.data.next_visit_date,
        })
      : null;
    const result = saveEncounterClose({
      intakeId,
      version: parsed.data.version,
      staffName: session.name,
      note: parsed.data.note,
      plan: planResult.data,
      recapBody: recapMessage?.body ?? null,
      recapScheduledAt: recapMessage?.scheduled_at ?? new Date(Date.now() + 30_000).toISOString(),
      reminderBody: reminderMessage?.body ?? null,
      reminderScheduledAt: reminderMessage?.scheduled_at ?? null,
    });
    if (!result.ok) return reply("This intake changed. Refresh it before confirming.", 409);
    return NextResponse.json({
      ok: true,
      recapQueued: result.recapQueued,
      recapMessageId: result.recapMessageId,
      reminderQueued: result.reminderQueued,
    });
  } catch (error: unknown) {
    const errorType = error instanceof Error ? error.constructor.name : "UnknownError";
    console.error(`Encounter confirmation failed (${errorType}).`);
    return reply("The encounter could not be closed. No partial changes were saved.", 500);
  }
}
