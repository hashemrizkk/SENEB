import { createHmac, scryptSync, timingSafeEqual } from "node:crypto";
import { screeningStaffUser, screeningStaffUserById } from "../db.ts";

export const SCREENING_STAFF_COOKIE = "screening_staff";
export type ScreeningStaff = { id:string;username:string;role:"navigator"|"clinician"|"admin" };
function secret():string { const value=process.env.SESSION_SECRET;if(!value||value.length<32)throw new Error("SESSION_SECRET must contain at least 32 characters.");return value; }
function signature(payload:string):string { return createHmac("sha256",secret()).update(payload).digest("hex"); }
export function verifyStaffPassword(username:string,password:string):ScreeningStaff|null {
  const user=screeningStaffUser(username);if(!user)return null;
  const actual=scryptSync(password,user.password_salt,64);const expected=Buffer.from(user.password_hash,"hex");
  if(actual.length!==expected.length||!timingSafeEqual(actual,expected))return null;
  return {id:user.id,username:user.username,role:user.role as ScreeningStaff["role"]};
}
export function issueStaffSession(user:ScreeningStaff):{value:string;maxAge:number} {
  const maxAge=8*60*60;const payload=`${user.id}.${Math.floor(Date.now()/1000)+maxAge}`;return {value:`${payload}.${signature(payload)}`,maxAge};
}
export function verifyStaffSession(value:string|undefined):ScreeningStaff|null {
  if(!value)return null;
  try {
    const pieces=value.split(".");if(pieces.length!==3)return null;const [id,expiry,provided]=pieces;const payload=`${id}.${expiry}`;const expected=Buffer.from(signature(payload),"hex");const actual=Buffer.from(provided,"hex");if(actual.length!==expected.length||!timingSafeEqual(actual,expected)||!/^\d+$/.test(expiry)||Number(expiry)<=Date.now()/1000)return null;
    const user=screeningStaffUserById(id);return user?{id:user.id,username:user.username,role:user.role as ScreeningStaff["role"]}:null;
  } catch { return null; }
}
export function staffFromRequest(request:Request):ScreeningStaff|null {
  const cookie=request.headers.get("cookie")?.split(";").map((part)=>part.trim()).find((part)=>part.startsWith(`${SCREENING_STAFF_COOKIE}=`));
  return verifyStaffSession(cookie?decodeURIComponent(cookie.slice(SCREENING_STAFF_COOKIE.length+1)):undefined);
}
export function staffHasRole(user:ScreeningStaff|null,roles:ScreeningStaff["role"][]):user is ScreeningStaff {
  return Boolean(user&&(user.role==="admin"||roles.includes(user.role)));
}
