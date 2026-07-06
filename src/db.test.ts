import { describe, it, expect, beforeEach } from 'vitest';
import { initDb, saveRefinement, getRefinements, getRefinementById, createRefinement, updateRefinement } from './db';

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
  });
});
