import { NextResponse } from "next/server";
import { z } from "zod";
import instrument from "@/data/screening/findrisc-0.2.json";
import { getContentBlock, saveScreeningLabResult, scoringVersionById } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/screening/session-auth";
import { hasSameOrigin } from "@/lib/requestGuards";
import { categorizeLabResult, type ResultConfig } from "@/lib/screening/result-category";

const schema=z.object({test_type:z.enum(["hba1c","fasting_glucose"]),value:z.number().finite(),unit:z.enum(["percent","mg_dl","mmol_l"]),taken_on:z.string().date(),confirm_unusual:z.boolean().default(false)}).strict();
type ScreeningConfig=typeof instrument;
export async function POST(request:Request):Promise<Response>{
  if(!hasSameOrigin(request))return NextResponse.json({error:"Request origin was not accepted."},{status:403});
  const session=getSessionFromRequest(request);
  if(!session||session.status!=="completed")return NextResponse.json({error:"Complete screening before entering a result."},{status:409});
  const parsed=schema.safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return NextResponse.json({error:"Enter a valid test, unit, value and date."},{status:400});
  const input=parsed.data;
  const versionId=typeof session.scoring_version_id==="string"?session.scoring_version_id:null;
  const version=versionId?scoringVersionById(versionId):undefined;
  if(!version)return NextResponse.json({error:"Result categories are unavailable. A clinician can review this result."},{status:503});
  let config:ScreeningConfig;
  try{config=JSON.parse(version.config_json) as ScreeningConfig;}catch{return NextResponse.json({error:"Result categories are unavailable. A clinician can review this result."},{status:503});}
  let categorized:ReturnType<typeof categorizeLabResult>;
  try{categorized=categorizeLabResult({testType:input.test_type,value:input.value,unit:input.unit},config.result_categories as ResultConfig);}catch(error){return NextResponse.json({error:error instanceof Error?"Choose a matching test and unit, and check the supported result range.":"Result value is invalid."},{status:400});}
  if(categorized.requiresConfirmation&&!input.confirm_unusual)return NextResponse.json({error:"Please check this unusual value and confirm it is entered as printed."},{status:422,headers:{"x-confirm-unusual":"true"}});
  try{
    const saved=saveScreeningLabResult({sessionId:String(session.id),testType:input.test_type,value:input.value,unit:input.unit,takenOn:input.taken_on,category:categorized.category,versionId:version.id,enteredBy:"self",verified:false});
    const locale=session.locale==="ar"?"ar":"en";const messageKey=categorized.category==="within_expected_range"?"result_within_range":"result_review";const message=getContentBlock(messageKey,locale)?.body??(locale==="ar"?"هذه النتيجة ليست تشخيصًا. سيراجعها مختص.":"This result is not a diagnosis. A clinician will review it.");
    return NextResponse.json({ok:true,review_created:Boolean(saved.reviewId),message});
  }catch{return NextResponse.json({error:"The result could not be saved. A blood test is the way to check; a clinician can review it."},{status:503});}
}
