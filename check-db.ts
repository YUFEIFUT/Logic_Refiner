import initSqlJs from 'sql.js';
import fs from 'fs';

async function check() {
  const SQL = await initSqlJs();
  const db = new SQL.Database(fs.readFileSync('refinements.db'));
  const result = db.exec('SELECT id, input FROM refinements');
  if (result.length > 0) {
    console.log('Database records:');
    result[0].values.forEach(row => {
      console.log(`  ID: ${row[0]}, Input: ${row[1]}`);
    });
  } else {
    console.log('No records found');
  }
  db.close();
}

check();
