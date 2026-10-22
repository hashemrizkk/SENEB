import { NextResponse } from "next/server";
import { getScreeningResponses } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/screening/session-auth";
export async function GET(request:Request):Promise<Response>{const session=getSessionFromRequest(request);if(!session)return NextResponse.json({active:false});return NextResponse.json({active:true,status:session.status,last_step:session.last_step,locale:session.locale,answers:Object.fromEntries(getScreeningResponses(String(session.id)).map((answer)=>[answer.question_id,answer.option_id]))});}
