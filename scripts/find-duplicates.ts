import initSqlJs from 'sql.js';
import fs from 'fs';

async function findDuplicates() {
  const SQL = await initSqlJs();
  const db = new SQL.Database(fs.readFileSync('refinements.db'));
  
  // Find records with same input and same final_logic
  const result = db.exec(`
    SELECT id, input, final_logic, cycles, created_at 
    FROM refinements 
    ORDER BY input, id
  `);
  
  if (result.length === 0) {
    console.log('No records found');
    db.close();
    return;
  }
  
  const { columns, values } = result[0];
  const records = values.map(row => {
    const record: any = {};
    columns.forEach((col, i) => { record[col] = row[i]; });
    return record;
  });
  
  // Group by input + final_logic to find duplicates
  const groups: Record<string, number[]> = {};
  for (const record of records) {
    const key = `${record.input}|||${record.final_logic}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(record.id);
  }
  
  // Find groups with more than one record
  const duplicates = Object.entries(groups).filter(([_, ids]) => ids.length > 1);
  
  if (duplicates.length === 0) {
    console.log('No duplicates found');
  } else {
    console.log(`Found ${duplicates.length} groups of duplicates:\n`);
    for (const [key, ids] of duplicates) {
      const [input, finalLogic] = key.split('|||');
      console.log(`Input: "${input}"`);
      console.log(`IDs: ${ids.join(', ')}`);
      console.log(`Final Logic: "${finalLogic.substring(0, 80)}..."`);
      console.log('---');
    }
  }
  
  db.close();
}

findDuplicates().catch(console.error);
