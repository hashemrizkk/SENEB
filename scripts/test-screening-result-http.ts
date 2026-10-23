import assert from "node:assert/strict";
import instrument from "../data/screening/findrisc-0.2.json" with { type: "json" };
import symptoms from "../data/screening/symptom-modifier.json" with { type: "json" };
import redflags from "../data/screening/redflags.json" with { type: "json" };

const base = process.env.TEST_BASE_URL ?? "http://localhost:3000";
const origin = new URL(base).origin;
const safeFallback = {
  en: "A blood test is the way to check. If you feel very unwell, seek urgent care.",
  ar: "فحص الدم هو طريقة التحقق. إذا شعرت بتوعك شديد، اطلب رعاية عاجلة.",
};
function takeCookie(response: Response): string {
  const setCookie = response.headers.getSetCookie?.().find((value) => value.startsWith("screening_session="));
  assert.ok(setCookie, "screening session cookie should be set");
  return setCookie.split(";")[0];
}
async function call(path: string, cookie: string, body?: unknown, method = "GET", redirect: RequestRedirect = "follow") {
  const headers = new Headers({ origin });
  if (cookie) headers.set("cookie", cookie);
  if (body instanceof FormData) { /* Fetch creates the matching multipart content type. */ }
  else if (body !== undefined) headers.set("content-type", "application/json");
  const response = await fetch(new URL(path, base), { method, headers, redirect, ...(body === undefined ? {} : { body: body instanceof FormData ? body : JSON.stringify(body) }) });
  return response;
}
async function post(path: string, cookie: string, body: unknown) {
  const response = await call(path, cookie, body, "POST");
  const data = await response.json().catch(() => ({})) as Record<string, unknown>;
  assert.equal(response.ok, true, `${path} should succeed`);
  return { response, data };
}
async function start() {
  const response = await call("/api/screening/start", "", { consent: true, locale: "en" }, "POST");
  const body = await response.json() as { session_id: string };
  assert.equal(response.status, 200);
  return { cookie: takeCookie(response), sessionId: body.session_id };
}

for (const locale of ["en", "ar"] as const) {
  const participant = await start();
  let localeCookie = participant.cookie;
  await post("/api/screening/redflags", localeCookie, { rule_ids: [], source: "gate" });
  if (locale === "ar") {
    await post("/api/screening/locale", localeCookie, { locale });
    const progress = await call("/api/screening/progress", localeCookie);
    assert.equal((await progress.json() as { locale: string }).locale, "ar", "mid-flow locale change should persist on the session");
  }
  for (const symptom of symptoms.items) await post("/api/screening/answers", localeCookie, { question_id: symptom.id, option_id: "no" });
  for (const item of instrument.items) {
    let answer: Record<string, unknown> = { option_id: item.options[0].id };
    if (item.id === "bmi") answer = { height_cm: 170, weight_kg: 70 };
    if (item.id === "waist") answer = { waist_cm: 90 };
    await post("/api/screening/answers", localeCookie, { question_id: item.id, ...answer });
  }
  const completion = await post("/api/screening/result", localeCookie, {});
  assert.ok(["low", "elevated", "high"].includes(String(completion.data.band)), `${locale} result should include a band`);
  assert.equal(completion.data.placeholder, true, "draft demo scoring stays visibly labeled");
  assert.notEqual(completion.data.guidance, safeFallback[locale], "successful result must use recommendation content");
  if (locale === "ar") assert.match(String(completion.data.guidance), /[\u0600-\u06FF]/, "Arabic result uses Arabic content");
  else assert.match(String(completion.data.guidance), /[A-Za-z]/, "English result uses English content");

  const repeated = await post("/api/screening/result", localeCookie, {});
  assert.equal(repeated.data.band, completion.data.band, "repeated completion returns the same assessment");
  assert.equal(repeated.data.guidance, completion.data.guidance);
  const result = await call("/api/screening/result", localeCookie);
  const resultData = await result.json() as Record<string, unknown>;
  assert.equal(result.status, 200);
  assert.equal(resultData.band, completion.data.band);
  assert.equal(resultData.guidance, completion.data.guidance);

  const locationPage = await call(`/screening/locations?lang=${locale}`, localeCookie);
  assert.equal(locationPage.status, 200);
  const form = new FormData();
  form.set("location_id", "demo-lab-cairo-01");
  form.set("lang", locale);
  const booking = await call("/api/screening/bookings", localeCookie, form, "POST", "manual");
  assert.equal(booking.status, 303, "booking click should redirect to the recorded location page");
  assert.match(booking.headers.get("location") ?? "", /booking=recorded/);

  const summary = await call(`/screening/summary?lang=${locale}`, localeCookie);
  const summaryHtml = await summary.text();
  assert.equal(summary.status, 200);
  assert.ok(locale === "ar" ? summaryHtml.includes("ملخص الفحص") : summaryHtml.includes("Screening summary"));

  const entered = await post("/api/screening/lab-results", localeCookie, { test_type: "hba1c", value: 7.1, unit: "percent", taken_on: new Date().toISOString().slice(0, 10), confirm_unusual: false });
  assert.equal(entered.data.review_created, true, "abnormal self-entered result creates a clinical review");
  console.log(`PASS HTTP result journey locale=${locale} band=${completion.data.band}; duplicate completion, recommendation, location booking, referral summary and clinical review verified`);
}

for (const source of ["gate", "unwell_button"] as const) {
  const participant = await start();
  const ruleIds = source === "gate" ? [redflags.items[0].id] : [];
  const escalation = await post("/api/screening/redflags", participant.cookie, { rule_ids: ruleIds, source });
  assert.equal(escalation.data.escalated, true);
  const progress = await call("/api/screening/progress", participant.cookie);
  assert.equal((await progress.json() as { status: string }).status, "safety_escalated");
  console.log(`PASS safety escalation source=${source}; questionnaire was stopped`);
}
