import { NextResponse } from "next/server";
import { isRateLimited, hasSameOrigin, readJsonBody } from "@/lib/requestGuards";
import {
  explainSurvey,
  surveyExplanationRequestSchema,
} from "@/lib/survey/explain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  if (!hasSameOrigin(request)) {
    return NextResponse.json({ error: "bad_origin" }, { status: 403 });
  }
  if (isRateLimited(request, "survey-explain")) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const body = await readJsonBody(request, 4_096);
  if (!body.ok) {
    return NextResponse.json({ error: "bad_request" }, { status: body.status });
  }
  const parsed = surveyExplanationRequestSchema.safeParse(body.value);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  return NextResponse.json(await explainSurvey(parsed.data), {
    headers: { "cache-control": "no-store" },
  });
}
