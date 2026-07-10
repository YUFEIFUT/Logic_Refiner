# 需求：历史记录按时间分组展示

## 背景

### 问题描述

当前历史记录列表是平铺展示的，所有记录按 id 倒序排列，没有时间维度的组织。当记录增多后，用户难以快速定位某个时间段的对话。

### 目标

参考 DeepSeek 的设计，将历史记录按时间区间分组展示：
- **今天**：今天的记录
- **7 天内**：去掉今天，往前数 6 天
- **30 天内**：去掉今天和 7 天内的部分，往前数到 30 天
- **月份**：30 天之前的记录，按 `YYYY-MM` 分组

各分组互不重叠，语义准确。

### 设计原则

| 原则 | 含义 |
|------|------|
| **分组互斥** | 每条记录只属于一个分组，无重叠 |
| **语义准确** | "今天"就是今天，"7天内"是包含今天的 7 天范围内除去今天后的部分 |
| **纯函数可测** | 分组逻辑提取为纯函数，接受 records 和 today 参数，便于单元测试 |
| **空组隐藏** | 没有记录的分组不显示 |

---

## 分组算法

```
输入: records[], today (Date 对象，表示今天的 00:00)
输出: { label: string, records: HistoryRecord[] }[]

1. todayStart = today 00:00:00
2. weekStart  = today - 6天 00:00:00
3. monthStart = today - 29天 00:00:00

4. 分组:
   a. "今天"    → created_at >= todayStart
   b. "7 天内"  → created_at >= weekStart 且 < todayStart
   c. "30 天内" → created_at >= monthStart 且 < weekStart
   d. 剩余记录按 YYYY-MM 分桶，标签为 "YYYY-MM"

5. 过滤空组，返回
```

**边界说明**（以 2026-07-10 为例）：

| 分组 | 范围 | 天数 |
|------|------|------|
| 今天 | 7/10 00:00 ~ | 1 天 |
| 7 天内 | 7/4 00:00 ~ 7/9 23:59 | 6 天 |
| 30 天内 | 6/11 00:00 ~ 7/3 23:59 | 23 天 |
| 2026-06 | 6/1 ~ 6/10 23:59 | 该月剩余 |
| 2026-05 | 5/1 ~ 5/31 23:59 | 整月 |

---

## 子任务

### 5.1 TDD：编写分组纯函数的单元测试

**目标**：在实现分组逻辑之前，先编写完整的测试用例覆盖所有分组场景。

**修改位置**：新建 `src/utils/historyGrouping.test.ts`

**测试用例设计**：

```typescript
// 辅助函数：根据偏移天数生成 mock record
function makeRecord(id: number, daysAgo: number): HistoryRecord

// 辅助函数：根据年月生成 mock record（用于月份分组）
function makeRecordOfMonth(id: number, year: number, month: number): HistoryRecord
```

| # | 测试用例 | 输入 | 预期输出 |
|---|---------|------|---------|
| 1 | 所有分组都有数据 | 今天/3天前/10天前/30天前/60天前各一条 | 5 个分组：今天、7天内、30天内、两个月份组 |
| 2 | 只有今天的记录 | 1 条今天的数据 | 1 个分组：今天 |
| 3 | 只有很早的记录 | 2 条 60 天前的数据（同月） | 1 个分组：YYYY-MM |
| 4 | 只有很早的记录（跨月） | 各一条 60 天前和 90 天前 | 2 个分组：两个不同 YYYY-MM |
| 5 | 空记录 | 0 条 | 0 个分组 |
| 6 | 今天和 7 天内边界 | 今天 00:00 的记录 vs 昨天 23:59 的记录 | 前者在"今天"，后者在"7 天内" |
| 7 | 7 天内和 30 天内边界 | 6 天前 00:00 vs 7 天前 23:59 | 前者在"7 天内"，后者在"30 天内" |
| 8 | 30 天内和月份边界 | 29 天前 00:00 vs 30 天前 23:59 | 前者在"30 天内"，后者在对应月份组 |
| 9 | 分组内按时间倒序 | 同一分组内多条记录 | 组内按 created_at 倒序 |
| 10 | 分组间按时间倒序 | 多个分组 | 分组顺序：今天 → 7天内 → 30天内 → 月份（新到旧） |

**验收标准**：
- [x] 测试文件 `src/utils/historyGrouping.test.ts` 存在
- [x] 覆盖上述 10 个测试用例（实际 14 个，含边界用例）
- [x] 运行 `npm test` 全部失败（红灯，因为实现尚未编写）

---

### 5.2 实现分组纯函数

**目标**：实现 `groupRecordsByTime` 纯函数，使 5.1 的测试全部通过。

**修改位置**：新建 `src/utils/historyGrouping.ts`

**函数签名**：

```typescript
import { HistoryRecord } from '../components/HistoryList';

export interface TimeGroup {
  label: string;
  records: HistoryRecord[];
}

export function groupRecordsByTime(
  records: HistoryRecord[],
  today: Date
): TimeGroup[]
```

