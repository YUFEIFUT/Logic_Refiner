import initSqlJs from 'sql.js';
import fs from 'fs';

async function checkAll() {
  const SQL = await initSqlJs();
  const db = new SQL.Database(fs.readFileSync('refinements.db'));
  
  const result = db.exec(`
    SELECT id, input, final_logic, created_at 
    FROM refinements 
    ORDER BY id
  `);
  
  if (result.length === 0) {
    console.log('Database is empty');
    db.close();
    return;
  }
  
  const { columns, values } = result[0];
  console.log(`Total records: ${values.length}\n`);
  
  // Group by input to find potential duplicates
  const groups: Record<string, any[]> = {};
  for (const row of values) {
    const record: any = {};
    columns.forEach((col, i) => { record[col] = row[i]; });
    if (!groups[record.input]) groups[record.input] = [];
    groups[record.input].push(record);
  }
  
  // Show inputs with multiple records
  console.log('Inputs with multiple records:\n');
  for (const [input, records] of Object.entries(groups)) {
    if (records.length > 1) {
      console.log(`"${input}" (${records.length} records):`);
      for (const r of records) {
        const shortLogic = r.final_logic?.substring(0, 50) || 'EMPTY';
        console.log(`  ID:${r.id} | ${r.created_at} | ${shortLogic}...`);
      }
      console.log('');
    }
  }
  
  db.close();
}

checkAll().catch(console.error);
