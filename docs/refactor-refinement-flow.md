# 需求 10：精炼流程重构 — 后端持有 ID 并直接更新

## 背景

当前实现存在 bug：后端在精炼完成时调用 `saveRefinement`（INSERT）创建新记录，同时前端调用 PUT 更新原记录，导致同输入产生两条相同内容的记录。

## 目标

改为后端持有记录 ID，精炼完成后直接 UPDATE，消除重复记录问题。

## 流程

```
1. 前端 POST /api/refinements → 创建空记录 → 返回 id
2. 前端开 SSE /api/refine?input=xxx&cycles=2&id=123
3. 后端持有 id，精炼过程中收集 stages、finalLogic、explanation
4. 精炼完成后，后端直接 UPDATE refinements SET ... WHERE id = ?
5. 后端发送 done 事件，前端不再需要 PUT
```

## 子任务

- **10.1** ✅ 后端：修改 `/api/refine` 端点，接收 id 参数
- **10.2** ✅ 后端：修改精炼完成逻辑，用 UPDATE 替代 saveRefinement
- **10.3** ✅ 后端：保留 saveRefinement 作为 fallback（向后兼容）
- **10.4** ✅ 前端：SSE URL 带上 id 参数
- **10.5** ✅ 前端：移除 `done` 事件中的 PUT 调用
- **10.6** ✅ 前端：后端直接更新记录，前端逻辑简化
- **10.7** ✅ 测试：验证单次精炼只产生一条记录
- **10.8** ✅ 测试：验证刷新页面后，进行中的精炼仍能正确完成

## 验收标准

- [x] 单次精炼只产生一条记录
- [x] 同输入多次精炼产生多条不同内容的记录
- [x] 刷新页面后，进行中的精炼仍能正确完成并更新数据库
- [x] 历史列表正确显示所有记录
