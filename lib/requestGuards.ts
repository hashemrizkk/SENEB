const WINDOW_MS = 10 * 60_000;
const MAX_HITS = 30;
const MAX_RATE_LIMIT_KEYS = 10_000;

type RateEntry = { count: number; resetAt: number };
const rateLimits = new Map<string, RateEntry>();

export function hasSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;

  let requestOrigin: string;
  let suppliedOrigin: string;
  try {
    requestOrigin = new URL(request.url).origin;
    suppliedOrigin = new URL(origin).origin;
  } catch {
    return false;
  }

  if (requestOrigin === suppliedOrigin) return true;
  const configuredSite = process.env.NEXT_PUBLIC_SITE_URL;
  if (!configuredSite) return false;

  try {
    return new URL(configuredSite).origin === suppliedOrigin;
  } catch {
    console.error("NEXT_PUBLIC_SITE_URL must be a valid absolute URL.");
    return false;
  }
}

export function isRateLimited(request: Request, scope: string): boolean {
  const realIp = request.headers.get("x-real-ip");
  const forwarded = request.headers.get("x-forwarded-for");
  const ip =
    realIp?.trim() ||
    forwarded?.split(",").at(-1)?.trim() ||
    "local";
  const key = `${scope}:${ip}`;
  const now = Date.now();

  for (const [entryKey, entry] of rateLimits) {
    if (entry.resetAt <= now) rateLimits.delete(entryKey);
  }

  const entry = rateLimits.get(key);
  if (!entry || entry.resetAt <= now) {
    rateLimits.delete(key);
    if (rateLimits.size >= MAX_RATE_LIMIT_KEYS) {
      const oldest = rateLimits.keys().next().value;
      if (oldest !== undefined) rateLimits.delete(oldest);
    }
    rateLimits.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }

  entry.count += 1;
  return entry.count > MAX_HITS;
}

export type JsonBodyResult =
  | { ok: true; value: unknown }
  | { ok: false; status: 400 | 413 };

export async function readJsonBody(
  request: Request,
  maxBytes: number,
): Promise<JsonBodyResult> {
  const contentType = request.headers.get("content-type")?.split(";")[0].trim();
  if (contentType !== "application/json") return { ok: false, status: 400 };

  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    return { ok: false, status: 413 };
  }

  let text: string;
  try {
    text = await request.text();
  } catch {
    return { ok: false, status: 400 };
  }
  if (new TextEncoder().encode(text).byteLength > maxBytes) {
    return { ok: false, status: 413 };
  }

  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false, status: 400 };
  }
}
