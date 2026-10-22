import { ar } from "./strings.ar.ts";
import {
  dueMessages,
  enqueueOutboxMessage,
  markMessageFailed,
  markMessageSent,
  type StoredOutboxMessage,
} from "./db.ts";

export type OutboxMessage = StoredOutboxMessage;
export type NewOutboxMessage = Omit<
  OutboxMessage,
  "id" | "attempts" | "provider_ref" | "error" | "phone"
>;
export const REMINDER_LEAD_DAYS = 3;

export interface MessageOutbox {
  enqueue(message: NewOutboxMessage): number;
  due(now: string): OutboxMessage[];
  sent(id: number, providerRef: string, now: string): void;
  failed(id: number, attempts: number, error: string, retryAt: string | null): void;
}

export function createRecapMessage(input: {
  patientId: number;
  consentAt: string | null;
  phone: string | null;
  recap: string;
}): NewOutboxMessage | null {
  if (!input.consentAt || !input.phone) return null;
  const body = `${ar.visitRecapPrefix} ${input.recap.trim()}\n${ar.emergencyNotice}\n${ar.clinicReviewNote}`;
  if (body.length > 600) throw new Error("The recap message exceeds 600 characters.");
  return {
    patient_id: input.patientId,
    kind: "recap",
    body,
    status: "queued",
    scheduled_at: new Date(Date.now() + 30_000).toISOString(),
    sent_at: null,
  };
}

export function createReminderMessage(input: {
  patientId: number;
  visitDate: string;
  clinicLine?: string;
}): NewOutboxMessage {
  const visit = new Date(`${input.visitDate}T00:00:00.000Z`);
  if (!Number.isFinite(visit.getTime()) || visit.toISOString().slice(0, 10) !== input.visitDate) {
    throw new Error("The visit date must be a valid YYYY-MM-DD date.");
  }
  const body = `${ar.visitReminder(input.visitDate, input.clinicLine)}\n${ar.emergencyNotice}\n${ar.clinicReviewNote}`;
  return {
    patient_id: input.patientId,
    kind: "reminder",
    body,
    status: "queued",
    scheduled_at: reminderSchedule(input.visitDate, REMINDER_LEAD_DAYS),
    sent_at: null,
  };
}

export function reminderSchedule(visitDate: string, daysBefore: number): string {
  if (!Number.isInteger(daysBefore) || daysBefore < 0 || daysBefore > 30) {
    throw new Error("Reminder lead time must be between 0 and 30 days.");
  }
  const date = new Date(`${visitDate}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== visitDate) {
    throw new Error("The visit date must be a valid YYYY-MM-DD date.");
  }
  date.setUTCDate(date.getUTCDate() - daysBefore);
  return date.toISOString();
}

export async function processDueMessages(
  now = new Date().toISOString(),
  dependencies: {
    outbox: MessageOutbox;
    send: (message: OutboxMessage) => Promise<string>;
    retryDelaysMs?: number[];
  } = {
    outbox: {
      enqueue: enqueueOutboxMessage,
      due: dueMessages,
      sent: markMessageSent,
      failed: markMessageFailed,
    },
    send: sendMessage,
  },
): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;
  for (const message of dependencies.outbox.due(now)) {
    const attempts = message.attempts + 1;
    try {
      const providerRef = await dependencies.send(message);
      dependencies.outbox.sent(message.id, providerRef, now);
      sent += 1;
    } catch {
      const delay = dependencies.retryDelaysMs?.[attempts - 1];
      const retryAt = delay === undefined
        ? null
        : new Date(Date.parse(now) + delay).toISOString();
      dependencies.outbox.failed(message.id, attempts, "Provider send failed.", retryAt);
      failed += 1;
      console.error(`Message delivery failed (message ${message.id}, attempt ${attempts}).`);
    }
  }
  return { sent, failed };
}

async function sendMessage(message: OutboxMessage): Promise<string> {
  const provider = process.env.WHATSAPP_PROVIDER ?? "mock";
  if (provider === "mock") return "mock";
  if (provider !== "twilio") throw new Error("Unsupported WhatsApp provider.");

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_FROM_NUMBER;
  const toNumber = message.phone;
  if (!accountSid || !authToken || !fromNumber || !toNumber) {
    throw new Error("Twilio messaging configuration is incomplete.");
  }

  const form = new URLSearchParams({
    From: `whatsapp:${fromNumber}`,
    To: `whatsapp:${toNumber}`,
    Body: message.body,
  });
  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form,
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (!response.ok) throw new Error("Twilio rejected the message.");
  const data: unknown = await response.json();
  if (
    data === null || typeof data !== "object" ||
    !("sid" in data) || typeof data.sid !== "string"
  ) {
    throw new Error("Twilio returned an invalid message response.");
  }
  return data.sid;
}
