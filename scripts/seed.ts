import Database from 'sql.js';
import fs from 'fs';

async function seed() {
  const SQL = await Database();
  const fileBuffer = fs.readFileSync('refinements.db');
  const db = new SQL.Database(fileBuffer);

  const mockData = Array.from({ length: 20 }, (_, i) => ({
    input: `mock${i + 1} - 这是一个测试逻辑命题 ${i + 1}`,
    final_logic: `mock${i + 1} 的精炼结论：这是一个经过多轮迭代的测试结论`,
    explanation: `mock${i + 1} 的深度解读：这个结论经过了严格的逻辑验证和多角度分析。`,
    stages: JSON.stringify([
      { name: 'architect', title: '逻辑解构 (Architect)', content: `mock${i + 1} 的初始架构分析` },
      { name: 'redteam', title: '红方压力测试 #1 (Red Team)', content: `mock${i + 1} 的反例分析` },
      { name: 'synthesizer', title: '合成与剥离 #1 (Synthesizer)', content: `mock${i + 1} 的综合提炼` }
    ]),
    cycles: 1,
  }));

  const stmt = db.prepare(
    `INSERT INTO refinements (input, final_logic, explanation, stages, cycles) VALUES (?, ?, ?, ?, ?)`
  );

  for (const data of mockData) {
    stmt.run([data.input, data.final_logic, data.explanation, data.stages, data.cycles]);
  }
  stmt.free();

  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync('refinements.db', buffer);

  console.log(`Inserted ${mockData.length} mock records`);
  db.close();
}

seed().catch(console.error);
