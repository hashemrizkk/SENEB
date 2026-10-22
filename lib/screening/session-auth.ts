import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import consentBlocks from "@/data/screening/content-blocks.json";
import { createAnonymousScreeningSession, getAnonymousScreeningSession } from "../db.ts";
export const SCREENING_COOKIE="screening_session";
export function hashToken(token:string):string{return createHash("sha256").update(token).digest("hex");}
export function tokenFromRequest(request:Request):string|undefined {
  const item=request.headers.get("cookie")?.split(";").map((part)=>part.trim()).find((part)=>part.startsWith(`${SCREENING_COOKIE}=`));
  return item?decodeURIComponent(item.slice(SCREENING_COOKIE.length+1)):undefined;
}
export function getSessionFromRequest(request:Request):Record<string,unknown>|undefined {
  const token=tokenFromRequest(request);return token?getAnonymousScreeningSession(hashToken(token)):undefined;
}
export function setSessionCookie(response:NextResponse,token:string):void {
  response.cookies.set(SCREENING_COOKIE,token,{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",path:"/",maxAge:24*60*60});
}
export function startAnonymousSession(locale:"ar"|"en"): { response:NextResponse; sessionId:string } {
  const token=randomBytes(32).toString("base64url");
  const legalBlock=consentBlocks.find((block)=>block.key==="consent"&&block.locale===locale);
  const consentLabel=locale==="ar"?"أوافق على الفحص دون اسم":"I agree to anonymous screening";
  const legalText=`${consentLabel} ${legalBlock?.body??"Consent text unavailable; needs legal review."}`;
  const created=createAnonymousScreeningSession({tokenHash:hashToken(token),locale,consentVersion:`screening-consent-${legalBlock?.version??"placeholder"}`,consentHash:hashToken(legalText)});
  const response=NextResponse.json({ok:true,session_id:created.sessionId,has_active_scoring:Boolean(created.scoringVersionId),has_active_redflags:Boolean(created.redflagRulesetId)});
  setSessionCookie(response,token);return {response,sessionId:created.sessionId};
}
