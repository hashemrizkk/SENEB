import { randomInt } from "node:crypto";
import { after, NextResponse } from "next/server";
import db, {
  createPatient,
  getRegistrationReferenceCode,
  referenceCodeExists,
} from "@/lib/db";
import { registrationSchema } from "@/lib/registration";
import {
  isRateLimited,
  hasSameOrigin,
  readJsonBody,
} from "@/lib/requestGuards";
import {
  prepareIntake,
  saveIntake,
  type TapAnswers,
} from "@/lib/submitIntake";
import { generateSummarySafely } from "@/lib/summary-background";
import { prepareSurveyConversion } from "@/lib/survey/convert";
import { redFlags } from "@/lib/rules";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 35;

const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

function newCode(): string {
  let code = "";
  for (let i = 0; i < 6; i += 1) {
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return code;
}

function errorResponse(error: string, status: number): Response {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function POST(request: Request): Promise<Response> {
  if (!hasSameOrigin(request)) return errorResponse("bad_origin", 403);
  if (isRateLimited(request, "register")) {
    return errorResponse("rate_limited", 429);
  }

  const body = await readJsonBody(request, 16_384);
  if (!body.ok) return errorResponse("bad_request", body.status);
  if (!body.value || typeof body.value !== "object") {
    return errorResponse("bad_request", 400);
  }

  const raw = body.value as Record<string, unknown>;
  if (typeof raw.website === "string" && raw.website.trim() !== "") {
    return NextResponse.json({ ok: true });
  }

  const parsed = registrationSchema.safeParse(raw);
  if (!parsed.success) return errorResponse("invalid", 400);
  const data = parsed.data;
  const surveyConversion = data.survey
    ? prepareSurveyConversion(data.survey)
    : null;

  const previousCode = getRegistrationReferenceCode(data.request_id);
  if (previousCode) {
    return NextResponse.json({ ok: true, reference_code: previousCode });
  }

  const freeTextParts = [data.self_description, data.notes].filter(
    (part) => part !== "",
  );
  const freeText =
    freeTextParts.length > 0 ? freeTextParts.join("\n---\n") : null;
  const registrationAnswers: TapAnswers = {
    missed_doses: data.answers.missed_doses,
    hypoglycemia_episodes:
      data.answers.hypo_episodes === null
        ? null
        : data.answers.hypo_episodes
          ? 1
          : 0,
    foot_problem: data.answers.foot_problem,
    vision_change: data.answers.vision_change,
  };
  const prepared = await prepareIntake(freeText, registrationAnswers);
  if (surveyConversion) {
    prepared.fields.vision_change =
      surveyConversion.intakeAnswers.vision_change ??
      prepared.fields.vision_change;
    prepared.fields.emergency_symptoms_mentioned =
      surveyConversion.intakeAnswers.emergency_symptoms_mentioned ??
      prepared.fields.emergency_symptoms_mentioned;
    const updatedFlags = redFlags(prepared.fields);
    prepared.flags = {
      ...updatedFlags,
      flags: [...updatedFlags.flags, ...surveyConversion.redFlagCodes],
    };
    prepared.meta = {
      ...prepared.meta,
      survey: surveyConversion.metadata,
    };
  }

  try {
    const registration = db.transaction(() => {
      let code: string | undefined;
      for (let attempt = 0; attempt < 100; attempt += 1) {
        const candidate = newCode();
        if (!referenceCodeExists(candidate)) {
          code = candidate;
          break;
        }
      }
      if (!code) throw new Error("Unable to create a unique reference code.");

      const now = new Date().toISOString();
      const patientId = createPatient({
        name: data.full_name,
        phone: data.phone,
        age: surveyConversion?.metadata.answers.age ?? null,
        request_id: data.request_id,
        email: data.email || null,
        self_description: data.self_description || null,
        reference_code: code,
        consent_at: now,
        created_at: now,
      });

      const intakeId = saveIntake({
        patient_id: patientId,
        input_method: "typed",
        raw_text: freeText,
        fields: prepared.fields,
        flags: prepared.flags,
        meta: prepared.meta,
        ...(surveyConversion?.priorityOverride
          ? { priorityOverride: surveyConversion.priorityOverride }
          : {}),
      });

      return { code, patientId, intakeId };
    })();

    after(() => generateSummarySafely(registration.patientId));
    return NextResponse.json({ ok: true, reference_code: registration.code });
  } catch (error: unknown) {
    const existing = getRegistrationReferenceCode(data.request_id);
    if (existing) {
      return NextResponse.json({ ok: true, reference_code: existing });
    }
    const errorType =
      error instanceof Error ? error.constructor.name : "UnknownError";
    console.error(`Registration save failed (${errorType}).`);
    return errorResponse("server_error", 500);
  }
}
