import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import fs from 'fs';
import path from 'path';

export interface RefinementInput {
  input: string;
  finalLogic: string;
  explanation: string | null;
  stages: { name: string; title: string; content: string }[];
  cycles: number;
}

export interface RefinementRecord {
  id: number;
  input: string;
  finalLogic: string;
  explanation: string | null;
  stages: string;
  cycles: number;
  created_at: string;
}

function mapRowToRecord(columns: string[], row: any[]): RefinementRecord {
  const record: any = {};
  columns.forEach((col, i) => {
    record[col] = row[i];
  });
  // Map database column names to interface field names
  if (record.final_logic !== undefined) {
    record.finalLogic = record.final_logic;
    delete record.final_logic;
  }
  return record as RefinementRecord;
}

let dbPath: string = 'refinements.db';

export async function initDb(filePath: string = 'refinements.db'): Promise<SqlJsDatabase> {
  const SQL = await initSqlJs();
  dbPath = filePath;

  let db: SqlJsDatabase;
  if (filePath === ':memory:') {
    db = new SQL.Database();
  } else if (fs.existsSync(filePath)) {
    const fileBuffer = fs.readFileSync(filePath);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS refinements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      input TEXT NOT NULL,
      final_logic TEXT NOT NULL,
      explanation TEXT,
      stages TEXT NOT NULL,
      cycles INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  return db;
}

export function saveDb(db: SqlJsDatabase): void {
  if (dbPath === ':memory:') return;
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(dbPath, buffer);
}

export function saveRefinement(db: SqlJsDatabase, data: RefinementInput): number {
  db.run(
    `INSERT INTO refinements (input, final_logic, explanation, stages, cycles)
     VALUES (?, ?, ?, ?, ?)`,
    [data.input, data.finalLogic, data.explanation, JSON.stringify(data.stages), data.cycles]
  );

  const result = db.exec('SELECT last_insert_rowid()');
  const id = result[0].values[0][0] as number;
  saveDb(db);
  return id;
}

export function getRefinements(db: SqlJsDatabase): RefinementRecord[] {
  const results = db.exec(
    `SELECT id, input, final_logic, explanation, stages, cycles, created_at
     FROM refinements
     ORDER BY id DESC`
  );

  if (results.length === 0) return [];

  const { columns, values } = results[0];
  return values.map((row) => mapRowToRecord(columns, row));
}

export function getRefinementById(db: SqlJsDatabase, id: number): RefinementRecord | null {
  const results = db.exec(
    `SELECT id, input, final_logic, explanation, stages, cycles, created_at
     FROM refinements
     WHERE id = ?`,
    [id]
  );

  if (results.length === 0 || results[0].values.length === 0) return null;

  return mapRowToRecord(results[0].columns, results[0].values[0]);
}

export function deleteRefinement(db: SqlJsDatabase, id: number): boolean {
  db.run('DELETE FROM refinements WHERE id = ?', [id]);
  const changes = db.exec('SELECT changes()');
  const deleted = changes[0]?.values[0][0] as number > 0;
  if (deleted) saveDb(db);
  return deleted;
}
