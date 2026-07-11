import { describe, it, expect, beforeEach } from 'vitest';
import { initDb, saveRefinement, getRefinements, getRefinementById, createRefinement, updateRefinement, updateRefinementInput, deleteRefinement } from './db';

describe('database', () => {
  let db: ReturnType<typeof initDb> extends Promise<infer T> ? T : never;

  beforeEach(async () => {
    db = await initDb(':memory:');
  });

  describe('saveRefinement', () => {
    it('should save a refinement record and return its id', () => {
      const id = saveRefinement(db, {
        input: '努力就会成功',
        finalLogic: '成功的概率是多变量函数',
        explanation: '解读内容',
        stages: [{ name: 'architect', title: '逻辑解构', content: '分析结果' }],
        cycles: 2,
      });

      expect(id).toBeGreaterThan(0);
    });

    it('should save with session_id when provided', () => {
      const id = saveRefinement(db, {
        input: '测试',
        finalLogic: '结论',
        explanation: null,
        stages: [],
        cycles: 1,
      }, 'session-a');

      const record = getRefinementById(db, id);
      expect(record!.session_id).toBe('session-a');
    });

    it('should save with null session_id when not provided', () => {
      const id = saveRefinement(db, {
        input: '测试',
        finalLogic: '结论',
        explanation: null,
        stages: [],
        cycles: 1,
      });

      const record = getRefinementById(db, id);
      expect(record!.session_id).toBeNull();
    });
  });

  describe('createRefinement', () => {
    it('should create an empty record and return its id', () => {
      const id = createRefinement(db, '测试输入', 2);
      expect(id).toBeGreaterThan(0);
    });

    it('should create record with only input and cycles', () => {
      const id = createRefinement(db, '测试输入', 2);
      const record = getRefinementById(db, id);
      expect(record).not.toBeNull();
      expect(record!.input).toBe('测试输入');
      expect(record!.cycles).toBe(2);
      expect(record!.finalLogic).toBe('');
      expect(record!.stages).toBe('[]');
    });

    it('should create record with session_id when provided', () => {
      const id = createRefinement(db, '测试', 1, 'session-a');
      const record = getRefinementById(db, id);
      expect(record!.session_id).toBe('session-a');
    });
  });

  describe('updateRefinement', () => {
    it('should update an existing record', () => {
      const id = createRefinement(db, '测试输入', 2);
      updateRefinement(db, id, {
        finalLogic: '最终结论',
        explanation: '解读内容',
        stages: [{ name: 'architect', title: '逻辑解构', content: '分析结果' }],
      });

      const record = getRefinementById(db, id);
      expect(record!.finalLogic).toBe('最终结论');
      expect(record!.explanation).toBe('解读内容');
      expect(JSON.parse(record!.stages)).toEqual([
        { name: 'architect', title: '逻辑解构', content: '分析结果' }
      ]);
    });

    it('should return false for non-existent id', () => {
      const result = updateRefinement(db, 999, { finalLogic: 'test' });
      expect(result).toBe(false);
    });

    it('should return false when sessionId does not match', () => {
      const id = createRefinement(db, '测试', 1, 'session-a');
      const result = updateRefinement(db, id, { finalLogic: '改了' }, 'session-b');
      expect(result).toBe(false);

      const record = getRefinementById(db, id);
      expect(record!.finalLogic).toBe('');
    });

    it('should return true when sessionId matches', () => {
      const id = createRefinement(db, '测试', 1, 'session-a');
      const result = updateRefinement(db, id, { finalLogic: '改了' }, 'session-a');
      expect(result).toBe(true);

      const record = getRefinementById(db, id);
      expect(record!.finalLogic).toBe('改了');
    });

    it('should return true when sessionId not provided (admin mode)', () => {
      const id = createRefinement(db, '测试', 1, 'session-a');
      const result = updateRefinement(db, id, { finalLogic: '管理员改的' });
      expect(result).toBe(true);

      const record = getRefinementById(db, id);
      expect(record!.finalLogic).toBe('管理员改的');
    });
  });

  describe('updateRefinementInput', () => {
    it('should update input when sessionId matches', () => {
      const id = createRefinement(db, '原标题', 1, 'session-a');
      const result = updateRefinementInput(db, id, '新标题', 'session-a');
      expect(result).toBe(true);

      const record = getRefinementById(db, id);
      expect(record!.input).toBe('新标题');
    });

    it('should return false when sessionId does not match', () => {
      const id = createRefinement(db, '原标题', 1, 'session-a');
      const result = updateRefinementInput(db, id, '新标题', 'session-b');
      expect(result).toBe(false);

      const record = getRefinementById(db, id);
      expect(record!.input).toBe('原标题');
    });
  });

  describe('getRefinements', () => {
    it('should return empty array when no records exist', () => {
      const result = getRefinements(db);
      expect(result).toEqual([]);
    });

    it('should return records ordered by created_at descending', () => {
      saveRefinement(db, {
        input: '第一个',
        finalLogic: '结论1',
        explanation: null,
        stages: [],
        cycles: 1,
      });
      saveRefinement(db, {
        input: '第二个',
        finalLogic: '结论2',
        explanation: null,
        stages: [],
        cycles: 1,
      });

      const result = getRefinements(db);
      expect(result).toHaveLength(2);
      expect(result[0].input).toBe('第二个');
      expect(result[1].input).toBe('第一个');
    });

    it('should return all records without limit', () => {
      for (let i = 0; i < 5; i++) {
        saveRefinement(db, {
          input: `观点${i}`,
          finalLogic: `结论${i}`,
          explanation: null,
          stages: [],
          cycles: 1,
        });
      }

      const result = getRefinements(db);
      expect(result).toHaveLength(5);
    });

    it('should filter by sessionId when provided', () => {
      createRefinement(db, 'A1', 1, 'session-a');
      createRefinement(db, 'A2', 1, 'session-a');
      createRefinement(db, 'B1', 1, 'session-b');

      const resultA = getRefinements(db, 'session-a');
      expect(resultA).toHaveLength(2);
      expect(resultA.every(r => r.session_id === 'session-a')).toBe(true);

      const resultB = getRefinements(db, 'session-b');
      expect(resultB).toHaveLength(1);
      expect(resultB[0].input).toBe('B1');
    });

    it('should return all records when sessionId not provided', () => {
      createRefinement(db, 'A1', 1, 'session-a');
      createRefinement(db, 'B1', 1, 'session-b');

      const result = getRefinements(db);
      expect(result).toHaveLength(2);
    });
  });

  describe('getRefinementById', () => {
    it('should return null for non-existent id', () => {
      const result = getRefinementById(db, 999);
      expect(result).toBeNull();
    });

    it('should return the correct record', () => {
      const id = saveRefinement(db, {
        input: '测试观点',
        finalLogic: '测试结论',
        explanation: '测试解读',
        stages: [{ name: 'redteam', title: '红方测试', content: '反例内容' }],
        cycles: 3,
      });

      const result = getRefinementById(db, id);
      expect(result).not.toBeNull();
      expect(result!.input).toBe('测试观点');
      expect(result!.finalLogic).toBe('测试结论');
      expect(result!.explanation).toBe('测试解读');
      expect(result!.cycles).toBe(3);
      expect(JSON.parse(result!.stages)).toEqual([
        { name: 'redteam', title: '红方测试', content: '反例内容' },
      ]);
    });

    it('should return record when sessionId matches', () => {
      const id = createRefinement(db, '测试', 1, 'session-a');
      const result = getRefinementById(db, id, 'session-a');
      expect(result).not.toBeNull();
      expect(result!.input).toBe('测试');
    });

    it('should return null when sessionId does not match', () => {
      const id = createRefinement(db, '测试', 1, 'session-a');
      const result = getRefinementById(db, id, 'session-b');
      expect(result).toBeNull();
    });

    it('should return record when sessionId not provided (admin mode)', () => {
      const id = createRefinement(db, '测试', 1, 'session-a');
      const result = getRefinementById(db, id);
      expect(result).not.toBeNull();
    });
  });

  describe('deleteRefinement', () => {
    it('should delete record when sessionId matches', () => {
      const id = createRefinement(db, '测试', 1, 'session-a');
      const result = deleteRefinement(db, id, 'session-a');
      expect(result).toBe(true);

      const record = getRefinementById(db, id);
      expect(record).toBeNull();
    });

    it('should return false when sessionId does not match', () => {
      const id = createRefinement(db, '测试', 1, 'session-a');
      const result = deleteRefinement(db, id, 'session-b');
      expect(result).toBe(false);

      const record = getRefinementById(db, id);
      expect(record).not.toBeNull();
    });

    it('should return true when sessionId not provided (admin mode)', () => {
      const id = createRefinement(db, '测试', 1, 'session-a');
      const result = deleteRefinement(db, id);
      expect(result).toBe(true);

      const record = getRefinementById(db, id);
      expect(record).toBeNull();
    });

    it('should return false for non-existent id', () => {
      const result = deleteRefinement(db, 999);
      expect(result).toBe(false);
    });
  });

  describe('session_id column migration', () => {
    it('new database should have session_id column', async () => {
      const freshDb = await initDb(':memory:');
      const result = freshDb.exec('PRAGMA table_info(refinements)');
      const columns = result[0].values.map(row => row[1]);
      expect(columns).toContain('session_id');
    });

    it('should migrate old data with legacy session_id', async () => {
      // 创建一个内存数据库，模拟旧表结构（无 session_id 列）
      const initSqlJs = (await import('sql.js')).default;
      const SQL = await initSqlJs();
      const oldDb = new SQL.Database();

      // 创建旧表结构（没有 session_id 列）
      oldDb.run(`
        CREATE TABLE refinements (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          input TEXT NOT NULL,
          final_logic TEXT NOT NULL,
          explanation TEXT,
          stages TEXT NOT NULL,
          cycles INTEGER NOT NULL DEFAULT 1,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
      oldDb.run(`INSERT INTO refinements (input, final_logic, explanation, stages, cycles) VALUES ('旧数据', '旧结论', NULL, '[]', 1)`);

      // 将旧数据库导出，再用 initDb 加载
      const buffer = Buffer.from(oldDb.export());
      // 写入临时文件
      const fs = await import('fs');
      const path = await import('path');
      const tmpFile = path.join(require('os').tmpdir(), `test-migrate-${Date.now()}.db`);
      fs.writeFileSync(tmpFile, buffer);

      const migratedDb = await initDb(tmpFile);

      // 验证 session_id 列已添加
      const tableInfo = migratedDb.exec('PRAGMA table_info(refinements)');
      const columns = tableInfo[0].values.map(row => row[1]);
      expect(columns).toContain('session_id');

      // 验证旧数据的 session_id 为 'legacy'
      const records = getRefinements(migratedDb);
      expect(records).toHaveLength(1);
      expect(records[0].session_id).toBe('legacy');

      // 清理临时文件
      fs.unlinkSync(tmpFile);
    });
  });
});
