import { NextResponse } from "next/server";
import { z } from "zod";
import { setScreeningLocale } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/screening/session-auth";
import { hasSameOrigin } from "@/lib/requestGuards";
const schema=z.object({locale:z.enum(["ar","en"])}).strict();
export async function POST(request:Request):Promise<Response>{if(!hasSameOrigin(request))return NextResponse.json({error:"Invalid origin."},{status:403});const session=getSessionFromRequest(request);if(!session)return NextResponse.json({ok:true});const parsed=schema.safeParse(await request.json().catch(()=>null));if(!parsed.success)return NextResponse.json({error:"Invalid language choice."},{status:400});setScreeningLocale(String(session.id),parsed.data.locale);return NextResponse.json({ok:true});}
