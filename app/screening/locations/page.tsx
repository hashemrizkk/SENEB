import Link from "next/link";
import { cookies } from "next/headers";
import { getAnonymousScreeningSession, latestScreeningBooking, listScreeningLocations } from "@/lib/db";
import { hashToken, SCREENING_COOKIE } from "@/lib/screening/session-auth";
import BookingSelfReport from "@/components/screening/BookingSelfReport";

export const dynamic = "force-dynamic";

export default async function ScreeningLocationsPage({ searchParams }: { searchParams: Promise<{ city?: string; test?: string; booking?: string; lang?: string }> }) {
  const params = await searchParams;
  const locale = params.lang === "en" ? "en" : "ar";
  const locations = listScreeningLocations(params.city, params.test);
  const jar=await cookies();const token=jar.get(SCREENING_COOKIE)?.value;const session=token?getAnonymousScreeningSession(hashToken(token)):undefined;const booking=session?latestScreeningBooking(String(session.id)):undefined;
  const ar = locale === "ar";
  return <main className="screening-page" lang={locale} dir={ar ? "rtl" : "ltr"}><Link href={`/screening?lang=${locale}`}>{ar ? "العودة إلى الفحص" : "Back to screening"}</Link><h1>{ar ? "أماكن الفحص" : "Testing locations"}</h1><p>{ar ? "المواقع المعروضة تجريبية وليست أماكن حقيقية." : "The locations shown are demo data, not real services."}</p>{params.booking==="recorded"&&<p role="status">{ar ? "تم تسجيل فتح بيانات الموقع." : "The location details were recorded as opened."}</p>}{booking&&<section><h2>{ar ? "حالة الفحص" : "Testing status"}</h2><p>{ar ? "الحالة الحالية:" : "Current status:"} {booking.status}. {ar ? "الإفادة الذاتية غير متحقق منها." : "Self-reported information is not verified."}</p><BookingSelfReport locale={locale}/></section>}
    <form className="screening-filters"><input type="hidden" name="lang" value={locale}/><label>{ar ? "المدينة" : "City"}<select name="city" defaultValue={params.city ?? ""}><option value="">{ar ? "كل المدن" : "All cities"}</option><option value="Cairo">{ar ? "القاهرة" : "Cairo"}</option><option value="Giza">{ar ? "الجيزة" : "Giza"}</option></select></label><label>{ar ? "نوع الفحص" : "Test type"}<select name="test" defaultValue={params.test ?? ""}><option value="">{ar ? "كل الفحوصات" : "All tests"}</option><option value="hba1c">HbA1c</option><option value="fasting_glucose">{ar ? "جلوكوز صائم" : "Fasting glucose"}</option></select></label><button>{ar ? "تصفية" : "Filter"}</button></form>
    {locations.length ? <ul className="screening-location-list">{locations.map((location) => { const offered=JSON.parse(String(location.tests_offered_json)) as string[]; return <li key={String(location.id)}><h2>{String(location.name)} <span className="screening-demo-label">{ar ? "موقع تجريبي" : "Demo location"}</span></h2><p>{String(location.area)}، {String(location.city)} — {String(location.address)}</p><p>{String(location.hours_text)}</p><p>{ar ? "الهاتف:" : "Phone:"} <a dir="ltr" href={`tel:${String(location.phone)}`}>{String(location.phone)}</a></p><p>{ar ? "الفحوصات:" : "Tests:"} {offered.map((item)=>item==="hba1c"?"HbA1c":ar?"جلوكوز صائم":"Fasting glucose").join(ar ? "، " : ", ")}</p><form action="/api/screening/bookings" method="post"><input type="hidden" name="location_id" value={String(location.id)}/><input type="hidden" name="lang" value={locale}/><button type="submit">{ar ? "احجز فحصًا / اعرض بيانات التواصل" : "Book a test / view contact details"}</button></form></li>; })}</ul> : <p>{ar ? "لا توجد مواقع مطابقة الآن. يمكنك طلب التوجيه من فريق العيادة." : "No matching locations are available. Ask your clinic team for guidance."}</p>}
  </main>;
}
