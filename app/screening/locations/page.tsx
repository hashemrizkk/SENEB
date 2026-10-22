import Link from "next/link";
import { cookies } from "next/headers";
import { getAnonymousScreeningSession, latestScreeningBooking, listScreeningLocations } from "@/lib/db";
import { hashToken, SCREENING_COOKIE } from "@/lib/screening/session-auth";
import BookingSelfReport from "@/components/screening/BookingSelfReport";

export const dynamic = "force-dynamic";

export default async function ScreeningLocationsPage({ searchParams }: { searchParams: Promise<{ city?: string; test?: string; booking?: string }> }) {
  const params = await searchParams;
  const locations = listScreeningLocations(params.city, params.test);
  const jar=await cookies();const token=jar.get(SCREENING_COOKIE)?.value;const session=token?getAnonymousScreeningSession(hashToken(token)):undefined;const booking=session?latestScreeningBooking(String(session.id)):undefined;
  return <main className="screening-page" lang="ar" dir="rtl"><Link href="/screening">العودة إلى الفحص</Link><h1>أماكن الفحص</h1><p>المواقع المعروضة تجريبية وليست أماكن حقيقية.</p>{params.booking==="recorded"&&<p role="status">تم تسجيل فتح بيانات الموقع.</p>}{booking&&<section><h2>حالة الفحص</h2><p>الحالة الحالية: {booking.status}. الإفادة الذاتية غير متحقق منها.</p><BookingSelfReport locale="ar"/></section>}
    <form className="screening-filters"><label>المدينة<select name="city" defaultValue={params.city ?? ""}><option value="">كل المدن</option><option value="Cairo">القاهرة</option><option value="Giza">الجيزة</option></select></label><label>نوع الفحص<select name="test" defaultValue={params.test ?? ""}><option value="">كل الفحوصات</option><option value="hba1c">HbA1c</option><option value="fasting_glucose">جلوكوز صائم</option></select></label><button>تصفية</button></form>
    {locations.length ? <ul className="screening-location-list">{locations.map((location) => { const offered=JSON.parse(String(location.tests_offered_json)) as string[]; return <li key={String(location.id)}><h2>{String(location.name)} <span className="screening-demo-label">موقع تجريبي</span></h2><p>{String(location.area)}، {String(location.city)} — {String(location.address)}</p><p>{String(location.hours_text)}</p><p>الهاتف: <a dir="ltr" href={`tel:${String(location.phone)}`}>{String(location.phone)}</a></p><p>الفحوصات: {offered.map((item)=>item==="hba1c"?"HbA1c":"جلوكوز صائم").join("، ")}</p><form action="/api/screening/bookings" method="post"><input type="hidden" name="location_id" value={String(location.id)}/><button type="submit">احجز فحصًا / اعرض بيانات التواصل</button></form></li>; })}</ul> : <p>لا توجد مواقع مطابقة الآن. يمكنك طلب التوجيه من فريق العيادة.</p>}
  </main>;
}
