import { NextResponse } from "next/server";
import { z } from "zod";
import { hasSameOrigin, isRateLimited, readJsonBody } from "@/lib/requestGuards";
import { issueStaffSession, SCREENING_STAFF_COOKIE, verifyStaffPassword } from "@/lib/screening/staff-auth";
export const runtime="nodejs";
const schema=z.object({username:z.string().trim().min(1).max(120),password:z.string().min(1).max(512)}).strict();
export async function POST(request:Request):Promise<Response>{
  if(!hasSameOrigin(request))return NextResponse.json({error:"Request origin was not accepted."},{status:403});
  if(isRateLimited(request,"screening-staff-login"))return NextResponse.json({error:"Too many sign-in attempts. Wait and try again."},{status:429});
  const body=await readJsonBody(request,4096);if(!body.ok)return NextResponse.json({error:"Enter valid sign-in details."},{status:400});
  const parsed=schema.safeParse(body.value);if(!parsed.success)return NextResponse.json({error:"Enter a username and password."},{status:400});
  try{const user=verifyStaffPassword(parsed.data.username,parsed.data.password);if(!user)return NextResponse.json({error:"Sign in failed. Check your details."},{status:401});const session=issueStaffSession(user);const response=NextResponse.json({ok:true,role:user.role});response.cookies.set(SCREENING_STAFF_COOKIE,session.value,{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",path:"/",maxAge:session.maxAge});return response;}catch{return NextResponse.json({error:"Staff sign-in is not configured. Contact the application administrator."},{status:503});}
}
