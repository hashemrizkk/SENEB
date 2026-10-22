import { randomUUID, randomBytes, scryptSync, createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());
const db = await import("../lib/db.ts");
const readJson = <T>(name:string):T => JSON.parse(readFileSync(path.join(process.cwd(),"data","screening",name),"utf8")) as T;
type Instrument={key:string;version:string;citation:string;source_url:string;retrieved_at:string;license_note:string;validation_note:string};
const instrument=readJson<Instrument>("findrisc-0.2.json");
const configJson=readFileSync(path.join(process.cwd(),"data","screening","findrisc-0.2.json"),"utf8");
const scoringId=db.insertScoringVersion({id:randomUUID(),instrumentKey:instrument.key,versionLabel:instrument.version,configJson,configHash:createHash("sha256").update(configJson).digest("hex"),sourceCitation:instrument.citation,sourceUrl:instrument.source_url,retrievedAt:instrument.retrieved_at,licenseNote:instrument.license_note,validationNote:instrument.validation_note,createdBy:"screening-seed"});
const redflags=readJson<{version:string;items:unknown[];emergency_number:string|null}>("redflags.json");
const rulesetId=db.insertRedflagRuleset({id:randomUUID(),versionLabel:redflags.version,rulesJson:JSON.stringify(redflags),emergencyNumber:redflags.emergency_number,createdBy:"screening-seed"});
const blocks=readJson<{key:string;locale:"ar"|"en";version:string;status:"placeholder"|"approved";body:string}[]>("content-blocks.json");
for(const block of blocks)db.insertContentBlock({id:randomUUID(),...block});
const locations=[
  {id:"demo-lab-cairo-01",name:"Demo Lab — Downtown Cairo",type:"lab" as const,city:"Cairo",area:"Downtown",address:"Demo address, Downtown Cairo",phone:"0000000000",hoursText:"Demo hours: Sunday–Thursday, 9:00–17:00",testsOffered:["hba1c","fasting_glucose"],bookingUrl:null,active:true,isDemoData:true},
  {id:"demo-clinic-giza-01",name:"Demo Primary Care Clinic — Giza",type:"clinic" as const,city:"Giza",area:"Dokki",address:"Demo address, Dokki",phone:"0000000000",hoursText:"Demo hours: Saturday–Wednesday, 10:00–16:00",testsOffered:["hba1c","fasting_glucose"],bookingUrl:null,active:true,isDemoData:true},
  {id:"demo-pharmacy-cairo-01",name:"Demo Pharmacy — Nasr City",type:"pharmacy" as const,city:"Cairo",area:"Nasr City",address:"Demo address, Nasr City",phone:"0000000000",hoursText:"Demo hours: Daily, 12:00–22:00",testsOffered:["fasting_glucose"],bookingUrl:null,active:true,isDemoData:true},
];
for(const location of locations)db.insertTestLocation(location);
for(const role of ["navigator","clinician","admin"] as const){const prefix=`SCREENING_${role.toUpperCase()}`;const username=process.env[`${prefix}_USERNAME`];const password=process.env[`${prefix}_PASSWORD`];if(!username||!password)continue;const salt=randomBytes(16).toString("hex");db.insertScreeningStaffUser({id:randomUUID(),username,role,passwordHash:scryptSync(password,salt,64).toString("hex"),salt});}
const demoCount=db.seedFakeScreeningFunnel(scoringId,rulesetId);
console.log(JSON.stringify({scoring_version_id:scoringId,scoring_status:"draft",redflag_ruleset_id:rulesetId,redflag_status:"draft",unapproved_clinical_items:["FINDRISC instrument and bands","symptom modifier","red-flag rules and emergency number","blood-test result categories","Arabic/English patient wording","legal consent text"],content_blocks:blocks.length,demo_locations:locations.length,demo_funnel_sessions:demoCount,funnel_metrics:db.screeningFunnelMetrics(),staff_users_configured:["navigator","clinician","admin"].filter((role)=>Boolean(process.env[`SCREENING_${role.toUpperCase()}_USERNAME`]&&process.env[`SCREENING_${role.toUpperCase()}_PASSWORD`])).length}));
