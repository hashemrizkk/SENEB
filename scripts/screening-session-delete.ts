import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());
const db=await import("../lib/db.ts");
const sessionId=process.argv[2];const username=process.env.SCREENING_DELETE_ACTOR??process.env.SCREENING_ADMIN_USERNAME;
if(!sessionId)throw new Error("Usage: npm run session:delete -- <session-id>; set SCREENING_DELETE_ACTOR to an admin username.");
if(!username)throw new Error("Set SCREENING_DELETE_ACTOR to the screening admin username.");
const actor=db.screeningStaffUser(username);if(!actor||actor.role!=="admin")throw new Error("The deletion actor must be a seeded admin user.");
db.deleteScreeningSessionData(sessionId,"staff",actor.id);console.log("Screening session data deleted; the privacy audit entry was retained.");
