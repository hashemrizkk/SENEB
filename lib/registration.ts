import { z } from "zod";
import { ar } from "./strings.ar";

/**
 * ONE schema for the browser AND the server.
 * No imports from lib/db.ts or lib/llm.ts — this file ships to the client.
 */

/**
 * The four tap questions from /intake/[id].
 * If `intakeFieldsSchema` in lib/intake.ts uses different keys, change them
 * HERE and in the `QUESTIONS` array of app/register/page.tsx.
 * lib/submitIntake.ts uses these same keys as its merge allow-list, so a
 * mismatch can never crash — but it would drop taps. Align them once.
 */
export const TAP_KEYS = [
  "missed_doses",
  "hypo_episodes",
  "foot_problem",
  "vision_change",
] as const;

export type TapKey = (typeof TAP_KEYS)[number];

export const PHONE_PATTERN = /^01[0125]\d{8}$/;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Arabic-Indic (٠-٩) and Extended Arabic-Indic (۰-۹) → 0-9. */
export function toWesternDigits(input: string): string {
  return input.replace(/[\u0660-\u0669\u06f0-\u06f9]/g, (ch) => {
    const code = ch.codePointAt(0) ?? 0;
    if (code >= 0x0660 && code <= 0x0669) return String(code - 0x0660);
    return String(code - 0x06f0);
  });
}

/**
 * "01012345678" / "10 1234 5678" / "+20 10 1234 5678" / "0020 10 1234 5678"
 * / Arabic-Indic digits  →  digits only. Validity is decided by PHONE_PATTERN.
 */
export function normalizePhone(raw: string): string {
  if (typeof raw !== "string") return "";

  const cleaned = toWesternDigits(raw).trim();
  const hadPlus = cleaned.startsWith("+");
  let digits = cleaned.replace(/\D/g, "");

  if (hadPlus && digits.startsWith("20")) {
    digits = digits.slice(2);
  } else if (!hadPlus && digits.startsWith("0020")) {
    digits = digits.slice(4);
  } else if (!hadPlus && digits.startsWith("20") && digits.length === 12) {
    digits = digits.slice(2);
  }

  // Subscriber part alone ("10 1234 5678") → add the trunk 0.
  if (digits.length === 10 && digits.startsWith("1")) digits = `0${digits}`;

  return digits;
}

// Letters (Arabic or Latin) + marks, spaces, hyphen, apostrophe.
const NAME_PATTERN = /^[\p{L}\p{M}][\p{L}\p{M}\s'\u2019-]*$/u;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// ----- Field schemas (also used per-step by the form) -----

export const fullNameSchema = z
  .string()
  .trim()
  .min(1, ar.register.errors.nameRequired)
  .min(2, ar.register.errors.nameInvalid)
  .max(100, ar.register.errors.nameInvalid)
  .regex(NAME_PATTERN, ar.register.errors.nameInvalid);

export const phoneSchema = z
  .string()
  .trim()
  .min(1, ar.register.errors.phoneRequired)
  .transform(normalizePhone)
  .refine((value) => PHONE_PATTERN.test(value), {
    message: ar.register.errors.phoneInvalid,
  });

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .refine((value) => value === "" || EMAIL_PATTERN.test(value), {
    message: ar.register.errors.emailInvalid,
  });

export const consentSchema = z
  .boolean()
  .refine((value) => value === true, {
    message: ar.register.errors.consentRequired,
  });

export const answersSchema = z.object({
  missed_doses: z.boolean().nullable().default(null),
  hypo_episodes: z.boolean().nullable().default(null),
  foot_problem: z.boolean().nullable().default(null),
  vision_change: z.boolean().nullable().default(null),
});

export const registrationSchema = z.object({
  full_name: fullNameSchema,
  phone: phoneSchema,
  email: emailSchema.default(""),
  self_description: z
    .string()
    .trim()
    .max(300, ar.register.errors.selfDescriptionLong)
    .default(""),
  answers: answersSchema,
  notes: z
    .string()
    .trim()
    .max(500, ar.register.errors.notesLong)
    .default(""),
  consent: consentSchema,
  // Honeypot: permissive here because the route checks it BEFORE safeParse,
  // so a filled honeypot gets a silent { ok: true } instead of a 400.
  website: z.string().max(200).optional(),
  request_id: z.string().regex(UUID_PATTERN, ar.register.errors.requestId),
});

export type RegistrationData = z.infer<typeof registrationSchema>;
export type TapAnswers = Partial<
  Record<TapKey, boolean | null>
>;