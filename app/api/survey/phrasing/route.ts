import { NextResponse } from "next/server";
import { isRateLimited, hasSameOrigin } from "@/lib/requestGuards";
import { resolveSurveyPhrasing } from "@/lib/survey/phrasing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  if (!hasSameOrigin(request)) {
    return NextResponse.json({ error: "bad_origin" }, { status: 403 });
  }
  if (isRateLimited(request, "survey-phrasing")) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  return NextResponse.json(await resolveSurveyPhrasing(), {
    headers: { "cache-control": "no-store" },
  });
}
