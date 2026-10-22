import db from "../lib/db.ts";

const tables = db
  .prepare<[string, string], { name: string }>(
    "SELECT name FROM sqlite_master WHERE type = ? AND name NOT LIKE ? ORDER BY name",
  )
  .all("table", "sqlite_%");

function countRows(sql: string): number {
  const result = db.prepare<[], { count: number }>(sql).get();
  if (!result) {
    throw new Error(`Could not run row-count query: ${sql}`);
  }
  return result.count;
}

const rowCounts = {
  patients: countRows("SELECT COUNT(*) AS count FROM patients"),
  intakes: countRows("SELECT COUNT(*) AS count FROM intakes"),
  notes: countRows("SELECT COUNT(*) AS count FROM notes"),
  followups: countRows("SELECT COUNT(*) AS count FROM followups"),
};

console.log(JSON.stringify({ tables, rowCounts }, null, 2));
