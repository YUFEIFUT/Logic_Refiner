# 需求文档：接入 Agnes 2.0 Flash 思考模式

> 状态：实现完成，待用户真实 key 验收（任务 0 未勾）
> 关联：`docs/issues/llm-reasoning-default-per-provider-validation.md`（C 提议，待做）
> 关联：`llm-provider-registry-requirements.md`（第二代 registry 总体设计）

## 1. 背景与目标

Logic_Refiner 现有 LLM 层已重构为「数据驱动登记表 + 通用 `RegistryProvider`」。本次目标是在**不写任何新类、不改 switch、不改类型**的前提下，仅向 `PROVIDERS` 登记表追加一行，即可让 Agnes 2.0 Flash 的思考模式接入统一调用路径。

调用方视角不变：仍通过 `generate(prompt, system, { reasoning: true })` 开启推理。

## 2. 文档理解（agnes-ai.com 官方文档）

Agnes 2.0 Flash 提供两种思考模式启用格式：

| 格式 | 请求字段 | 强度档 | 备注 |
|------|----------|--------|------|
| **OpenAI 兼容** | `chat_template_kwargs.enable_thinking: true/false` | 无（纯开关） | 文档推荐路径 |
| Anthropic 兼容 | `thinking: { type: "enabled", budget_tokens: 2048 }` | 无（开/关 + 思考预算） | 与 MiMo 的 `thinking.type` 同构 |

端点：`POST https://apihub.agnes-ai.com/v1/chat/completions`，Bearer 鉴权，OpenAI 兼容。
上下文窗口 512K，最大输出 65.5K（文档列出 `max_tokens` 为通用总上限）。

## 3. curl 实测结果（用户真实 key 验证）

### 3.1 思考模式响应结构（实测确认）

请求：`chat_template_kwargs: { enable_thinking: true }`
响应关键片段：

```json
"message": {
  "content": "该推理**不成立**。...",
  "reasoning_content": "Here's a thinking process:..."
}
```

**结论**：思考内容在 `message.reasoning_content`（string），最终答案在 `message.content`（string）。
→ 与 MiMo **完全同构**，复用 `response.format: "string"` 即可，`extractAnswer` 直接抽 `content`。

### 3.2 温度约束（实测确认）

请求：`chat_template_kwargs: { enable_thinking: true }, "temperature": 0`
响应：正常返回（含 `content` + `reasoning_content`）。

**结论**：思考模式下 `temperature:0` 被正常接受 → **无温度约束**（与 MiMo 强制 1.0、Mistral avoid-zero 不同）。
→ 登记表不声明 `temperatureMode`，走默认 `passthrough`。

### 3.3 待补实测（仅文档来源，未 curl 验证）

- `max_tokens`：文档列出为通用总上限。登记表声明 `maxTokensField: "max_tokens"`（沿用 Mistral 字段名策略）。**未在 curl 中显式验证 max_tokens 行为**，待用户验收时确认。

## 4. 设计决策

**复用现有 toggle 抽象，无需任何抽象扩展。**

现有 toggle 抽象：`field`（顶层键）+ `on`/`off`（任意对象值），`buildBody` 执行 `body[field] = on`。
Agnes OpenAI 格式只需：

- `field: "chat_template_kwargs"`
- `on: { enable_thinking: true }`
- `off: { enable_thinking: false }`

一步赋值即生成 `{ chat_template_kwargs: { enable_thinking: true } }`，正确嵌套。**无需扩展抽象**（前期误判已纠正）。

**为何走 OpenAI 格式而非 Anthropic 格式**：
- OpenAI 格式贴合我们"OpenAI 兼容"核心架构，且不引入 `budget_tokens` 额外维度（保持 registry 简单）。
- Anthropic 格式（`thinking.type`）虽可与 MiMo 零改动同构，但在 OpenAI 端点用 Anthropic 字段语义别扭，且 `budget_tokens` 会引入 registry 尚无的"思考预算"维度。

## 5. 登记表条目

`server/llm/registry.ts`：

