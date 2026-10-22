import { NextResponse } from "next/server";
import { z } from "zod";
import { createScreeningBooking, recordScreeningEvent } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/screening/session-auth";
import { hasSameOrigin } from "@/lib/requestGuards";

const schema=z.object({location_id:z.string().min(1).max(80)}).strict();
export async function POST(request:Request):Promise<Response>{
  if(!hasSameOrigin(request))return NextResponse.json({error:"Request origin was not accepted."},{status:403});
  const session=getSessionFromRequest(request);if(!session||session.status!=="completed")return NextResponse.json({error:"Complete screening before recording a test location."},{status:409});
  const form=await request.formData().catch(()=>null);const parsed=schema.safeParse({location_id:form?.get("location_id")});if(!parsed.success)return NextResponse.json({error:"Invalid location."},{status:400});
  try{createScreeningBooking(String(session.id),parsed.data.location_id);recordScreeningEvent({sessionId:String(session.id),event:"booking_clicked",step:"locations"});return NextResponse.redirect(new URL("/screening/locations?booking=recorded",request.url),303);}catch{return NextResponse.json({error:"The location could not be saved. Please use the displayed contact details."},{status:400});}
}
