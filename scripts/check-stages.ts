import initSqlJs from 'sql.js';
import fs from 'fs';

async function check() {
  const SQL = await initSqlJs();
  const db = new SQL.Database(fs.readFileSync('refinements.db'));
  
  // Find records with "黑暗" in input
  const result = db.exec("SELECT id, input, stages FROM refinements WHERE input LIKE '%黑暗%'");
  
  if (result.length > 0) {
    const { columns, values } = result[0];
    for (const row of values) {
      const id = row[0];
      const input = row[1];
      const stages = JSON.parse(row[2] as string);
      
      console.log(`\n=== ID: ${id}, Input: ${input} ===`);
      for (const stage of stages) {
        console.log(`\n--- ${stage.title} ---`);
        console.log(stage.content);
      }
    }
  } else {
    console.log('No records found with "黑暗"');
  }
  
  db.close();
}

check().catch(console.error);
