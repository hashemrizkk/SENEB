import { NextResponse } from "next/server";
import { deleteScreeningSessionData } from "@/lib/db";
import { SCREENING_COOKIE, getSessionFromRequest } from "@/lib/screening/session-auth";
import { hasSameOrigin } from "@/lib/requestGuards";
export async function POST(request:Request):Promise<Response>{if(!hasSameOrigin(request))return NextResponse.json({error:"Request origin was not accepted."},{status:403});const session=getSessionFromRequest(request);if(!session)return NextResponse.json({ok:true});deleteScreeningSessionData(String(session.id),"anonymous",String(session.id));const response=NextResponse.json({ok:true});response.cookies.set(SCREENING_COOKIE,"",{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",path:"/",maxAge:0});return response;}
