import initSqlJs from 'sql.js';
import fs from 'fs';

async function checkTiming() {
  const SQL = await initSqlJs();
  const db = new SQL.Database(fs.readFileSync('refinements.db'));
  
  // Check records with duplicate-like inputs
  const result = db.exec(`
    SELECT id, input, final_logic, created_at 
    FROM refinements 
    WHERE input IN ('爱的本质是什么', '恨的本质是什么', '做爱的本质是什么')
    ORDER BY id
  `);
  
  if (result.length > 0) {
    const { columns, values } = result[0];
    for (const row of values) {
      const record: any = {};
      columns.forEach((col, i) => { record[col] = row[i]; });
      console.log(`ID: ${record.id} | Input: ${record.input} | Created: ${record.created_at}`);
    }
  }
  
  db.close();
}

checkTiming().catch(console.error);
