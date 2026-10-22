import { NextResponse } from "next/server";
import db from "@/lib/db";
import { hasSummaryProviderConfigured, summarizeCase } from "@/lib/llm";
import {
  hasSameOrigin,
  isRateLimited,
  readJsonBody,
} from "@/lib/requestGuards";
import { generateCaseSummary } from "@/lib/summary";
import { requestDoctorSession } from "@/lib/doctor-review";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 90;

const requestSchema = z
  .object({ patient_id: z.number().int().positive() })
  .strict();

function errorResponse(
  error: string,
  status: number,
  retryAfterSeconds?: number,
): Response {
  return NextResponse.json(
    {
      ok: false,
      error,
      ...(retryAfterSeconds === undefined
        ? {}
        : { retry_after_seconds: retryAfterSeconds }),
    },
    {
      status,
      headers:
        retryAfterSeconds === undefined
          ? undefined
          : { "Retry-After": String(retryAfterSeconds) },
    },
  );
}

export async function POST(request: Request): Promise<Response> {
  if (!requestDoctorSession(request)) {
    return errorResponse("Doctor sign-in is required.", 401);
  }
  if (!hasSameOrigin(request)) {
    return errorResponse("Request origin was not accepted.", 403);
  }
  if (isRateLimited(request, "summary")) {
    return errorResponse("Too many requests. Please wait and try again.", 429);
  }

  const body = await readJsonBody(request, 4_096);
  if (!body.ok) {
    return errorResponse(
      body.status === 413
        ? "The request body is too large."
        : "The request body must be valid JSON.",
      body.status,
    );
  }
  const parsed = requestSchema.safeParse(body.value);
  if (!parsed.success) {
    return errorResponse("Provide a valid patient_id.", 400);
  }

  try {
    const result = await generateCaseSummary(parsed.data.patient_id, {
      db,
      summarizeCase,
      hasProvider: hasSummaryProviderConfigured,
    });
    if (!result.ok) {
      return errorResponse(
        result.error ?? "The summary could not be generated.",
        result.status ?? 500,
        result.retryAfterSeconds,
      );
    }
    return NextResponse.json({ ok: true, summary_id: result.summary_id });
  } catch (error: unknown) {
    const errorType =
      error instanceof Error ? error.constructor.name : "UnknownError";
    console.error(`Case summary save failed (${errorType}).`);
    return errorResponse(
      "The summary could not be saved. Please try again.",
      500,
    );
  }
}
