# 需求：手动执行模式（Manual Execution Mode）

## 背景

当前系统依赖自动调用 LLM API（免费 API 不稳定、配额易耗尽）。为此新增一种与自动模式**并列**的手动执行模式：每当需要调用 LLM 时，弹出与系统风格兼容的模态框，展示对应的系统提示词与用户提示词，用户复制到外部免费平台执行，将结果粘贴回弹窗，系统继续推进流程。

两套模式互不影响，可并行存在。

## 目标

- 在会话创建时选择"自动 API / 手动执行"模式。
- 手动模式下，每个 LLM 调用步骤弹出一个模态框，展示系统 + 用户提示词。
- 用户粘贴结果（正文必填、思考可选）后，系统推进到下一步。
- 提示词在前后端共享单一文件，保证两模式行为一致、零漂移。
- 两套模式完全解耦，互不影响。

## 架构决策：前端驱动 + 共享提示词

关键设计：**手动流程的状态完全由前端持有，服务端无状态**。服务端只负责最后保存。

- 前端在 React state 中维护"当前步骤 + 已收集的阶段结果"，按顺序弹窗。
- 提示词模板（system 常量 + 构建函数）抽到共享目录，前后端引用同一份。
- 服务端不新增 `/api/manual/*` 状态机接口；流程结束后复用现有 `POST /api/refinements` + `PUT /api/refinements/:id` 保存。

## 与自动模式的差异

| 维度 | 自动模式 | 手动模式 |
|---|---|---|
| 流程驱动 | 服务端 SSE 内跑完 | 前端 React 驱动 |
| 提示词来源 | 服务端 `prompts.ts` | 前后端共享 `shared/prompts.ts` |
| LLM 调用 | `llm.streamGenerate(...)` | 弹窗展示提示词 + 等待用户粘贴 |
| 状态保存 | eventBuffer / pendingInputs（内存） | 前端 React state（本地） |
| 服务端接口 | `/api/refine`（SSE） | 仅复用保存接口 |
| 会话隔离 | session_id | 保存时同样带 session_id |

## 共享提示词模块

将 `server/prompts.ts` 的纯函数与常量抽到共享目录，前后端引用同一份：

```
shared/
  prompts.ts        ← 唯一一份：system 常量 + 构建函数
server/
  prompts.ts        ← 改为 re-export：export * from "../shared/prompts"
src/                 ← 前端相对路径 import 同一文件
```

- `prompts.ts` 为纯函数（无 db / env / llm 依赖），可同时被 Node 与浏览器（Vite）安全引用。
- `server/prompts.ts` 改为一行转发，现有 `server/index.ts` 与测试 import 路径不变，零改动。
- 前端手动模式直接 import 构建函数，本地拼提示词，全程无需调服务端。
- 提示词会被打进前端 bundle；因手动模式本就在弹窗展示，无泄密，bundle 仅增几 KB。
- 需确保：Vite 可 import 项目根下 `src/` 之外的文件；服务端 tsconfig `include` 覆盖 `shared/`。

## 前端交互流程

```
1. 新建手动会话 → 选择 input + cycles
2. 前端进入状态机，第 1 步（architect）
     → 弹窗显示系统提示词 + 用户提示词，带"复制"按钮
3. 用户复制 → 到免费平台执行 → 复制结果
4. 粘贴正文（必填）+ 思考（可选）→ 点"提交下一步"
5. 前端用本地已有结果 + 共享构建函数拼出下一步提示词，切换弹窗内容
6. 重复 2-5，直到最后一步（explainer）
7. 前端 POST /api/refinements 建记录 → PUT /api/refinements/:id 写入全部阶段结果
8. 关闭模态框，渲染最终结果
```

## 状态机

阶段顺序与自动模式一致（见 `server/index.ts` 的 `runStage` 流程）：

```
architect
  → ( redteam → synthesizer ) × cycles
  → boundary
  → crystallization (finalLogic)
  → explainer
```

- 1 轮演化共 6 次 LLM 调用 = 手动模式 6 次弹窗。
- 前端本地维护：`input`、`cycles`、`currentLogic`、`architectOutput`、`redTeamOutput`、`boundaryOutput`、`finalLogic`、累积的 stages。
- 手动模式不迁移自动模式的 resume/续跑逻辑；重新走一遍即可。

## 前端交互细节

- 模态框为**阻塞式**：固定显示当前步骤，提交前可修改粘贴内容。
- 同时显示系统提示词与用户提示词，带"复制"按钮。
- 正文输入（必填）+ 思考输入（可选）。
- 基础格式校验：正文为空时拦截并提示。
- 点击"提交下一步"后自动切换为下一步内容，直到 `done`。
- 出问题可重跑当前步骤。

## 子任务

- **1** 共享：新增 `shared/prompts.ts`（从 `server/prompts.ts` 迁移），`server/prompts.ts` 改为 re-export
- **2** 构建：确认 Vite 可 import `shared/`，服务端 tsconfig `include` 覆盖 `shared/`
- **3** 前端：会话创建时增加模式选择（自动 API / 手动执行）
- **4** 前端：实现手动流程状态机 + 阻塞式模态框（系统/用户提示词、复制、正文+思考输入、提交下一步）
- **5** 前端：流程结束后复用保存接口落库
- **6** 测试：共享提示词模块可用（前后端引用一致）
- **7** 测试：手动流程（6 步弹窗 → 保存 → 渲染结果）
- **8** 测试：两模式互不影响（会话隔离）

## 验收标准

- [ ] 新建会话可选择"自动 API / 手动执行"模式
- [ ] 手动模式下，每个 LLM 步骤弹出模态框，展示系统 + 用户提示词
- [ ] 粘贴结果（正文 + 可选思考）后正确推进到下一步
- [ ] 完整流程结束后落库并渲染最终结果
- [ ] 空内容提交被拦截并提示
- [ ] 提示词前后端共用单一文件，改一处两边生效
- [ ] 自动模式与手动模式可并行存在、互不影响