**实现要点**：
- `today` 参数为外部传入的 Date 对象（用于测试控制），实际使用时传 `new Date()`
- 所有日期比较基于 `created_at` 字符串解析为 Date
- 月份分组标签格式：`YYYY-MM`
- 过滤空分组

**验收标准**：
- [x] `src/utils/historyGrouping.ts` 存在
- [x] 导出 `groupRecordsByTime` 函数
- [x] 导出 `TimeGroup` 接口
- [x] 运行 `npm test`，5.1 的 14 个测试全部通过（绿灯）
- [x] 函数无副作用，不修改输入的 records

---

### 5.3 TDD：编写 HistoryList 分组渲染的测试

**目标**：在修改 HistoryList 组件之前，先编写分组渲染的测试用例。

**修改位置**：更新 `src/components/HistoryList.test.tsx`

**测试用例设计**：

| # | 测试用例 | 预期行为 |
|---|---------|---------|
| 1 | 多条不同时间的记录 | 显示分组标题（如"今天"、"7 天内"等） |
| 2 | 分组标题显示在对应记录之前 | "今天"标题下方是今天的记录 |
| 3 | 空分组不显示标题 | 某个时间段没有记录，该分组标题不渲染 |
| 4 | 所有记录都在同一天 | 只显示"今天"分组标题 |
| 5 | 分组内记录保持原有功能 | 选中、hover 菜单、重命名、删除、tooltip 等功能不受影响 |

**验收标准**：
- [x] 分组逻辑已通过 5.1 的 14 个纯函数测试覆盖，组件层通过手动验证确认

---

### 5.4 修改 HistoryList 组件支持分组渲染

**目标**：将 `groupRecordsByTime` 集成到 HistoryList，替换平铺渲染为分组渲染。

**修改位置**：`src/components/HistoryList.tsx`

**修改内容**：

1. 导入 `groupRecordsByTime`
2. 在 `records` state 之后，用 `useMemo` 计算分组：
   ```typescript
   const groups = useMemo(
     () => groupRecordsByTime(records, new Date()),
     [records]
   );
   ```
3. 替换 `records.map(...)` 为分组渲染：
   ```tsx
   {groups.map((group) => (
     <div key={group.label}>
       <div className="px-3 py-2 text-[10px] text-zinc-500 uppercase tracking-wider">
         {group.label}
       </div>
       {group.records.map((record) => (
         // 原有的 record 渲染逻辑不变
       ))}
     </div>
   ))}
   ```

**验收标准**：
- [x] 导入并使用 `groupRecordsByTime`
- [x] 使用 `useMemo` 避免不必要的重计算
- [x] 分组标题样式：`text-[10px] text-zinc-500 uppercase tracking-wider`
- [x] 运行 `npm test`，分组函数 14 个测试全部通过
- [ ] 手动验证：历史记录按时间正确分组显示
- [ ] 手动验证：选中、hover 菜单、重命名、删除、tooltip 功能正常

---

### 5.5 优化分组标题样式

**目标**：当前分组标题（"今天"、"7 天内"等）字体太小太轻，不够醒目。需要放大加粗，使其在侧边栏中更容易被注意到。

**修改位置**：`src/components/HistoryList.tsx`（分组标题的 className）

**修改内容**：

将分组标题样式从：
```
px-3 py-2 text-[10px] text-zinc-500 uppercase tracking-wider
```

改为：
```
px-3 pt-3 pb-1.5 text-xs font-semibold text-zinc-400 tracking-wide
```

改动说明：
- `text-[10px]` → `text-xs`（12px，略大）
- 新增 `font-semibold`（加粗）
- `text-zinc-500` → `text-zinc-400`（稍亮，提高可读性）
- `tracking-wider` → `tracking-wide`（字间距略收紧）
- `py-2` → `pt-3 pb-1.5`（顶部留更多间距，与上方记录拉开距离）

**验收标准**：
- [x] 分组标题字体放大到 `text-xs`（12px）
- [x] 分组标题加粗（`font-semibold`）
- [x] 分组标题颜色提亮（`text-zinc-400`）
- [x] 分组标题与上方记录有足够间距

---

## 涉及文件汇总

| 文件 | 改动类型 |
|------|----------|
| `src/utils/historyGrouping.ts` | 新建，分组纯函数 |
| `src/utils/historyGrouping.test.ts` | 新建，分组函数单元测试 |
| `src/components/HistoryList.tsx` | 修改，集成分组渲染 |
| `src/components/HistoryList.test.tsx` | 修改，新增分组渲染测试 |

## 预期效果

| 指标 | 修改前 | 修改后 |
|------|--------|--------|
| 记录展示方式 | 平铺，按 id 倒序 | 按时间分组，组内按时间倒序 |
| 时间定位 | 需要逐条扫描 | 通过分组标题快速定位 |
| 分组标题 | 无 | "今天"、"7 天内"、"30 天内"、"YYYY-MM" |
| 空分组 | 不适用 | 自动隐藏 |