```ts
agnes: {
  auth: "bearer",
  maxTokensField: "max_tokens",
  reasoning: {
    request: {
      kind: "toggle",
      field: "chat_template_kwargs",
      on: { enable_thinking: true },
      off: { enable_thinking: false },
      // 无温度约束（实测 temperature:0 正常）
    },
    response: { format: "string" },
  },
},
```

## 6. 影响面分析

- **仅新增**：`registry.ts` 一行 `agnes` 条目；`types.test.ts` / `provider.test.ts` 新增断言；`.env.example` 示例。
- **零改动**：`negotiate.ts`（toggle 分支已支持任意 `on/off`）、`provider.ts`（`buildBody`/`resolveTemperature`/`extractAnswer` 通用）、`index.ts`（`createProvider` 查表，自动识别新 provider）、`response.ts`、`types.ts`。
- **调用方无感**：`server/index.ts` 已用 `generate(..., { reasoning: true })`，切 `LLM_PROVIDER=agnes` 即生效，不改代码。
- **无类型改动**：复用既有 `ProviderSpec` / `ReasoningRequestSpec`，无新类型、无 `switch` 新增分支。

## 7. 任务拆分与验收

| # | 任务 | 验收标准 | 状态 |
|---|------|----------|------|
| 0 | 真实 key 端到端验证（Agnes + reasoning:true） | `.env` 配 agnes，跑一次 refine，返回正确答案且思考内容在 reasoning_content；无 400/字段错误 | [ ] |
| 1 | registry.ts 新增 agnes 条目 | 条目字段正确（toggle / chat_template_kwargs / on-off / string / max_tokens / bearer） | [x] |
| 2 | types.test.ts 断言 | T0.1 计 8 provider；T0.9 toggle 声明；T0.10 response string + maxTokensField | [x] |
| 3 | provider.test.ts 端到端 | T3.14~T3.18 全过（注入 / 关 / 温度 / 响应 / maxTokens 字段名） | [x] |
| 4 | .env.example 示例 | 可选值列表含 agnes；base url 参考含 agnes；新增切换示例块 | [x] |
| 5 | lint + 全量测试 | `tsc --noEmit` 干净；`npm test` 全绿 | [x] |
| 6 | 重建 dist | `npm run build` 产物含 agnes 条目 | [x] |

## 8. TDD 自评审结论

- 表驱动逐项核对：toggle 分支 `intent===true → on`、`false/"none" → off`、`undefined → 不注入`，Agnes 走与 MiMo 相同逻辑，已覆盖（T3.14/T3.15 对应 on/off）。
- 温度：Agnes 不声明 `temperatureMode`，`resolveTemperature` 在无 mode 时直接返回原值（T3.16 钉死 `temperature:0` 不触发任何约束）。
- 响应：复用 `string` 解析，Agnes 的 `reasoning_content` 与 MiMo 同构，T3.17 验证 `content` 被返回、`reasoning_content` 被忽略（与现有行为一致）。
- 未改动协商/响应/类型核心逻辑，回归风险低；全量测试 161→166（+5 覆盖 Agnes）。

## 9. 待办 / 开放问题

1. **`reasoning_content` 未对外暴露**：`extractAnswer` 的 `string` 分支只抽 `content`，思考内容当前被丢弃（MiMo 同理）。若产品希望向用户展示 Agnes 思考过程，需增强 `RegistryProvider` 在思考模式下把 `reasoning_content` 一并带出（独立于本次"正确调用"的增强项，留待后续）。
2. **`max_tokens` 仅文档来源**：未在 curl 中显式验证。若验收发现 Agnes 实际用 `max_completion_tokens`，改 `maxTokensField` 即可（一行）。
3. **`LLM_REASONING_DEFAULT` 对 Agnes 无意义**：toggle 型不读该变量（`resolveReasoning` 的 toggle 分支忽略 `defaultOverride`），`.env.example` 已注明。
4. **需求文档漂移提醒**：`llm-provider-registry-requirements.md` 中 mistral `levels` 仍按旧 6 档描述（代码已改 2 档），与代码不一致，建议一并修正（见 C issue 文档）。
