import { patientSurveyDecisionMessage } from "./survey/nurse-actions.ts";
import type { NurseSurveyDecision } from "./survey/nurse-actions.ts";
import { ar } from "./strings.ar.ts";

export type SurveyEmailFailureCode =
  | "recipient_restricted"
  | "sender_domain_unverified"
  | "api_key_invalid"
  | "provider_rate_limited"
  | "provider_rejected"
  | "provider_unavailable";

export class SurveyEmailError extends Error {
  readonly code: SurveyEmailFailureCode;

  constructor(code: SurveyEmailFailureCode) {
    super(surveyEmailFailureMessage(code));
    this.code = code;
    this.name = "SurveyEmailError";
  }
}

export function surveyEmailFailureMessage(code: SurveyEmailFailureCode): string {
  switch (code) {
    case "recipient_restricted":
      return "Resend’s test sender can only email your own verified account address. Verify a domain in Resend and set RESEND_FROM_EMAIL to an address on that domain.";
    case "sender_domain_unverified":
      return "The sender domain is not verified in Resend. Verify the domain, then make RESEND_FROM_EMAIL use that exact domain.";
    case "api_key_invalid":
      return "Resend rejected the API key. Check that RESEND_API_KEY is active and copied correctly in the server’s .env.local.";
    case "provider_rate_limited":
      return "Resend rate-limited the email request. Wait briefly and try again, or check your account limits.";
    case "provider_rejected":
      return "Resend rejected the email request. Check the sender address, recipient address, and Resend dashboard for details.";
    case "provider_unavailable":
      return "Resend is temporarily unavailable or the request timed out. Check your connection and try again.";
  }
}

export function surveyEmailFailureMessageFromStoredValue(value: string): string {
  switch (value) {
    case "recipient_restricted":
    case "sender_domain_unverified":
    case "api_key_invalid":
    case "provider_rate_limited":
    case "provider_rejected":
    case "provider_unavailable":
      return surveyEmailFailureMessage(value);
    default:
      return "The email could not be sent. Check the Resend dashboard and verify your sender configuration before retrying.";
  }
}

type ResendConfiguration = {
  apiKey: string;
  fromEmail: string;
};

function resendConfiguration(): ResendConfiguration | null {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const fromEmail = process.env.RESEND_FROM_EMAIL?.trim();
  if (
    !apiKey ||
    !fromEmail ||
    !/^re_[A-Za-z0-9_]+$/.test(apiKey) ||
    !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(fromEmail)
  ) {
    return null;
  }
  return { apiKey, fromEmail };
}

export function surveyEmailReady(): boolean {
  return resendConfiguration() !== null;
}

function failureCodeForResponse(status: number, message: string): SurveyEmailFailureCode {
  const normalized = message.toLowerCase();
  if (
    status === 403 &&
    (normalized.includes("only send testing emails to your own") ||
      normalized.includes("verify a domain at resend.com"))
  ) {
    return "recipient_restricted";
  }
  if (
    status === 403 &&
    (normalized.includes("domain is not verified") ||
      normalized.includes("domain mismatch") ||
      normalized.includes("please, add and verify your domain"))
  ) {
    return "sender_domain_unverified";
  }
  if (status === 401 || normalized.includes("api key is invalid")) {
    return "api_key_invalid";
  }
  if (status === 429) return "provider_rate_limited";
  if (status >= 500) return "provider_unavailable";
  return "provider_rejected";
}

export async function sendNurseSurveyDecisionEmail(input: {
  email: string;
  decision: NurseSurveyDecision;
  submissionId: number;
  decidedAt: string;
}): Promise<string> {
  const configuration = resendConfiguration();
  if (!configuration) {
    throw new Error("Resend email configuration is incomplete.");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) {
    throw new Error("The survey notification email address is invalid.");
  }

  const action = patientSurveyDecisionMessage(input.decision);
  const text = [
    "نتيجة مراجعة الاستبيان من فريق العيادة",
    "",
    action,
    "",
    ar.emergencyNotice,
    ar.clinicReviewNote,
    "",
    "هذه الرسالة لا تستبدل التقييم الطبي. إذا لم تكن تتوقع هذه الرسالة، تواصل مع فريق العيادة.",
  ].join("\n");
  const idempotencyKey =
    `survey-action-${input.submissionId}-${input.decidedAt.replace(/[^A-Za-z0-9_-]/g, "")}`;

  let response: Response;
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${configuration.apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({
        from: configuration.fromEmail,
        to: [input.email],
        subject: "تحديث من فريق العيادة",
        text,
      }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new SurveyEmailError("provider_unavailable");
  }
  if (!response.ok) {
    let providerMessage = "";
    try {
      const providerError: unknown = await response.json();
      if (
        providerError !== null &&
        typeof providerError === "object" &&
        "message" in providerError &&
        typeof providerError.message === "string"
      ) {
        providerMessage = providerError.message.slice(0, 500);
      }
    } catch {
      providerMessage = "";
    }
    throw new SurveyEmailError(failureCodeForResponse(response.status, providerMessage));
  }

  let result: unknown;
  try {
    result = await response.json();
  } catch {
    throw new SurveyEmailError("provider_unavailable");
  }
  if (
    result === null || typeof result !== "object" ||
    !("id" in result) || typeof result.id !== "string"
  ) {
    throw new SurveyEmailError("provider_unavailable");
  }
  return result.id;
}
