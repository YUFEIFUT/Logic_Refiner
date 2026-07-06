import initSqlJs from 'sql.js';
import fs from 'fs';

async function checkRecent() {
  const SQL = await initSqlJs();
  const db = new SQL.Database(fs.readFileSync('refinements.db'));
  
  const result = db.exec(`
    SELECT id, input, final_logic, cycles, created_at 
    FROM refinements 
    WHERE input = '失败是成功之母'
    ORDER BY id
  `);
  
  if (result.length > 0) {
    const { columns, values } = result[0];
    console.log('Records for "失败是成功之母":\n');
    for (const row of values) {
      const record: any = {};
      columns.forEach((col, i) => { record[col] = row[i]; });
      const status = record.final_logic ? '已完成' : '进行中';
      const shortLogic = record.final_logic?.substring(0, 80) || 'EMPTY';
      console.log(`ID: ${record.id} | Status: ${status} | Cycles: ${record.cycles} | Created: ${record.created_at}`);
      console.log(`Final Logic: ${shortLogic}...`);
      console.log('');
    }
  } else {
    console.log('No records found');
  }
  
  db.close();
}

checkRecent().catch(console.error);
