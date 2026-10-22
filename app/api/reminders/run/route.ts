import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { requestDoctorSession } from "@/lib/doctor-review";
import { hasSameOrigin, isRateLimited } from "@/lib/requestGuards";
import { processDueMessages } from "@/lib/messaging";

export const runtime = "nodejs";

function isCronAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization") ?? "";
  const supplied = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!secret || !supplied) return false;
  const expectedBytes = Buffer.from(secret);
  const suppliedBytes = Buffer.from(supplied);
  return expectedBytes.length === suppliedBytes.length && timingSafeEqual(expectedBytes, suppliedBytes);
}

export async function POST(request: Request): Promise<Response> {
  const cronAuthorized = isCronAuthorized(request);
  if (!cronAuthorized) {
    if (!requestDoctorSession(request)) {
      return NextResponse.json({ ok: false, error: "Sign in is required." }, { status: 401 });
    }
    if (!hasSameOrigin(request)) {
      return NextResponse.json({ ok: false, error: "Request origin was not accepted." }, { status: 403 });
    }
  }
  if (isRateLimited(request, "reminders-run")) {
    return NextResponse.json({ ok: false, error: "Too many requests." }, { status: 429 });
  }
  const result = await processDueMessages(new Date().toISOString());
  return NextResponse.json({ ok: true, ...result });
}
