import initSqlJs from 'sql.js';
import fs from 'fs';

async function cleanupDuplicates() {
  const SQL = await initSqlJs();
  const db = new SQL.Database(fs.readFileSync('refinements.db'));
  
  // Find duplicates (keep the one with higher id)
  const result = db.exec(`
    SELECT id, input, final_logic 
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
  
  // Group by input + final_logic
  const groups: Record<string, number[]> = {};
  for (const record of records) {
    const key = `${record.input}|||${record.final_logic}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(record.id);
  }
  
  // Delete duplicates (keep highest id)
  let deletedCount = 0;
  for (const [key, ids] of Object.entries(groups)) {
    if (ids.length > 1) {
      // Keep the last one (highest id), delete the rest
      const idsToDelete = ids.slice(0, -1);
      for (const id of idsToDelete) {
        db.run('DELETE FROM refinements WHERE id = ?', [id]);
        deletedCount++;
        console.log(`Deleted duplicate record ID: ${id}`);
      }
    }
  }
  
  // Save changes
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync('refinements.db', buffer);
  
  console.log(`\nCleaned up ${deletedCount} duplicate records`);
  
  // Verify no more duplicates
  const verifyResult = db.exec(`
    SELECT input, final_logic, COUNT(*) as cnt
    FROM refinements
    GROUP BY input, final_logic
    HAVING cnt > 1
  `);
  
  if (verifyResult.length === 0) {
    console.log('Verification: No duplicates remaining');
  } else {
    console.log('Verification: Still have duplicates!');
  }
  
  db.close();
}

cleanupDuplicates().catch(console.error);
