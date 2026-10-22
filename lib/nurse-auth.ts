import { createHmac, timingSafeEqual } from "node:crypto";

const COOKIE_NAME = "nurse_session";
const SESSION_SECONDS = 4 * 60 * 60;

export type NurseSession = {
  name: string;
  expiresAt: number;
};

function sessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || Buffer.byteLength(secret) < 32) {
    throw new Error("SESSION_SECRET must contain at least 32 bytes.");
  }
  return secret;
}

function sign(payload: string): Buffer {
  return createHmac("sha256", sessionSecret()).update(payload).digest();
}

function secureStringEqual(actual: string, expected: string): boolean {
  const actualBytes = Buffer.from(actual);
  const expectedBytes = Buffer.from(expected);
  return actualBytes.length === expectedBytes.length &&
    timingSafeEqual(actualBytes, expectedBytes);
}

export function authenticateNurse(name: string, password: string): boolean {
  const expectedName = process.env.NURSE_NAME;
  const expectedPassword = process.env.NURSE_PASSWORD;
  if (!expectedName || !expectedPassword) {
    throw new Error("NURSE_NAME and NURSE_PASSWORD must both be configured.");
  }
  return name === expectedName && secureStringEqual(password, expectedPassword);
}

export function createNurseSession(name: string, now = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({
    role: "nurse",
    name,
    issuedAt: now,
    expiresAt: now + SESSION_SECONDS * 1000,
  })).toString("base64url");
  return `${payload}.${sign(payload).toString("base64url")}`;
}

export function verifyNurseSession(
  token: string | null | undefined,
  now = Date.now(),
): NurseSession | null {
  if (!token) return null;
  const separator = token.lastIndexOf(".");
  if (separator < 1) return null;
  const payload = token.slice(0, separator);
  let expected: Buffer;
  let actual: Buffer;
  try {
    expected = sign(payload);
    actual = Buffer.from(token.slice(separator + 1), "base64url");
  } catch {
    return null;
  }
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return null;
  }
  try {
    const decoded: unknown = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (
      decoded === null || typeof decoded !== "object" ||
      !("role" in decoded) || decoded.role !== "nurse" ||
      !("name" in decoded) || typeof decoded.name !== "string" ||
      decoded.name.length < 2 || decoded.name.length > 80 ||
      !("expiresAt" in decoded) || typeof decoded.expiresAt !== "number" ||
      decoded.expiresAt <= now
    ) {
      return null;
    }
    return { name: decoded.name, expiresAt: decoded.expiresAt };
  } catch {
    return null;
  }
}

export function nurseCookieName(): string {
  return COOKIE_NAME;
}

export function nurseCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "strict" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_SECONDS,
  };
}

export function requestNurseSession(request: Request): NurseSession | null {
  const cookie = request.headers.get("cookie")?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${COOKIE_NAME}=`));
  if (!cookie) return null;
  try {
    return verifyNurseSession(decodeURIComponent(cookie.slice(COOKIE_NAME.length + 1)));
  } catch {
    return null;
  }
}

export async function currentNurseSession(): Promise<NurseSession | null> {
  const { cookies } = await import("next/headers");
  const cookieStore = await cookies();
  return verifyNurseSession(cookieStore.get(COOKIE_NAME)?.value);
}

export async function requireNurseSession(): Promise<NurseSession> {
  const { redirect } = await import("next/navigation");
  const session = await currentNurseSession();
  if (!session) {
    redirect("/nurse/login");
    throw new Error("Unauthenticated nurse session.");
  }
  return session;
}
