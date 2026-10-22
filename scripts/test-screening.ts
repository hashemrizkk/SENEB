import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import config from "../data/screening/findrisc-0.2.json" with { type: "json" };
import content from "../data/screening/content-blocks.json" with { type: "json" };
import redflagConfig from "../data/screening/redflags.json" with { type: "json" };
import { deriveOptionId, minimumAndMaximumPossible, scoreAssessment } from "../lib/screening/score.ts";
import { matchRedFlags } from "../lib/screening/redflags.ts";
import { recommend } from "../lib/screening/recommend.ts";
import { categorizeLabResult } from "../lib/screening/result-category.ts";
const isolatedDbPath=path.join(tmpdir(),`screening-test-${randomUUID()}.db`);
process.env.HACKATHON_DB_PATH=isolatedDbPath;
const {migrateScreening,appendScreeningAudit,verifyScreeningAudit,insertScoringVersion,approveScoringVersion,activateScoringVersion,insertRedflagRuleset,createAnonymousScreeningSession,saveScreeningContact,screeningContact,withdrawScreeningContactConsent,saveScreeningLabResult,updateScreeningReview,deleteScreeningSessionData,escalateScreening,default:appDb}=await import("../lib/db.ts");
const {migrateDoctorReview}=await import("../lib/doctor-review.ts");

