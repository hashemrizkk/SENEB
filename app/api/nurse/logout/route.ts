import { NextResponse } from "next/server";
import { hasSameOrigin } from "@/lib/requestGuards";
import { nurseCookieName, nurseCookieOptions } from "@/lib/nurse-auth";

export async function POST(request: Request): Promise<Response> {
  if (!hasSameOrigin(request)) {
    return NextResponse.json({ ok: false, error: "Request origin was not accepted." }, { status: 403 });
  }
  const response = NextResponse.redirect(new URL("/nurse/login", request.url), 303);
  response.cookies.set(nurseCookieName(), "", { ...nurseCookieOptions(), maxAge: 0 });
  return response;
}
