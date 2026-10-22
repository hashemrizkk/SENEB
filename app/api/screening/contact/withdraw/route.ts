import { NextResponse } from "next/server";
import { z } from "zod";
import { withdrawScreeningContactConsent } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/screening/session-auth";
import { hasSameOrigin } from "@/lib/requestGuards";
const empty=z.object({}).strict();
export async function POST(request:Request):Promise<Response>{if(!hasSameOrigin(request))return NextResponse.json({error:"Invalid origin."},{status:403});const session=getSessionFromRequest(request);if(!session)return NextResponse.json({error:"Screening session unavailable."},{status:401});if(!empty.safeParse(await request.json().catch(()=>null)).success)return NextResponse.json({error:"Invalid request."},{status:400});try{withdrawScreeningContactConsent(String(session.id));return NextResponse.json({ok:true});}catch{return NextResponse.json({error:"No active contact consent was found."},{status:404});}}
