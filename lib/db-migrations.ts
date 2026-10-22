import type Database from "better-sqlite3";

/** Expand the input method CHECK while preserving intake IDs and child references. */
export function migrateInputMethodCheck(database: Database.Database): void {
  const definition = database
    .prepare<[], { sql: string | null }>(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'intakes'",
    )
    .get()?.sql;
  if (!definition || /'mixed'/.test(definition)) return;

  database.pragma("foreign_keys = OFF");
  try {
    database.transaction(() => {
      database.exec(`
        CREATE TABLE intakes_input_method_migration (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          patient_id INTEGER NOT NULL REFERENCES patients(id),
          input_method TEXT CHECK (input_method IN ('tap', 'typed', 'voice', 'mixed', 'assisted')),
          raw_text TEXT,
          structured_json TEXT,
          red_flags_json TEXT,
          meta_json TEXT,
          status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'triaged', 'seen')),
          priority TEXT CHECK (priority IN ('urgent', 'important', 'normal')),
          version INTEGER NOT NULL DEFAULT 1,
          edited_by TEXT,
          edited_at TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
        INSERT INTO intakes_input_method_migration (
          id, patient_id, input_method, raw_text, structured_json,
          red_flags_json, meta_json, status, priority, version,
          edited_by, edited_at, created_at
        ) SELECT
          id, patient_id, input_method, raw_text, structured_json,
          red_flags_json, meta_json, status, priority, version,
          edited_by, edited_at, created_at
        FROM intakes;
        DROP TABLE intakes;
        ALTER TABLE intakes_input_method_migration RENAME TO intakes;
        CREATE INDEX IF NOT EXISTS idx_intakes_review_queue
          ON intakes(status, created_at, id);
      `);
    })();
  } finally {
    database.pragma("foreign_keys = ON");
  }
  const violations = database.pragma("foreign_key_check") as unknown[];
  if (violations.length) {
    throw new Error("Input method migration left foreign key violations.");
  }
}
