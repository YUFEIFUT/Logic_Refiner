import type { HistoryRecord } from '../components/HistoryList';

export interface TimeGroup {
  label: string;
  records: HistoryRecord[];
}

function toLocalDay(date: Date): Date {
  const d = new Date(date);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function localDaysAgo(base: Date, n: number): Date {
  const d = toLocalDay(base);
  d.setDate(d.getDate() - n);
  return d;
}

function formatMonth(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export function groupRecordsByTime(
  records: HistoryRecord[],
  today: Date
): TimeGroup[] {
  if (records.length === 0) return [];

  const todayLocal = toLocalDay(today);
  const tomorrowLocal = new Date(todayLocal);
  tomorrowLocal.setDate(tomorrowLocal.getDate() + 1);
  const weekLocal = localDaysAgo(today, 6);
  const monthLocal = localDaysAgo(today, 29);

  const parsed = records.map((r) => ({
    record: r,
    localDay: toLocalDay(new Date(r.created_at)).getTime(),
    fullTime: new Date(r.created_at).getTime(),
  }));

  const todayRecords = parsed
    .filter((p) => p.localDay >= todayLocal.getTime() && p.localDay < tomorrowLocal.getTime())
    .sort((a, b) => b.fullTime - a.fullTime)
    .map((p) => p.record);

  const weekRecords = parsed
    .filter((p) => p.localDay >= weekLocal.getTime() && p.localDay < todayLocal.getTime())
    .sort((a, b) => b.fullTime - a.fullTime)
    .map((p) => p.record);

  const monthRecords = parsed
    .filter((p) => p.localDay >= monthLocal.getTime() && p.localDay < weekLocal.getTime())
    .sort((a, b) => b.fullTime - a.fullTime)
    .map((p) => p.record);

  const remaining = parsed.filter((p) => p.localDay < monthLocal.getTime());
  const monthBuckets = new Map<string, HistoryRecord[]>();
  for (const p of remaining) {
    const d = new Date(p.localDay);
    const key = formatMonth(d);
    if (!monthBuckets.has(key)) monthBuckets.set(key, []);
    monthBuckets.get(key)!.push(p.record);
  }
  const monthGroups: TimeGroup[] = Array.from(monthBuckets.entries())
    .map(([label, recs]) => ({
      label,
      records: recs.sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      ),
    }))
    .sort((a, b) => b.label.localeCompare(a.label));

  const groups: TimeGroup[] = [];
  if (todayRecords.length > 0) groups.push({ label: '今天', records: todayRecords });
  if (weekRecords.length > 0) groups.push({ label: '7 天内', records: weekRecords });
  if (monthRecords.length > 0) groups.push({ label: '30 天内', records: monthRecords });
  groups.push(...monthGroups);

  return groups;
}
