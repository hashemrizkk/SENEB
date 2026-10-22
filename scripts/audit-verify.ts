import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());
const db=await import("../lib/db.ts");
const result=db.verifyScreeningAudit();
console.log(JSON.stringify(result));
if(!result.ok)process.exitCode=1;
