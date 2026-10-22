import { NextResponse } from "next/server";
import { z } from "zod";
import {
  claimSurveyEmailSend,
  getSurveySubmission,
  markSurveyEmailAccepted,
  markSurveyEmailFailed,
  saveNurseSurveyDecision,
} from "@/lib/db";
import { requestNurseSession } from "@/lib/nurse-auth";
import {
  sendNurseSurveyDecisionEmail,
  surveyEmailFailureMessage,
  surveyEmailReady,
  SurveyEmailError,
} from "@/lib/survey-email";
import { nurseSurveyDecisionSchema } from "@/lib/survey/nurse-actions";
import { hasSameOrigin, isRateLimited, readJsonBody } from "@/lib/requestGuards";

export const runtime = "nodejs";

const actionSchema = z.object({
  submission_id: z.number().int().positive(),
  decision: nurseSurveyDecisionSchema,
  assessment_confirmed: z.literal(true),
  send_email: z.boolean(),
}).strict();

function errorResponse(error: string, status: number): Response {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function POST(request: Request): Promise<Response> {
  const session = requestNurseSession(request);
  if (!session) {
    return errorResponse("Nurse sign-in is required.", 401);
  }
  if (!hasSameOrigin(request)) return errorResponse("Request origin was not accepted.", 403);
  if (isRateLimited(request, "nurse-survey-action")) {
    return errorResponse("Too many requests.", 429);
  }
  const body = await readJsonBody(request, 4_096);
  if (!body.ok) return errorResponse("Provide a valid action request.", body.status);
  const parsed = actionSchema.safeParse(body.value);
  if (!parsed.success) return errorResponse("Select a valid nurse action.", 400);

  const now = new Date().toISOString();
  const saved = saveNurseSurveyDecision({
    id: parsed.data.submission_id,
    decision: parsed.data.decision,
    nurseName: session.name,
    now,
    assessmentConfirmedAt: now,
  });
  if (saved === "not_found") return errorResponse("Survey submission not found.", 404);
  if (saved === "message_in_progress") {
    return errorResponse("An email is already being sent.", 409);
  }
  if (saved === "already_sent" && parsed.data.send_email) {
    return errorResponse("This decision has already been accepted by the email provider.", 409);
  }
  if (!parsed.data.send_email) {
    return NextResponse.json({ ok: true, email: "not_requested" });
  }
  if (!surveyEmailReady()) {
    return NextResponse.json({ ok: true, email: "not_configured" });
  }
  if (!claimSurveyEmailSend(parsed.data.submission_id)) {
    return errorResponse("This email cannot be sent again right now.", 409);
  }

  const submission = getSurveySubmission(parsed.data.submission_id);
  if (!submission) {
    markSurveyEmailFailed(parsed.data.submission_id, "Survey submission not found.");
    return errorResponse("Survey submission not found.", 404);
  }
  try {
    if (!submission.email || !submission.nurse_decided_at) {
      throw new Error("The survey submission has no consented email address or decision.");
    }
    const providerRef = await sendNurseSurveyDecisionEmail({
      email: submission.email,
      decision: parsed.data.decision,
      submissionId: submission.id,
      decidedAt: submission.nurse_decided_at,
    });
    markSurveyEmailAccepted(parsed.data.submission_id, providerRef);
    return NextResponse.json({ ok: true, email: "accepted" });
  } catch (error: unknown) {
    const failureCode = error instanceof SurveyEmailError
      ? error.code
      : "provider_unavailable";
    markSurveyEmailFailed(parsed.data.submission_id, failureCode);
    const errorType = error instanceof Error ? error.constructor.name : "UnknownError";
    console.error(`Nurse decision email failed (${errorType}, ${failureCode}).`);
    return errorResponse(
      `The nurse decision was saved, but the email was not sent. ${surveyEmailFailureMessage(failureCode)}`,
      502,
    );
  }
}
