import { NextResponse } from "next/server";
import { z } from "zod";
import {
  authenticateNurse,
  createNurseSession,
  nurseCookieName,
  nurseCookieOptions,
} from "@/lib/nurse-auth";
import {
  clearFailedLogins,
  failedLoginIsLimited,
  recordFailedLogin,
} from "@/lib/doctor-review";
import { hasSameOrigin, isRateLimited, readJsonBody } from "@/lib/requestGuards";

export const runtime = "nodejs";

const loginSchema = z.object({
  name: z.string().trim().min(2).max(80),
  password: z.string().min(1).max(512),
}).strict();

function reply(error: string, status: number): Response {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function POST(request: Request): Promise<Response> {
  if (!hasSameOrigin(request)) return reply("Request origin was not accepted.", 403);
  if (isRateLimited(request, "nurse-login") || failedLoginIsLimited(request)) {
    return reply("Too many sign-in attempts. Please wait and try again.", 429);
  }
  const body = await readJsonBody(request, 4_096);
  if (!body.ok) return reply("Provide a valid JSON sign-in request.", body.status);
  const parsed = loginSchema.safeParse(body.value);
  if (!parsed.success) return reply("Enter a valid staff name and password.", 400);

  try {
    if (!authenticateNurse(parsed.data.name, parsed.data.password)) {
      recordFailedLogin(request);
      return reply("Sign in failed. Check your details and try again.", 401);
    }
    const response = NextResponse.json({ ok: true });
    response.cookies.set(
      nurseCookieName(),
      createNurseSession(parsed.data.name),
      nurseCookieOptions(),
    );
    clearFailedLogins(request);
    return response;
  } catch (error: unknown) {
    const errorType = error instanceof Error ? error.constructor.name : "UnknownError";
    console.error(`Nurse sign-in configuration failed (${errorType}).`);
    return reply("Nurse sign-in is not configured. Contact the application administrator.", 503);
  }
}
