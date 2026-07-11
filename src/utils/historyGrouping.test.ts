import { describe, it, expect } from 'vitest';
import { groupRecordsByTime, type TimeGroup } from './historyGrouping';
import type { HistoryRecord } from '../components/HistoryList';

// 创建本地时间的 Date 对象（与时区无关）
function localDate(year: number, month: number, day: number, hour = 12, min = 0, sec = 0): Date {
  return new Date(year, month - 1, day, hour, min, sec);
}

function makeRecord(id: number, daysAgo: number): HistoryRecord {
  const date = new Date('2026-07-10T12:00:00.000Z');
  date.setDate(date.getDate() - daysAgo);
  return {
    id,
    input: `record-${id}`,
    finalLogic: '',
    explanation: null,
    stages: '[]',
    cycles: 1,
    session_id: null,
    created_at: date.toISOString(),
  };
}

function makeRecordOfMonth(id: number, year: number, month: number): HistoryRecord {
  return {
    id,
    input: `record-${id}`,
    finalLogic: '',
    explanation: null,
    stages: '[]',
    cycles: 1,
    session_id: null,
    created_at: `${year}-${String(month).padStart(2, '0')}-15T12:00:00.000Z`,
  };
}

const TODAY = new Date('2026-07-10T00:00:00.000Z');

describe('groupRecordsByTime', () => {
  it('should group records into all time buckets when data spans multiple periods', () => {
    const records = [
      makeRecord(1, 0),   // 今天
      makeRecord(2, 3),   // 7 天内
      makeRecord(3, 15),  // 30 天内
      makeRecord(4, 35),  // 2026-06
      makeRecord(5, 65),  // 2026-05
    ];

    const groups = groupRecordsByTime(records, TODAY);

    expect(groups).toHaveLength(5);
    expect(groups[0].label).toBe('今天');
    expect(groups[1].label).toBe('7 天内');
    expect(groups[2].label).toBe('30 天内');
    expect(groups[3].label).toBe('2026-06');
    expect(groups[4].label).toBe('2026-05');
  });

  it('should return single "今天" group when all records are from today', () => {
    const records = [
      makeRecord(1, 0),
      makeRecord(2, 0),
    ];

    const groups = groupRecordsByTime(records, TODAY);

    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe('今天');
    expect(groups[0].records).toHaveLength(2);
  });

  it('should return single month group when all records are old', () => {
    const records = [
      makeRecordOfMonth(1, 2026, 4),
      makeRecordOfMonth(2, 2026, 4),
    ];

    const groups = groupRecordsByTime(records, TODAY);

    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe('2026-04');
    expect(groups[0].records).toHaveLength(2);
  });

  it('should return multiple month groups for records from different months', () => {
    const records = [
      makeRecordOfMonth(1, 2026, 3),
      makeRecordOfMonth(2, 2026, 1),
    ];

    const groups = groupRecordsByTime(records, TODAY);

    expect(groups).toHaveLength(2);
    expect(groups[0].label).toBe('2026-03');
    expect(groups[1].label).toBe('2026-01');
  });

  it('should return empty array for empty records', () => {
    const groups = groupRecordsByTime([], TODAY);

    expect(groups).toHaveLength(0);
  });

  it('should place record at today 00:00 in "今天"', () => {
    const records = [
      { ...makeRecord(1, 0), created_at: '2026-07-10T00:00:00.000Z' },
    ];

    const groups = groupRecordsByTime(records, TODAY);

    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe('今天');
  });

  it('should place record at yesterday 23:59 in "7 天内"', () => {
    const records = [
      { ...makeRecord(1, 1), created_at: localDate(2026, 7, 9, 23, 59, 59).toISOString() },
    ];

    const groups = groupRecordsByTime(records, TODAY);

    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe('7 天内');
  });

  it('should place record at 6 days ago 00:00 in "7 天内"', () => {
    const records = [
      { ...makeRecord(1, 6), created_at: '2026-07-04T00:00:00.000Z' },
    ];

    const groups = groupRecordsByTime(records, TODAY);

    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe('7 天内');
  });

  it('should place record at 7 days ago 23:59 in "30 天内"', () => {
    const records = [
      { ...makeRecord(1, 7), created_at: localDate(2026, 7, 3, 23, 59, 59).toISOString() },
    ];

    const groups = groupRecordsByTime(records, TODAY);

    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe('30 天内');
  });

  it('should place record at 29 days ago 00:00 in "30 天内"', () => {
    const records = [
      { ...makeRecord(1, 29), created_at: '2026-06-11T00:00:00.000Z' },
    ];

    const groups = groupRecordsByTime(records, TODAY);

    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe('30 天内');
  });

  it('should place record at 30 days ago in its month group', () => {
    const records = [
      { ...makeRecord(1, 30), created_at: '2026-06-10T00:00:00.000Z' },
    ];

    const groups = groupRecordsByTime(records, TODAY);

    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe('2026-06');
  });

  it('should sort records within each group by created_at descending', () => {
    const records = [
      { ...makeRecord(1, 0), created_at: '2026-07-10T08:00:00.000Z' },
      { ...makeRecord(2, 0), created_at: '2026-07-10T12:00:00.000Z' },
      { ...makeRecord(3, 0), created_at: '2026-07-10T06:00:00.000Z' },
    ];

    const groups = groupRecordsByTime(records, TODAY);

    expect(groups[0].records[0].id).toBe(2);
    expect(groups[0].records[1].id).toBe(1);
    expect(groups[0].records[2].id).toBe(3);
  });

  it('should sort groups in correct order: 今天, 7天内, 30天内, months', () => {
    const records = [
      makeRecord(1, 75),  // 2026-04
      makeRecord(2, 15),  // 30 天内
      makeRecord(3, 3),   // 7 天内
      makeRecord(4, 0),   // 今天
    ];

    const groups = groupRecordsByTime(records, TODAY);

    expect(groups[0].label).toBe('今天');
    expect(groups[1].label).toBe('7 天内');
    expect(groups[2].label).toBe('30 天内');
    expect(groups[3].label).toBe('2026-04');
  });

  it('should not include empty groups', () => {
    const records = [
      makeRecord(1, 0),
      makeRecordOfMonth(2, 2026, 3),
    ];

    const groups = groupRecordsByTime(records, TODAY);

    expect(groups).toHaveLength(2);
    expect(groups.map(g => g.label)).toEqual(['今天', '2026-03']);
  });
});
