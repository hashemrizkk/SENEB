import db from "../lib/db.ts";

const tables = db
  .prepare<[string, string], { name: string }>(
    "SELECT name FROM sqlite_master WHERE type = ? AND name NOT LIKE ? ORDER BY name",
  )
  .all("table", "sqlite_%");

const patients = db
  .prepare<
    [],
    {
      id: number;
      name: string;
      age: number | null;
      diabetes_type: string | null;
      next_visit_date: string | null;
    }
  >(
    `SELECT id, name, age, diabetes_type, next_visit_date
     FROM patients
     ORDER BY id
     LIMIT 3`,
  )
  .all();

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

console.log(JSON.stringify({ tables, rowCounts, firstThreePatients: patients }, null, 2));
