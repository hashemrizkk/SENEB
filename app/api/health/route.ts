import { NextResponse } from "next/server";
import db from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  const result = db
    .prepare<[], { ok: number }>("SELECT 1 AS ok")
    .get();
  if (!result) throw new Error("Database health check failed.");
  return NextResponse.json({ status: "ok" });
}
