import initSqlJs from 'sql.js';
import fs from 'fs';

async function fullCheck() {
  const SQL = await initSqlJs();
  const db = new SQL.Database(fs.readFileSync('refinements.db'));
  
  // Check all records for these inputs
  const result = db.exec(`
    SELECT id, input, final_logic, created_at 
    FROM refinements 
    WHERE input LIKE '%本质%' OR input LIKE '%爱%' OR input LIKE '%恨%'
    ORDER BY input, id
  `);
  
  if (result.length > 0) {
    const { columns, values } = result[0];
    console.log('All records with similar inputs:\n');
    for (const row of values) {
      const record: any = {};
      columns.forEach((col, i) => { record[col] = row[i]; });
      const shortLogic = record.final_logic?.substring(0, 60) || 'EMPTY';
      console.log(`ID:${record.id} | ${record.input} | ${record.created_at} | ${shortLogic}...`);
    }
  }
  
  // Check for any remaining duplicates
  console.log('\n--- Checking for duplicates ---');
  const dupResult = db.exec(`
    SELECT input, final_logic, COUNT(*) as cnt, GROUP_CONCAT(id) as ids
    FROM refinements
    GROUP BY input, final_logic
    HAVING cnt > 1
  `);
  
  if (dupResult.length === 0) {
    console.log('No duplicates found');
  } else {
    const { values } = dupResult[0];
    for (const row of values) {
      console.log(`Duplicate: "${row[0]}" | IDs: ${row[3]}`);
    }
  }
  
  db.close();
}

fullCheck().catch(console.error);
