import assert from "node:assert/strict";
import nextEnv from "@next/env";
import instrument from "../data/screening/findrisc-0.2.json" with { type: "json" };
import symptoms from "../data/screening/symptom-modifier.json" with { type: "json" };
import redflags from "../data/screening/redflags.json" with { type: "json" };

nextEnv.loadEnvConfig(process.cwd());
const base=process.env.TEST_BASE_URL;
if(!base){console.log("SKIP screening HTTP journey; set TEST_BASE_URL to an isolated local test server.");process.exit(0);}
const origin=new URL(base).origin;
const clinicianName=process.env.SCREENING_CLINICIAN_USERNAME;
const clinicianPassword=process.env.SCREENING_CLINICIAN_PASSWORD;
const doctorName=process.env.DOCTOR_NAME;
const doctorPassword=process.env.DOCTOR_PASSWORD;
if(!clinicianName||!clinicianPassword||!doctorName||!doctorPassword)throw new Error("The isolated HTTP test server needs seeded screening clinician and doctor demo credentials.");
function cookie(response:Response,name:string):string{const entry=response.headers.getSetCookie?.().find((value)=>value.startsWith(`${name}=`))??response.headers.get("set-cookie")?.split(/,(?=[^;]+=[^;]+)/).find((value)=>value.trim().startsWith(`${name}=`));if(!entry)throw new Error(`Expected ${name} cookie.`);return entry.trim().split(";")[0];}
async function request(path:string,options:RequestInit={},cookies:string[]=[]):Promise<Response>{const headers=new Headers(options.headers);headers.set("origin",origin);if(cookies.length)headers.set("cookie",cookies.join("; "));return fetch(new URL(path,base),{...options,headers});}
async function post(path:string,body:unknown,cookies:string[]=[]):Promise<{response:Response;data:Record<string,unknown>} >{const response=await request(path,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)},cookies);const data=await response.json().catch(()=>({})) as Record<string,unknown>;if(!response.ok)throw new Error(`Screening journey failed at ${path} (${response.status}).`);return {response,data};}
async function start():Promise<{cookie:string;sessionId:string}>{const {response,data}=await post("/api/screening/start",{consent:true,locale:"en"});assert.equal(data.ok,true);return {cookie:cookie(response,"screening_session"),sessionId:String(data.session_id)};}
const participant=await start();const patientCookie=[participant.cookie];
const rulesResponse=await request("/api/screening/rules",{},patientCookie);const rules=await rulesResponse.json() as {items:{id:string}[]};assert.equal(rules.items.length,redflags.items.length);
const clear=await post("/api/screening/redflags",{rule_ids:[],source:"gate"},patientCookie);assert.equal(clear.data.escalated,false);
for(const symptom of symptoms.items){const saved=await post("/api/screening/answers",{question_id:symptom.id,option_id:"no"},patientCookie);assert.equal(saved.data.ok,true);}
for(const question of instrument.items){let answer:Record<string,unknown>;if(question.id==="bmi")answer={height_cm:170,weight_kg:70};else if(question.id==="waist")answer={waist_cm:90};else answer={option_id:[...question.options].sort((a,b)=>a.points-b.points)[0].id};const saved=await post("/api/screening/answers",{question_id:question.id,...answer},patientCookie);assert.equal(saved.data.ok,true);}
const completed=await post("/api/screening/result",{},patientCookie);assert.equal(completed.data.ok,true);assert.ok(["low","elevated","high"].includes(String(completed.data.band)));const resultResponse=await request("/api/screening/result",{},patientCookie);assert.equal(resultResponse.status,200);
const locationPage=await request("/screening/locations",{},patientCookie);assert.equal(locationPage.status,200);
const bookingResponse=await request("/api/screening/bookings",{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:"location_id=demo-lab-cairo-01"},patientCookie);assert.ok(bookingResponse.ok);
await post("/api/screening/bookings/status",{status:"self_reported_completed"},patientCookie);
const lab=await post("/api/screening/lab-results",{test_type:"hba1c",value:7.1,unit:"percent",taken_on:new Date().toISOString().slice(0,10),confirm_unusual:false},patientCookie);assert.equal(lab.data.review_created,true);
await post("/api/screening/contact",{consent:true,name:"Demo Participant",phone:"01012345678",email:null,preferred_channel:"phone"},patientCookie);
const staffLogin=await post("/api/staff/login",{username:clinicianName,password:clinicianPassword});const staffCookie=cookie(staffLogin.response,"screening_staff");const queueResponse=await request("/api/staff/reviews",{},[staffCookie]);const queue=await queueResponse.json() as {reviews:Array<{review_id:string}>};const review=queue.reviews.find((item)=>item.review_id);assert.ok(review,"abnormal self-entered result should reach the clinician queue");
const care=await post("/api/staff/reviews",{review_id:review!.review_id,outcome:"entered_care",note:"Demo clinician reviewed and entered follow-up care.",age:42,diabetes_type:"type_2"},[staffCookie]);assert.equal(care.data.patient_created,true);
const doctorLogin=await post("/api/doctor/login",{name:doctorName,password:doctorPassword});const doctorCookie=cookie(doctorLogin.response,"doctor_session");const doctorPage=await request("/doctor",{},[doctorCookie]);assert.equal(doctorPage.status,200);assert.ok((await doctorPage.text()).includes("Demo Participant"),"new screening patient should appear in /doctor");
const safety=await start();const safetyCookie=[safety.cookie];const escalation=await post("/api/screening/redflags",{rule_ids:[redflags.items[0].id],source:"gate"},safetyCookie);assert.equal(escalation.data.escalated,true);const progress=await request("/api/screening/progress",{},safetyCookie);assert.equal((await progress.json() as {status:string}).status,"safety_escalated");await post("/api/screening/restart",{},safetyCookie);
console.log("PASS screening HTTP happy path, clinician entry into /doctor, and red-flag restart path. All participant values were synthetic.");
