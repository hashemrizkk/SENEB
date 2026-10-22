import { NextResponse } from "next/server";
import { z } from "zod";
import { fullNameSchema } from "@/lib/registration";
import { insertSurveySubmission } from "@/lib/db";
import { hasSameOrigin, isRateLimited, readJsonBody } from "@/lib/requestGuards";
import { prepareSurveyConversion, surveySubmissionSchema } from "@/lib/survey/convert";

export const runtime = "nodejs";

const submissionSchema = z.object({
  full_name: fullNameSchema,
  email: z.string().trim().toLowerCase().email().max(254),
  consent: z.literal(true),
  request_id: z.string().uuid(),
  survey: surveySubmissionSchema,
  website: z.string().max(200).optional(),
}).strict();

function errorResponse(error: string, status: number): Response {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function POST(request: Request): Promise<Response> {
  if (!hasSameOrigin(request)) return errorResponse("bad_origin", 403);
  if (isRateLimited(request, "survey-submission")) {
    return errorResponse("rate_limited", 429);
  }

  const body = await readJsonBody(request, 8_192);
  if (!body.ok) return errorResponse("bad_request", body.status);
  if (!body.value || typeof body.value !== "object") {
    return errorResponse("bad_request", 400);
  }
  const raw = body.value as Record<string, unknown>;
  if (typeof raw.website === "string" && raw.website.trim() !== "") {
    return NextResponse.json({ ok: true });
  }
  const parsed = submissionSchema.safeParse(raw);
  if (!parsed.success) return errorResponse("invalid", 400);

  try {
    const now = new Date().toISOString();
    const conversion = prepareSurveyConversion(parsed.data.survey);
    insertSurveySubmission({
      request_id: parsed.data.request_id,
      full_name: parsed.data.full_name,
      email: parsed.data.email,
      answers_json: JSON.stringify(parsed.data.survey.answers),
      metadata_json: JSON.stringify(conversion.metadata),
      email_consent_at: now,
      created_at: now,
    });
    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const errorType = error instanceof Error ? error.constructor.name : "UnknownError";
    console.error(`Survey submission save failed (${errorType}).`);
    return errorResponse("server_error", 500);
  }
}
