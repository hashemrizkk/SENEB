import { NextResponse } from "next/server";
import { z } from "zod";
import { hasSameOrigin } from "@/lib/requestGuards";
import { recordScreeningEvent } from "@/lib/db";
import { startAnonymousSession } from "@/lib/screening/session-auth";
const schema=z.object({consent:z.literal(true),locale:z.enum(["ar","en"])}).strict();
export async function POST(request:Request):Promise<Response>{
  if(!hasSameOrigin(request))return NextResponse.json({error:"Request origin was not accepted."},{status:403});
  const parsed=schema.safeParse(await request.json().catch(()=>null));if(!parsed.success)return NextResponse.json({error:"Consent is required before starting."},{status:400});
  try{const started=startAnonymousSession(parsed.data.locale);recordScreeningEvent({sessionId:started.sessionId,event:"screening_started",step:"consent"});recordScreeningEvent({sessionId:started.sessionId,event:"consent_given",step:"consent"});return started.response;}catch{return NextResponse.json({error:"The screening could not start. A blood test is the way to check; if you feel very unwell, seek urgent care."},{status:503});}
}
