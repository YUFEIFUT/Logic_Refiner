/**
 * 插入时间分组测试用的 mock 数据（本地时间版本）
 *
 * 分组函数和日期显示都用本地时间，所以 seed 也用本地时间插入。
 */

import Database from 'sql.js';
import fs from 'fs';

function localIso(year: number, month: number, day: number, hour = 12, min = 0, sec = 0): string {
  return new Date(year, month - 1, day, hour, min, sec).toISOString();
}

function buildRecords() {
  const records: { input: string; final_logic: string; explanation: string; stages: string; cycles: number; created_at: string }[] = [];
  let id = 0;

  const base = (title: string) => {
    id++;
    return {
      input: `time_group_mock_${id}_${title}`,
      final_logic: `精炼结论_${id}`,
      explanation: `解读_${id}`,
      stages: JSON.stringify([]),
      cycles: 2,
      created_at: '',
    };
  };

  // 今天 7/11，3 条，不同时分秒
  for (const [h, m, s] of [[8, 30, 0], [14, 15, 30], [21, 45, 15]]) {
    const r = base(`today_${h}${m}`);
    r.created_at = localIso(2026, 7, 11, h, m, s);
    records.push(r);
  }

  // 7 天内 7/5 ~ 7/10，6 条
  for (let day = 10; day >= 5; day--) {
    const r = base(`week_day${day}`);
    r.created_at = localIso(2026, 7, day, 12, 0, 0);
    records.push(r);
  }

  // 30 天内 6/12 ~ 7/4，14 条
  for (let day = 4; day >= 1; day--) {
    const r = base(`month30_july${day}`);
    r.created_at = localIso(2026, 7, day, 12, 0, 0);
    records.push(r);
  }
  for (let day = 30; day >= 12; day--) {
    const r = base(`month30_june${day}`);
    r.created_at = localIso(2026, 6, day, 12, 0, 0);
    records.push(r);
  }

  // 2026-06（30天外）6/7 ~ 6/11，5 条
  for (let day = 11; day >= 7; day--) {
    const r = base(`june_old_${day}`);
    r.created_at = localIso(2026, 6, day, 12, 0, 0);
    records.push(r);
  }

  // 2026-05: 5 条
  for (let i = 0; i < 5; i++) {
    const r = base(`may_${i + 1}`);
    r.created_at = localIso(2026, 5, 15 + i, 12, 0, 0);
    records.push(r);
  }

  // 2026-04: 5 条
  for (let i = 0; i < 5; i++) {
    const r = base(`apr_${i + 1}`);
    r.created_at = localIso(2026, 4, 15 + i, 12, 0, 0);
    records.push(r);
  }

  // 2026-03: 5 条
  for (let i = 0; i < 5; i++) {
    const r = base(`mar_${i + 1}`);
    r.created_at = localIso(2026, 3, 15 + i, 12, 0, 0);
    records.push(r);
  }

  return records;
}

async function seed() {
  const SQL = await Database();
  const fileBuffer = fs.readFileSync('refinements.db');
  const db = new SQL.Database(fileBuffer);

  const records = buildRecords();

  const stmt = db.prepare(
    `INSERT INTO refinements (input, final_logic, explanation, stages, cycles, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  for (const r of records) {
    stmt.run([r.input, r.final_logic, r.explanation, r.stages, r.cycles, r.created_at]);
  }
  stmt.free();

  fs.writeFileSync('refinements.db', Buffer.from(db.export()));

  console.log(`Inserted ${records.length} mock records (local time):`);
  console.log('  今天 (7/11): 3');
  console.log('  7 天内 (7/5~7/10): 6');
  console.log('  30 天内 (6/12~7/4): 14');
  console.log('  2026-06 (6/7~6/11): 5');
  console.log('  2026-05: 5');
  console.log('  2026-04: 5');
  console.log('  2026-03: 5');

  console.log('\nVerification:');
  records.slice(0, 3).forEach(r => {
    const d = new Date(r.created_at);
    console.log(`  ${r.input} | local=${d.toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' })}`);
  });

  db.close();
}

seed().catch(console.error);
