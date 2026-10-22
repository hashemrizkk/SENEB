import { NextResponse } from "next/server";
import { hasSameOrigin } from "@/lib/requestGuards";
import { SCREENING_STAFF_COOKIE } from "@/lib/screening/staff-auth";
export async function POST(request:Request):Promise<Response>{if(!hasSameOrigin(request))return NextResponse.json({error:"Request origin was not accepted."},{status:403});const response=NextResponse.redirect(new URL("/staff",request.url),303);response.cookies.set(SCREENING_STAFF_COOKIE,"",{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",path:"/",maxAge:0});return response;}
