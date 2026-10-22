import { rmSync } from "node:fs";
import path from "node:path";

const databasePath = path.join(process.cwd(), "hackathon.db");

rmSync(databasePath, { force: true });
rmSync(`${databasePath}-shm`, { force: true });
rmSync(`${databasePath}-wal`, { force: true });

process.env.DEMO_SEED = "1";
await import("../lib/db.ts");

console.log("Database reset and seeded with fake patients.");
