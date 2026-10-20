import { NextResponse } from "next/server";
import db from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  const tables = db
    .prepare<[string, string], { name: string }>(
      "SELECT name FROM sqlite_master WHERE type = ? AND name NOT LIKE ? ORDER BY name",
    )
    .all("table", "sqlite_%")
    .map(({ name }) => name);

  const result = db
    .prepare<[], { count: number }>("SELECT COUNT(*) AS count FROM patients")
    .get();

  if (!result) {
    throw new Error("Could not read the patient count from the database.");
  }

  return NextResponse.json({
    tables,
    patientCount: result.count,
  });
}
