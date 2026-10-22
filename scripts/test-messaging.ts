import assert from "node:assert/strict";
import {
  createRecapMessage,
  processDueMessages,
  reminderSchedule,
  type NewOutboxMessage,
  type MessageOutbox,
  type OutboxMessage,
} from "../lib/messaging.ts";
import { composeRecapBody } from "../lib/recap-content.ts";

class MemoryOutbox implements MessageOutbox {
  messages: OutboxMessage[] = [];
  nextId = 1;

  enqueue(message: NewOutboxMessage): number {
    const id = this.nextId++;
    this.messages.push({
      ...message,
      id,
      attempts: 0,
      provider_ref: null,
      error: null,
      phone: null,
    });
    return id;
  }

  due(now: string): OutboxMessage[] {
    return this.messages.filter((message) =>
      message.status === "queued" && message.scheduled_at <= now,
    );
  }

  sent(id: number, providerRef: string, now: string): void {
    const item = this.messages.find((message) => message.id === id);
    assert.ok(item);
    item.status = "sent";
    item.provider_ref = providerRef;
    item.sent_at = now;
  }

  failed(id: number, attempts: number, error: string, retryAt: string | null): void {
    const item = this.messages.find((message) => message.id === id);
    assert.ok(item);
    item.attempts = attempts;
    item.error = error;
    item.status = retryAt === null ? "failed" : "queued";
    if (retryAt) item.scheduled_at = retryAt;
  }

  cancelQueuedReminder(patientId: number): void {
    for (const item of this.messages) {
      if (item.patient_id === patientId && item.kind === "reminder" && item.status === "queued") {
        item.status = "canceled";
      }
    }
  }
}

const outbox = new MemoryOutbox();
const recap = createRecapMessage({
  patientId: 10,
  consentAt: "2026-10-01T00:00:00Z",
  phone: "01000000000",
  recap: "موعد المتابعة القادم يوم ١ نوفمبر.",
});
assert.ok(recap);
assert.match(recap.body, /^Your visit recap: موعد المتابعة القادم يوم ١ نوفمبر\./);
assert.match(recap.body, /إجاباتك بيراجعها فريق العيادة/);
assert.match(recap.body, /🚨/);
outbox.enqueue(recap);
assert.equal(createRecapMessage({
  patientId: 11,
  consentAt: null,
  phone: "01000000000",
  recap: "متابعة",
}), null);
const returnPrecautions = "ارجع فورًا عند ألم الصدر أو صعوبة التنفس.";
const expandedRecap = createRecapMessage({
  patientId: 14,
  consentAt: "2026-10-01T00:00:00Z",
  phone: "01000000000",
  recap: "ملخص الزيارة. ".repeat(14),
  returnPrecautions,
  nextVisitDate: "2026-11-01",
  patientInstructions: "اتبع التعليمات المكتوبة. ".repeat(20),
});
assert.ok(expandedRecap);
assert.ok(expandedRecap.body.length <= 600);
assert.ok(expandedRecap.body.includes(returnPrecautions), "return precautions must remain verbatim");
assert.ok(expandedRecap.body.includes("موعد المتابعة القادم: 2026-11-01"));
assert.ok(expandedRecap.body.includes("اتبع التعليمات المكتوبة."));
assert.match(expandedRecap.body, /🚨/);
const expandedPreview = composeRecapBody({
  recap: "ملخص",
  returnPrecautions,
  nextVisitDate: "2026-11-01",
  patientInstructions: "اتبع التعليمات.",
});
assert.ok(expandedPreview.includes(returnPrecautions));
assert.ok(expandedPreview.includes("موعد المتابعة القادم: 2026-11-01"));

const reminder = reminderSchedule("2026-11-01", 3);
assert.equal(reminder, "2026-10-29T00:00:00.000Z");
outbox.enqueue({
  patient_id: 10,
  kind: "reminder",
  body: "موعدك يوم ١ نوفمبر",
  status: "queued",
  scheduled_at: reminder,
  sent_at: null,
});
outbox.cancelQueuedReminder(10);
assert.equal(outbox.messages[1]?.status, "canceled");

let sends = 0;
const failedOutbox = new MemoryOutbox();
failedOutbox.enqueue({
  patient_id: 12,
  kind: "recap",
  body: "Your visit recap: {{1}}",
  status: "queued",
  scheduled_at: "2026-10-22T10:00:00.000Z",
  sent_at: null,
});
await processDueMessages("2026-10-22T10:00:00.000Z", {
  outbox: failedOutbox,
  send: async () => {
    sends += 1;
    throw new Error("provider unavailable");
  },
  retryDelaysMs: [1_000, 2_000],
});
assert.equal(failedOutbox.messages[0]?.attempts, 1);
assert.equal(failedOutbox.messages[0]?.status, "queued");
await processDueMessages("2026-10-22T10:00:01.000Z", {
  outbox: failedOutbox,
  send: async () => {
    sends += 1;
    throw new Error("provider unavailable");
  },
  retryDelaysMs: [1_000, 2_000],
});
await processDueMessages("2026-10-22T10:00:03.000Z", {
  outbox: failedOutbox,
  send: async () => {
    sends += 1;
    throw new Error("provider unavailable");
  },
  retryDelaysMs: [1_000, 2_000],
});
assert.equal(sends, 3);
assert.equal(failedOutbox.messages[0]?.status, "failed");

const defaultRetryOutbox = new MemoryOutbox();
defaultRetryOutbox.enqueue({
  patient_id: 13,
  kind: "reminder",
  body: "Reminder",
  status: "queued",
  scheduled_at: "2026-10-22T10:00:00.000Z",
  sent_at: null,
});
await processDueMessages("2026-10-22T10:00:00.000Z", {
  outbox: defaultRetryOutbox,
  send: async () => { throw new Error("provider unavailable"); },
});
assert.equal(defaultRetryOutbox.messages[0]?.status, "queued");
assert.equal(defaultRetryOutbox.messages[0]?.scheduled_at, "2026-10-22T10:01:00.000Z");
console.log("PASS  consent gate, template recap, reminder date/cancel, and three-attempt backoff");