const instrument=config as Parameters<typeof scoreAssessment>[1];
assert.deepEqual(minimumAndMaximumPossible(instrument),{min:0,max:26});
const base:Record<string,string>={age:"under_45",sex:"male",bmi:"under_25",waist:"under_threshold",activity:"yes",fruit_veg:"daily",antihypertensive:"no",high_glucose:"no",family_history:"none"};
const vectors:[string,Partial<Record<string,string>>,number,string][]=[
 ["all minimum",{},0,"low"],["age 45",{age:"45_54"},2,"low"],["age 55",{age:"55_64"},3,"low"],["age 65",{age:"65_plus"},4,"low"],
 ["BMI middle",{bmi:"25_30"},1,"low"],["BMI high",{bmi:"30_plus"},3,"low"],["waist middle",{waist:"middle_range"},3,"low"],["waist high",{waist:"above_threshold"},4,"low"],
 ["inactive",{activity:"no"},2,"low"],["not daily produce",{fruit_veg:"not_daily"},1,"low"],["blood pressure medicine",{antihypertensive:"yes"},2,"low"],["prior high glucose",{high_glucose:"yes"},5,"low"],
 ["second degree family",{family_history:"second_degree"},3,"low"],["first degree family",{family_history:"first_degree"},5,"low"],
];
// The baseline is all zero-point answers, so each single-item vector's expected total is exactly the published point value for that selected option.
for(const [name,override,total,band] of vectors){const result=scoreAssessment({...base,...override},instrument,false);assert.equal(result.total,total,name);assert.equal(result.band,band,name);}
const fromTotal=(target:number)=>{const answers={...base};const items=config.items.filter((item)=>item.id!=="sex");const search=(index:number,left:number):boolean=>{if(index===items.length)return left===0;const item=items[index];for(const option of item.options){if(option.points<=left){answers[item.id]=option.id;if(search(index+1,left-option.points))return true;}}return false;};assert.equal(search(0,target),true,`no source answer vector totals ${target}`);return scoreAssessment(answers,instrument,false);};
for(const [points,band] of [[6,"low"],[7,"elevated"],[11,"elevated"],[12,"elevated"],[14,"elevated"],[15,"high"],[20,"high"],[21,"high"],[26,"high"]] as const){assert.equal(fromTotal(points).band,band,`boundary ${points}`);}
for(const points of [0,6,7,11,12,14,15,20,21,26])assert.equal(fromTotal(points).total,points);
assert.throws(()=>scoreAssessment({},instrument,false));assert.throws(()=>scoreAssessment({...base,age:"invalid"},instrument,false));
assert.equal(deriveOptionId(config.items.find((item)=>item.id==="bmi") as never,{height_cm:170,weight_kg:70}),"under_25");
assert.equal(deriveOptionId(config.items.find((item)=>item.id==="bmi") as never,{height_cm:170,weight_kg:80}),"25_30");
assert.equal(deriveOptionId(config.items.find((item)=>item.id==="waist") as never,{waist_cm:95},"male"),"middle_range");
assert.equal(deriveOptionId(config.items.find((item)=>item.id==="waist") as never,{waist_cm:82},"female"),"middle_range");
assert.equal(recommend("low",true).kind,"test_recommended_soon");assert.equal(recommend("low",false).kind,"routine_info");
for(const [testType,value,unit,category] of [["hba1c",5.69,"percent","within_expected_range"],["hba1c",5.7,"percent","prediabetes_range"],["hba1c",6.4,"percent","prediabetes_range"],["hba1c",6.5,"percent","diabetes_range"],["fasting_glucose",99.9,"mg_dl","within_expected_range"],["fasting_glucose",100,"mg_dl","prediabetes_range"],["fasting_glucose",125,"mg_dl","prediabetes_range"],["fasting_glucose",126,"mg_dl","diabetes_range"],["fasting_glucose",5.59,"mmol_l","within_expected_range"],["fasting_glucose",5.6,"mmol_l","prediabetes_range"],["fasting_glucose",6.9,"mmol_l","prediabetes_range"],["fasting_glucose",7,"mmol_l","diabetes_range"]] as const){assert.equal(categorizeLabResult({testType,value,unit},config.result_categories).category,category,`${testType}/${unit} ${value}`);}
assert.throws(()=>categorizeLabResult({testType:"hba1c",value:6.5,unit:"mg_dl"},config.result_categories));assert.throws(()=>categorizeLabResult({testType:"hba1c",value:1.9,unit:"percent"},config.result_categories));assert.equal(categorizeLabResult({testType:"hba1c",value:3.5,unit:"percent"},config.result_categories).requiresConfirmation,true);
for(const item of content){assert(!/%|percent|probability|probability|you have diabetes|you are diabetic|your diagnosis|must go|confirm your visit now/i.test(item.body),`wording lint: ${item.key}/${item.locale}`);}
for(const file of ["app/api/screening/answers/route.ts","app/api/screening/redflags/route.ts","app/api/screening/result/route.ts","app/api/screening/lab-results/route.ts","lib/screening/score.ts","lib/screening/recommend.ts","lib/screening/redflags.ts"]){const source=readFileSync(new URL(`../${file}`,import.meta.url),"utf8");assert(!/lib\/llm|from ["']ai["']|generateText|streamText/i.test(source),`LLM provider import in ${file}`);}
const memory=new Database(":memory:");memory.exec(readFileSync(path.join(process.cwd(),"lib","schema.sql"),"utf8"));migrateDoctorReview(memory);migrateScreening(memory);
assert.equal((memory.prepare("SELECT COUNT(*) AS count FROM anonymous_sessions").get() as {count:number}).count,0,"nothing stored before consent");
const versionId=randomUUID();insertScoringVersion({id:versionId,instrumentKey:config.key,versionLabel:config.version,configJson:JSON.stringify(config),configHash:"test-hash",sourceCitation:config.citation,sourceUrl:config.source_url,retrievedAt:config.retrieved_at,licenseNote:config.license_note,validationNote:config.validation_note,createdBy:"test"},memory);
approveScoringVersion(versionId,"clinician-test",memory);activateScoringVersion(versionId,"admin-test",memory);assert.throws(()=>memory.prepare("UPDATE scoring_versions SET config_json='{}' WHERE id=?").run(versionId));
const nextVersionId=randomUUID();insertScoringVersion({id:nextVersionId,instrumentKey:config.key,versionLabel:"0.3-test",configJson:JSON.stringify(config),configHash:"test-hash-2",sourceCitation:config.citation,sourceUrl:config.source_url,retrievedAt:config.retrieved_at,licenseNote:config.license_note,validationNote:config.validation_note,createdBy:"test"},memory);approveScoringVersion(nextVersionId,"clinician-test",memory);activateScoringVersion(nextVersionId,"admin-test",memory);activateScoringVersion(versionId,"admin-test",memory);assert.equal((memory.prepare("SELECT COUNT(*) AS count FROM scoring_versions WHERE status='active'").get() as {count:number}).count,1,"only one scoring version can be active");
const rulesId=insertRedflagRuleset({id:randomUUID(),versionLabel:"test-rules",rulesJson:JSON.stringify(redflagConfig),emergencyNumber:null,createdBy:"test"},memory);
const session=createAnonymousScreeningSession({tokenHash:"anonymous-test-token-hash",locale:"en",consentVersion:"test",consentHash:"test-hash"},memory);
for(const rule of redflagConfig.items){assert.deepEqual(matchRedFlags([rule.id],redflagConfig.items),[rule.id]);}
assert.throws(()=>matchRedFlags(["unknown"],redflagConfig.items));
const safetySession=createAnonymousScreeningSession({tokenHash:"anonymous-test-safety-token",locale:"en",consentVersion:"test",consentHash:"test-hash"},memory);escalateScreening(safetySession.sessionId,rulesId,[redflagConfig.items[0].id],"gate",memory);assert.equal((memory.prepare("SELECT status FROM anonymous_sessions WHERE id=?").get(safetySession.sessionId) as {status:string}).status,"safety_escalated");assert.equal((memory.prepare("SELECT COUNT(*) AS count FROM safety_escalations WHERE session_id=?").get(safetySession.sessionId) as {count:number}).count,1);assert.equal((memory.prepare("SELECT COUNT(*) AS count FROM audit_log WHERE action='safety_escalated' AND entity_id=?").get(safetySession.sessionId) as {count:number}).count,1);deleteScreeningSessionData(safetySession.sessionId,"staff","admin-test",memory);
saveScreeningContact({sessionId:session.sessionId,name:"Demo Person",phone:"01012345678",email:null,preferredChannel:"phone",legalText:"test contact consent",legalVersion:"test"},memory);
const lab=saveScreeningLabResult({sessionId:session.sessionId,testType:"hba1c",value:7.1,unit:"percent",takenOn:"2026-10-22",category:"diabetes_range",versionId,enteredBy:"self",verified:false},memory);
assert.ok(lab.reviewId,"self-entered results must reach clinician review");
const patientId=updateScreeningReview({reviewId:lab.reviewId!,actorId:"clinician-test",outcome:"entered_care",note:"Clinician reviewed and confirmed follow-up entry.",enterCare:{age:45,diabetesType:"type_2"}},memory);
assert.ok(patientId);assert.equal((memory.prepare("SELECT COUNT(*) AS count FROM patients WHERE screening_session_id=?").get(session.sessionId) as {count:number}).count,1);
assert.equal((memory.prepare("SELECT COUNT(*) AS count FROM intakes i JOIN patients p ON p.id=i.patient_id WHERE p.screening_session_id=?").get(session.sessionId) as {count:number}).count,1,"person should enter the doctor intake queue");
withdrawScreeningContactConsent(session.sessionId,memory);assert.equal(screeningContact(session.sessionId,memory),undefined,"withdrawal removes contact data and disables consent");assert.equal((memory.prepare("SELECT COUNT(*) AS count FROM consent_records WHERE session_id=? AND purpose IN ('contact','results_sharing') AND withdrawn_at IS NOT NULL").get(session.sessionId) as {count:number}).count,2);
deleteScreeningSessionData(session.sessionId,"staff","admin-test",memory);assert.equal((memory.prepare("SELECT COUNT(*) AS count FROM anonymous_sessions WHERE id=?").get(session.sessionId) as {count:number}).count,0);assert.ok((memory.prepare("SELECT COUNT(*) AS count FROM audit_log WHERE action='screening_session_deleted' AND entity_id=?").get(session.sessionId) as {count:number}).count===1,"deletion audit remains");
const noConsent=createAnonymousScreeningSession({tokenHash:"anonymous-test-token-hash-2",locale:"en",consentVersion:"test",consentHash:"test-hash"},memory);const unconsentedLab=saveScreeningLabResult({sessionId:noConsent.sessionId,testType:"hba1c",value:7.1,unit:"percent",takenOn:"2026-10-22",category:"diabetes_range",versionId,enteredBy:"self",verified:false},memory);assert.throws(()=>updateScreeningReview({reviewId:unconsentedLab.reviewId!,actorId:"clinician-test",outcome:"entered_care",note:"Attempted care entry",enterCare:{age:45,diabetesType:"type_2"}},memory),/Contact consent/);assert.equal((memory.prepare("SELECT COUNT(*) AS count FROM patients WHERE screening_session_id=?").get(noConsent.sessionId) as {count:number}).count,0);deleteScreeningSessionData(noConsent.sessionId,"staff","admin-test",memory);
appendScreeningAudit({actorType:"system",actorId:null,action:"test",entityType:"test",entityId:null},memory);assert.equal(verifyScreeningAudit(memory).ok,true);assert.throws(()=>memory.prepare("UPDATE audit_log SET action='changed'").run());assert.throws(()=>memory.prepare("DELETE FROM audit_log").run());memory.exec("DROP TRIGGER audit_log_no_update");memory.prepare("UPDATE audit_log SET action='tampered' WHERE id=(SELECT MAX(id) FROM audit_log)").run();assert.equal(verifyScreeningAudit(memory).ok,false);memory.close();appDb.close();for(const suffix of ["","-wal","-shm"]){try{unlinkSync(`${isolatedDbPath}${suffix}`);}catch{}}
console.log(`PASS screening score, derived inputs, red-flag escalation, recommendations, wording, no-LLM, result boundaries, consent, care entry, deletion, and audit checks (${vectors.length} hand-calculated vectors)`);
