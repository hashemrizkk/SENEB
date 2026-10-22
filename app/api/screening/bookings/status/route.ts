import { NextResponse } from "next/server";
import { z } from "zod";
import { updateLatestScreeningBooking } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/screening/session-auth";
import { hasSameOrigin } from "@/lib/requestGuards";
const schema=z.object({status:z.enum(["self_reported_booked","self_reported_completed"])}).strict();
export async function POST(request:Request):Promise<Response>{if(!hasSameOrigin(request))return NextResponse.json({error:"Invalid origin."},{status:403});const session=getSessionFromRequest(request);if(!session||session.status!=="completed")return NextResponse.json({error:"Complete screening first."},{status:409});const parsed=schema.safeParse(await request.json().catch(()=>null));if(!parsed.success)return NextResponse.json({error:"Choose a valid status."},{status:400});try{updateLatestScreeningBooking(String(session.id),parsed.data.status);return NextResponse.json({ok:true});}catch{return NextResponse.json({error:"No test-location record is available yet."},{status:404});}}
