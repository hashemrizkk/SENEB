import Link from "next/link";
import PrintButton from "@/components/screening/PrintButton";
import { cookies } from "next/headers";
import { getAnonymousScreeningSession, getContentBlock, getScreeningResponses, getScreeningSummary, screeningContact } from "@/lib/db";
import { hashToken, SCREENING_COOKIE } from "@/lib/screening/session-auth";
import instrument from "@/data/screening/findrisc-0.2.json";
import symptoms from "@/data/screening/symptom-modifier.json";

export const dynamic = "force-dynamic";

export default async function ScreeningSummaryPage({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const params = await searchParams;
  const jar=await cookies();
  const token=jar.get(SCREENING_COOKIE)?.value;
  const session=token?getAnonymousScreeningSession(hashToken(token)):undefined;
  const summary=session?getScreeningSummary(String(session.id)):undefined;
  const contact=session?screeningContact(String(session.id)):undefined;
  const responses=session?getScreeningResponses(String(session.id)):[];
  const locale=params.lang==="ar"?"ar":params.lang==="en"?"en":session?.locale==="ar"?"ar":"en";
  if(!summary)return <main className="screening-page" lang={locale} dir={locale==="ar"?"rtl":"ltr"}><h1>{locale==="ar"?"الملخص غير متاح":"Summary unavailable"}</h1><p>{locale==="ar"?"أكمل الفحص أولًا لعرض الملخص.":"Complete the screening first to view a summary."}</p><Link href="/screening">{locale==="ar"?"بدء الفحص":"Start screening"}</Link></main>;
  const band=String(summary.band);
  let contentKeys:string[]=[];try{contentKeys=JSON.parse(String(summary.content_block_keys_json)) as string[];}catch{}
  const body=getContentBlock(contentKeys[0]??"safe_fallback",locale)?.body??(locale==="ar"?"فحص الدم هو الطريقة للتحقق. إذا شعرت بتوعك شديد، اطلب رعاية عاجلة.":"A blood test is the way to check. If you feel very unwell, seek urgent care.");
  const answerRows=responses.map((answer)=>{
    const question=instrument.items.find((candidate)=>candidate.id===answer.question_id);
    if(question){const option=question.options.find((candidate)=>candidate.id===answer.option_id);return {id:answer.question_id,question:question.question[locale],answer:option?.[locale]??answer.option_id};}
    const symptom=symptoms.items.find((candidate)=>candidate.id===answer.question_id);
    return symptom?{id:answer.question_id,question:symptom[locale],answer:answer.option_id}:null;
  }).filter((item):item is {id:string;question:string;answer:string}=>Boolean(item));
  return <main className="screening-page screening-print" lang={locale} dir={locale==="ar"?"rtl":"ltr"}>
    <Link className="screening-no-print" href="/screening">{locale==="ar"?"العودة":"Back"}</Link>
    <h1>{locale==="ar"?"ملخص الفحص":"Screening summary"}</h1>
    <p>{locale==="ar"?"التاريخ":"Date"}: {String(summary.computed_at).slice(0,10)}</p>
    {contact?.name&&<p>{locale==="ar"?"الاسم":"Name"}: {contact.name}</p>}
    <p>{locale==="ar"?"فئة الخطر":"Risk band"}: {band}</p>
    <p>{locale==="ar"?"نسخة الاستبيان":"Questionnaire version"}: {String(summary.version_label ?? instrument.version)} (placeholder)</p>
    <h2>{locale==="ar"?"ملخص الإجابات":"Answer summary"}</h2>
    <ul>{answerRows.map((item)=><li key={item.id}>{item.question}: {item.answer}</li>)}</ul>
    <p>{body}</p>
    <p>{locale==="ar"?"هذا الفحص لا يشخّص. فحص الدم هو الطريقة للتحقق.":"This screening is not a diagnosis. A blood test is the way to check."}</p>
    <PrintButton label={locale==="ar"?"طباعة الملخص":"Print summary"}/>
  </main>;
}
