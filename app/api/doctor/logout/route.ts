import { NextResponse } from "next/server";
import {
  doctorCookieName,
  doctorCookieOptions,
} from "@/lib/doctor-review";
import { hasSameOrigin } from "@/lib/requestGuards";

export async function POST(request: Request): Promise<Response> {
  if (!hasSameOrigin(request)) {
    return NextResponse.json({ ok: false, error: "Request origin was not accepted." }, { status: 403 });
  }
  const response = NextResponse.redirect(new URL("/doctor/login", request.url), 303);
  response.cookies.set(doctorCookieName(), "", { ...doctorCookieOptions(), maxAge: 0 });
  return response;
}
