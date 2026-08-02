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
  session_id: string | null;
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

  // 迁移：检查是否已有 session_id 列，没有则添加
  const tableInfo = db.exec('PRAGMA table_info(refinements)');
  if (tableInfo.length > 0) {
    const columns = tableInfo[0].values.map(row => row[1] as string);
    if (!columns.includes('session_id')) {
      db.run('ALTER TABLE refinements ADD COLUMN session_id TEXT');
      db.run("UPDATE refinements SET session_id = 'legacy' WHERE session_id IS NULL");
    }
  }

  return db;
}

export function saveDb(db: SqlJsDatabase): void {
  if (dbPath === ':memory:') return;
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(dbPath, buffer);
}

export function saveRefinement(db: SqlJsDatabase, data: RefinementInput, sessionId?: string): number {
  const now = new Date();
  const localIso = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes(), now.getSeconds()).toISOString();
  db.run(
    `INSERT INTO refinements (input, final_logic, explanation, stages, cycles, session_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [data.input, data.finalLogic, data.explanation, JSON.stringify(data.stages), data.cycles, sessionId ?? null, localIso]
  );

  const result = db.exec('SELECT last_insert_rowid()');
  const id = result[0].values[0][0] as number;
  saveDb(db);
  return id;
}

export function createRefinement(db: SqlJsDatabase, input: string, cycles: number, sessionId?: string): number {
  const now = new Date();
  const localIso = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes(), now.getSeconds()).toISOString();
  db.run(
    `INSERT INTO refinements (input, final_logic, explanation, stages, cycles, session_id, created_at)
     VALUES (?, '', NULL, '[]', ?, ?, ?)`,
    [input, cycles, sessionId ?? null, localIso]
  );

  const result = db.exec('SELECT last_insert_rowid()');
  const id = result[0].values[0][0] as number;
  saveDb(db);
  return id;
}

export function updateRefinement(
  db: SqlJsDatabase,
  id: number,
  data: { finalLogic?: string; explanation?: string | null; stages?: { name: string; title: string; content: string }[]; cycles?: number },
  sessionId?: string
): boolean {
  const record = getRefinementById(db, id, sessionId);
  if (!record) return false;

  const finalLogic = data.finalLogic ?? record.finalLogic;
  const explanation = data.explanation !== undefined ? data.explanation : record.explanation;
  const stages = data.stages ? JSON.stringify(data.stages) : record.stages;
  const cycles = data.cycles ?? record.cycles;

  if (sessionId !== undefined) {
    db.run(
      `UPDATE refinements SET final_logic = ?, explanation = ?, stages = ?, cycles = ? WHERE id = ? AND session_id = ?`,
      [finalLogic, explanation, stages, cycles, id, sessionId]
    );
  } else {
    db.run(
      `UPDATE refinements SET final_logic = ?, explanation = ?, stages = ?, cycles = ? WHERE id = ?`,
      [finalLogic, explanation, stages, cycles, id]
    );
  }
  saveDb(db);
  return true;
}

export function updateRefinementInput(db: SqlJsDatabase, id: number, input: string, sessionId?: string): boolean {
  const record = getRefinementById(db, id, sessionId);
  if (!record) return false;

  if (sessionId !== undefined) {
    db.run(`UPDATE refinements SET input = ? WHERE id = ? AND session_id = ?`, [input, id, sessionId]);
  } else {
    db.run(`UPDATE refinements SET input = ? WHERE id = ?`, [input, id]);
  }
  saveDb(db);
  return true;
}

export function getRefinements(db: SqlJsDatabase, sessionId?: string): RefinementRecord[] {
  let sql = `SELECT id, input, final_logic, explanation, stages, cycles, session_id, created_at FROM refinements`;
  const params: any[] = [];

  if (sessionId !== undefined) {
    sql += ` WHERE session_id = ?`;
    params.push(sessionId);
  }

  sql += ` ORDER BY id DESC`;

  const results = db.exec(sql, params);

  if (results.length === 0) return [];

  const { columns, values } = results[0];
  return values.map((row) => mapRowToRecord(columns, row));
}

export function getRefinementById(db: SqlJsDatabase, id: number, sessionId?: string): RefinementRecord | null {
  let sql = `SELECT id, input, final_logic, explanation, stages, cycles, session_id, created_at FROM refinements WHERE id = ?`;
  const params: any[] = [id];

  if (sessionId !== undefined) {
    sql += ` AND session_id = ?`;
    params.push(sessionId);
  }

  const results = db.exec(sql, params);

  if (results.length === 0 || results[0].values.length === 0) return null;

  return mapRowToRecord(results[0].columns, results[0].values[0]);
}

export function deleteRefinement(db: SqlJsDatabase, id: number, sessionId?: string): boolean {
  if (sessionId !== undefined) {
    db.run('DELETE FROM refinements WHERE id = ? AND session_id = ?', [id, sessionId]);
  } else {
    db.run('DELETE FROM refinements WHERE id = ?', [id]);
  }
  const changes = db.exec('SELECT changes()');
  const deleted = changes[0]?.values[0][0] as number > 0;
  if (deleted) saveDb(db);
  return deleted;
}
