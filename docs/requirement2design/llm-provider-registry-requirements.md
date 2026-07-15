# LLM Provider 登记表重构与推理强度支持 — 需求文档（第二代演进）

> 本文档是 [`llm-provider-abstraction-requirements.md`](./llm-provider-abstraction-requirements.md) 的**第二代演进**。
> 第一代已落地：抽象出 `LLMProvider` 接口 + `OpenAICompatibleProvider` 基类 + `MimoProvider` 子类 + `createProvider` 工厂（switch 分发）。
> 本代目标：把"每模型一个子类 + switch"重构为"**数据驱动登记表 + 通用 Provider**"，并补齐两件事——（1）推理**强度**支持（不止开/关）；（2）接入 Mistral reasoning（含 chunk 数组响应解析）。

---

## 1. 背景与目标

### 1.1 当前架构（第一代，已实现）

`server/llm/` 现状：

| 文件 | 内容 |
| --- | --- |
| `types.ts` | `LLMProvider` 接口、`GenerateOptions { thinking?: boolean; temperature?; maxTokens? }`、`ProviderConfig`、`loadProviderConfig` |
| `openai-compat.ts` | `OpenAICompatibleProvider` 基类，模板方法 `generate`；`buildBody` **忽略 `thinking`**；`content` 当作字符串返回 |
| `mimo.ts` | `MimoProvider extends OpenAICompatibleProvider`，重写 `buildHeaders`（api-key 头）与 `buildBody`（注入 `thinking:{type:"enabled"}`） |
| `index.ts` | `createProvider(env)`，按 `LLM_PROVIDER` 字符串 `switch` 返回实例 |

调用层（`server/index.ts`）6 处精炼阶段统一调用 `llm.generate(prompt, system, { thinking: true })`。

### 1.2 当前痛点（推动本代演进）

1. **加一个模型要改多处**：新增 provider = 写新子类（重写钩子）+ 在 `index.ts` 的 `switch` 加 `case` + 同步更新 `types.ts` + 加测试。模型越多仪式感越强，维护成本线性上升。
2. **`thinking: boolean` 只能表达开/关**：Mistral 的 `reasoning_effort` 有 6 档（`none/minimal/low/medium/high/xhigh`），被锁死成 `high` 会浪费其核心价值；锁死成任意一档都丧失灵活性。
3. **响应解析不统一、接 Mistral 必坏**：`OpenAICompatibleProvider` 直接 `data.choices[0].message.content` 当字符串。但 Mistral `reasoning_effort:"high"` 时 `content` 是 **chunk 数组**（`[{type:"thinking"},{type:"text"}]`），当前代码会返回 `[object Object]` 或抛格式错误，破坏 `Promise<string>` 契约。
4. **"像在迁就某家格式"**：`GenerateOptions.thinking` 字段名与 MiMo 的 wire 字段同名，语义上并不中立。

### 1.3 目标

1. 把"模型差异"从**代码**（类 + switch）变成**数据**（登记表的一行），新增模型只加一行配置。
2. 推理支持**强度**：调用层可传 `reasoning: true`（开，用模型默认档）/ `reasoning: "medium"`（指定档）/ `reasoning: false`（关）。
3. 正确支持 Mistral reasoning：`reasoning_effort` 参数映射 + chunk 数组响应解析为最终答案字符串。
4. 通用 Provider 按"**模型能力 ∩ 调用意图**"协商出最终 wire 参数，模型不支持强度时自动降级为开/关。
5. **完全向后兼容**：MiMo 行为零变化（api-key 头、`thinking:{type:"enabled"}`、思考内容在 `reasoning_content` 不暴露、`thinking` 关时注入 `disabled`）。

### 1.4 非目标（本期不做）

- **不**持久化 / 展示思考内容（thinking trace）。本期 `generate` 仍只返回最终答案字符串（与现有调用层契约一致）；思考内容在响应解析时提取但丢弃，为未来扩展预留解析能力。
- **不**引入自动 fallback / 多 key 轮询。
- **不**做运行时动态切换 provider（仍 `.env` 配置、重启生效）。
- **不**引入 LangChain 等 SDK（沿用第一代决策：调用极简，库抽象空转且破坏 `vi.mock` 测试约定）。
- **不**处理推理流式响应（streaming）：本期 `generate` 为非流式，Mistral 流式下 `delta.content` 形态多变（thinking 列表 → 过渡合并 → 普通字符串），不在本期范围；若未来需要流式推理展示，列为独立优化。
- **不**改动 `src/db.ts`、`src/utils/auth.ts`、前端代码、API 端点、数据库结构。

### 1.5 设计原则

| 原则 | 含义 |
| --- | --- |
| **数据驱动** | 模型差异全部用登记表声明，新增模型只加一行 |
| **能力 / 意图分离** | 登记表只声明"模型能做什么"；调用层只表达"想怎么用"；协商逻辑算 wire 参数 |
| **厂商中立调用层** | `server/index.ts` 6 处只说 `reasoning: true/"medium"`，永不出现各家 wire 字段名 |
| **双声明推理** | 登记表对推理同时声明**请求侧能力**（字段名 / 档位 / 开关值）与**响应侧结构**（思考内容在哪、是否数组） |
| **最小化变动面** | 保留 `loadProviderConfig`、Bearer/api-key 头、`maxTokens` 两级回退（字段名可由登记表声明，默认 `max_completion_tokens`）、重试与 LaTeX 提示；只替换"差异表达"机制 |
| **TDD 流程** | 每个任务 Red → Green → Refactor → Review；核心纯逻辑（协商、响应解析）最先测试 |
| **向后兼容** | 删除子类但不删能力；MiMo 行为逐条回归验证 |

---

## 2. 目标方案

### 2.1 核心思想

```
调用层: llm.generate(p, s, { reasoning: "medium" })
        │
        ▼
通用 Provider (RegistryProvider)   ← 一个类，不再有 per-provider 子类
        │  1. 查表 PROVIDERS[provider] 拿能力声明
        │  2. resolveReasoning(spec, intent, defaultOverride) → wire 字段
        │     （defaultOverride 来自 LLM_REASONING_DEFAULT 环境变量，覆盖 effort 兜底档）
        │  3. buildBody（注入 auth/温度约束/reasoning 字段）
        │  4. fetch
        │  5. extractAnswer(spec, data)        → 最终答案字符串
        ▼
fetch → 真实 HTTP 请求
```

`createProvider(env)` 不再 `switch`，而是 `new RegistryProvider(config, PROVIDERS[config.provider])`。

### 2.2 登记表数据结构（双声明）

```ts
// server/llm/types.ts（新增/扩展）

/** 推理请求侧能力声明 */
export interface ReasoningRequestSpec {
  /** effort: 支持多档强度；toggle: 仅开/关 */
  kind: "effort" | "toggle";
  /** wire 字段名，如 "reasoning_effort" 或 "thinking" */
  field: string;
  /** effort 型：支持的档位列表 */
  levels?: string[];
  /** effort 型：调用方只传 true（不指定档）时的兜底档 */
  default?: string;
  /** toggle 型：开启时的值，如 { type: "enabled" } */
  on?: unknown;
  /** toggle 型：关闭时的值，如 { type: "disabled" } */
  off?: unknown;
  /**
   * 思考模式下的温度约束：
   *  - "passthrough"（默认）：不特殊处理
   *  - "force"：思考模式下温度固定为 forcedTemperature（MiMo 静默覆盖）
   *  - "avoid-zero"：思考模式下若温度 <= 0，则改为 avoidZeroFallback（防 Mistral 400）
   */
  temperatureMode?: "passthrough" | "force" | "avoid-zero";
  forcedTemperature?: number;
  avoidZeroFallback?: number;
}

/** 推理响应侧结构声明 */
export interface ReasoningResponseSpec {
  /** "string"（默认）：content 即最终答案；"chunk-array"：content 是 chunk 数组，需抽 type:"text" */
  format: "string" | "chunk-array";
}

export interface ReasoningSpec {
  request: ReasoningRequestSpec;
  response: ReasoningResponseSpec;
}

/** 单个 provider 的能力声明（登记表的一行） */
export interface ProviderSpec {
  /** 鉴权方式 */
  auth: "bearer" | "api-key";
  /** 推理能力；不声明 = 不支持推理（忽略 reasoning 意图） */
  reasoning?: ReasoningSpec;
  /**
   * 最大生成 token 数的 wire 字段名。
   * 默认 "max_completion_tokens"（OpenAI / MiMo 兼容）；
   * Mistral 规范使用 "max_tokens"，故在此显式声明以适配。
   */
  maxTokensField?: string;
}

/** 登记表：provider 名 → 能力声明 */
export type ProviderRegistry = Record<string, ProviderSpec>;
```

### 2.3 推理能力 / 意图协商（纯函数）

```ts
// server/llm/negotiate.ts

export type ReasoningIntent =
  | boolean
  | "none" | "minimal" | "low" | "medium" | "high" | "xhigh";

/**
 * 把"调用意图"翻译成"请求体里的字段值"。
 * 返回 {} 表示不注入任何推理字段。
 */
export function resolveReasoning(
  spec: ReasoningSpec | undefined,
  intent: ReasoningIntent | undefined,
  defaultOverride?: string
): Record<string, unknown> {
  if (!spec?.request) return {};             // 模型不支持推理 → 不传
  if (intent === undefined) return {};        // 调用者没表达意图 → 不传（注意：false 是"显式关闭"，不等于没表达）
  const r = spec.request;

  if (r.kind === "toggle") {
    // 只开/关；意图里的强度被忽略（含 "none" 也视为关）
    const isOn = intent === true || (typeof intent === "string" && intent !== "none");
    return { [r.field]: isOn ? r.on : r.off };
  }

  // effort 型
  if (intent === false) return { [r.field]: "none" };   // 显式关闭
  if (intent === true)  return { [r.field]: defaultOverride ?? r.default }; // 用兜底档（可被环境变量覆盖）
  // 指定了档位：不在支持列表内则回退兜底（指定档位不被 defaultOverride 覆盖）
  const level = r.levels?.includes(intent) ? intent : r.default;
  return { [r.field]: level };
}

// 注意：effort 型条目应在登记表中声明 default，否则 intent===true 时兜底为 undefined；
// 本登记表 Mistral 已声明 default:"high"，安全。
```

### 2.4 推理响应解析（纯函数）

```ts
// server/llm/response.ts

/**
 * 从 API 响应里抽取"最终答案字符串"。
 * - 多数模型：content 即答案（MiMo 的思考在独立 reasoning_content 字段，不在此处理）
 * - Mistral 等 chunk-array 型：content 是数组，抽取 type==="text" 的 text
 */
export function extractAnswer(
  data: any,
  spec: ProviderSpec | undefined
): string {
  const msg = data?.choices?.[0]?.message;
  if (msg === undefined || msg === null) {
    throw new Error("Invalid API response format: " + JSON.stringify(data));
  }
  if (spec?.reasoning?.response.format === "chunk-array") {
    const content = msg.content;
    if (Array.isArray(content)) {
      // 开启了推理：content 是 chunk 数组，抽取 type==="text" 的 text
      const textChunk = content.find((c: any) => c?.type === "text");
      if (!textChunk || typeof textChunk.text !== "string") {
        throw new Error("No text chunk in reasoning response: " + JSON.stringify(content));
      }
      return textChunk.text;
    }
    if (typeof content === "string") {
      // 未开启推理：content 直接是最终答案字符串（Mistral 不推理时即此情形）
      return content;
    }
    throw new Error("Expected chunk-array or string content but got: " + JSON.stringify(content));
  }
  if (typeof msg.content !== "string") {
    throw new Error("Expected string content but got: " + JSON.stringify(msg.content));
  }
  return msg.content;
}
```

### 2.5 思考模式温度约束（在 buildBody 内处理）

`generate` 构建 body 时：

- 计算原始温度：`const temp = opts?.temperature ?? this.config.temperature;`
- 判定"推理是否实际开启"：`on = intent === true || (typeof intent === "string" && intent !== "none")`。注意 `intent === "none"` 表示显式关闭，不视为开启，不应触发温度约束。
- 若 `on` 且 `spec.reasoning.request.temperatureMode === "force"`：body 温度用 `forcedTemperature`（忽略原始温度）。
- 若 `on` 且 `temperatureMode === "avoid-zero"`：若 `temp <= 0`，body 温度用 `avoidZeroFallback`（如 0.8），避免 Mistral 400；若 `temp > 0` 则正常用 `temp`。
- 否则（未开启推理，或 `temperatureMode === "passthrough"`）正常用 `temp`。

> 依据（已核实官方文档）：
> - MiMo：思考模式下 `temperature`/`top_p` 被**静默强制**为 1.0 / 0.95，传入被忽略不报错 → `temperatureMode:"force", forcedTemperature:1.0`。
> - Mistral：`reasoning_effort:"high"` + `temperature:0` 会被**拒绝（400）** → `temperatureMode:"avoid-zero", avoidZeroFallback:0.8`；但 `reasoning_effort:"none"` + `temperature:0` 是合法的，故约束仅在实际开启推理时生效。

### 2.6 接口变更

`GenerateOptions.thinking` 重命名为 `reasoning`，类型升级：

```ts
export interface GenerateOptions {
  /** 推理意图：true=开(默认档) / 档位字符串 / false=关；模型不支持时自动忽略 */
  reasoning?: boolean | "none" | "minimal" | "low" | "medium" | "high" | "xhigh";
  temperature?: number;
  maxTokens?: number;
}
```

`LLMProvider.generate` 签名不变（仍是 `Promise<string>`）。调用层 6 处 `{ thinking: true }` 改为 `{ reasoning: true }`（语义不变：MiMo→enabled，Mistral→默认档 high）。

`ProviderConfig` 新增可选字段 `reasoningDefault?: string`，由 `loadProviderConfig` 从 `LLM_REASONING_DEFAULT` 读取并校验（必须是 6 档之一，否则抛错）。仅作为 effort 型 provider 在 `intent === true`（调用方未指定档位）时的兜底档覆盖，对 toggle 型（MiMo）无意义。

### 2.7 PROVIDERS 登记表

```ts
// server/llm/registry.ts
import type { ProviderRegistry } from "./types";

export const PROVIDERS: ProviderRegistry = {
  mimo: {
    auth: "api-key",
    reasoning: {
      request: {
        kind: "toggle",
        field: "thinking",
        on: { type: "enabled" },
        off: { type: "disabled" },
        temperatureMode: "force",
        forcedTemperature: 1.0,
      },
      response: { format: "string" }, // 思考在 reasoning_content，content 始终是答案
    },
  },
  openai:   { auth: "bearer" },
  deepseek: { auth: "bearer" },
  qwen:     { auth: "bearer" },
  moonshot: { auth: "bearer" },
  zhipu:    { auth: "bearer" },
  mistral: {
    auth: "bearer",
    maxTokensField: "max_tokens",   // Mistral 规范用 max_tokens（非 OpenAI 的 max_completion_tokens）
    reasoning: {
      request: {
        kind: "effort",
        field: "reasoning_effort",
        levels: ["none", "minimal", "low", "medium", "high", "xhigh"],
        default: "high",
        temperatureMode: "avoid-zero",
        avoidZeroFallback: 0.8,
      },
      response: { format: "chunk-array" },
    },
  },
};
```

> **新增模型只加一行**：例如将来加 `anthropic` 兼容代理，只需在 `PROVIDERS` 增一行 `{ auth: "bearer" }` 或带 reasoning 声明，无需写类、无需改 switch、无需改类型。

> effort 型 provider 的 `default` 档（如 Mistral 的 `"high"`）可被环境变量 `LLM_REASONING_DEFAULT` 覆盖（见 §2.6）。

### 2.8 调用层契约

- `generate` 仍返回 `Promise<string>`（最终答案）。思考内容不对外暴露（与现有 MiMo 行为一致，见 1.4 非目标）。
- 多轮回传：Mistral 需保留完整 assistant 消息（含 thinking chunk）；MiMo 需保留 `reasoning_content`。本期**不改变** `server/index.ts` 的消息累积逻辑（当前每轮只回传最终答案文本，未回传思考块）。这是已知限制，列为后续优化（见 §6）。

---

## 3. 任务拆分（TDD 顺序）

> 通用约定：所有单元测试用 **vitest**，`vi.fn()` mock 全局 `fetch` 并赋值给 `globalThis.fetch`，`afterEach` 还原。沿用现有 `mimo.test.ts` 的 mock 模式。每个任务严格 Red → Green → Refactor → Review。

### 任务 0：类型与登记表数据模型

**目标**：扩展 `types.ts`，定义 `ReasoningSpec` / `ProviderSpec` / `ProviderRegistry`，把 `GenerateOptions.thinking` 改为 `reasoning`；新建 `registry.ts` 导出 `PROVIDERS`（含全部 7 个 provider）。

**设计**：见 §2.2、§2.6、§2.7。保留 `loadProviderConfig` 入口，但扩展其读取 `LLM_REASONING_DEFAULT`（见 §2.6）；`ProviderConfig` 新增可选 `reasoningDefault` 字段；`LLMProvider` 接口不变。`server/index.ts` 的 6 处 `{ thinking: true }` 本任务**不改语义**，仅在其上方加 `// @ts-expect-error 临时：thinking→reasoning 待任务6 改名` 压制类型错误，保持 lint 绿（任务 6 移除）。

**TDD 测试用例**（`server/llm/types.test.ts` 在原 8 例基础上**新增/修改**）：

- T0.1：`PROVIDERS` 包含 mimo / openai / deepseek / qwen / moonshot / zhipu / mistral 共 7 个键。
- T0.2：`PROVIDERS.mimo.reasoning.request.kind === "toggle"`，`field==="thinking"`，`on` 与 `off` 分别为 `{type:"enabled"}` / `{type:"disabled"}`。
- T0.3：`PROVIDERS.mistral.reasoning.request.kind === "effort"`，`field==="reasoning_effort"`，`levels` 含 6 档且含 `"high"`，`default==="high"`。
- T0.4：`PROVIDERS.mistral.reasoning.response.format === "chunk-array"`；`PROVIDERS.mimo.reasoning.response.format === "string"`。
- T0.5：`PROVIDERS.openai` 不声明 `reasoning`（即 `reasoning === undefined`）。
- T0.6：`GenerateOptions` 类型允许 `reasoning` 为 `boolean` 或档位字符串（通过编译期接口校验，附一个最小赋值用例）。
- T0.7：`PROVIDERS.mistral.maxTokensField === "max_tokens"`；`PROVIDERS.mimo.maxTokensField` 为 `undefined`（运行时默认 `max_completion_tokens`）。
- T0.8：`loadProviderConfig` 读取 `LLM_REASONING_DEFAULT`：`"medium"` → `config.reasoningDefault === "medium"`；非法值（如 `"ultra"`）→ 抛错且信息含 `LLM_REASONING_DEFAULT`；缺省 → `undefined`。

**验收标准**：

- [x] `types.ts` 定义 `ReasoningRequestSpec` / `ReasoningResponseSpec` / `ReasoningSpec` / `ProviderSpec` / `ProviderRegistry`。
- [x] `GenerateOptions.thinking` 已更名为 `reasoning`，类型为 `boolean | 档位`。
- [x] `ProviderConfig` 新增可选 `reasoningDefault`，由 `loadProviderConfig` 经 `LLM_REASONING_DEFAULT` 注入（非法值抛错）。
- [x] `ProviderSpec` 含可选 `maxTokensField`，mistral 设为 `"max_tokens"`。
- [x] `registry.ts` 导出 `PROVIDERS`，含 7 个 provider，mimo/mistral 推理声明正确。
- [x] 类型层测试（T0.1–T0.8）全部通过。
- [x] `npm run lint` 通过。改名后 `server/index.ts` 的 6 处 `{thinking:true}` 在本任务用 `// @ts-expect-error 临时：thinking→reasoning 待任务6 改名` 压制以保 lint 绿；任务 6 完成语义改名后移除这些注释。

### 任务 1：推理协商纯函数 `resolveReasoning`

**目标**：实现 §2.3 的 `resolveReasoning`，纯函数、零 I/O，最优先 TDD。

**设计**：见 §2.3（签名含 `defaultOverride` 第三参数）。

**TDD 测试用例**（`server/llm/negotiate.test.ts` 新增）：

- T1.1：`spec` 为 `undefined` → 返回 `{}`（模型不支持推理）。
- T1.2：`intent` 为 `undefined` → 返回 `{}`（调用者没表达意图，不注入任何推理字段）。
- T1.2b：effort 型 `intent=false` → 返回 `{ reasoning_effort: "none" }`（显式关闭，区别于"没表达"）。
- T1.3：toggle 型，`intent=true` → `{ thinking: {type:"enabled"} }`。
- T1.4：toggle 型，`intent="high"`（带强度）→ 仍返回 `{ thinking: {type:"enabled"} }`（强度被忽略，只开）。
- T1.4b：toggle 型，`intent="none"` → `{ thinking: {type:"disabled"} }`（`"none"` 视为关，区别于 T1.4 的带强度开）。
- T1.5：toggle 型，`intent=false` → `{ thinking: {type:"disabled"} }`。
- T1.6：effort 型，`intent=true` → `{ reasoning_effort: "high" }`（兜底档）。
- T1.7：effort 型，`intent="medium"` → `{ reasoning_effort: "medium" }`（指定档）。
- T1.8：effort 型，`intent="ultra"`（不支持的档）→ `{ reasoning_effort: "high" }`（回退兜底，不抛错）。
- T1.9：effort 型，`intent=false` → `{ reasoning_effort: "none" }`。
- T1.10：effort 型，`intent=true`，`defaultOverride="medium"` → `{ reasoning_effort: "medium" }`（环境变量兜底档覆盖）。

**验收标准**：

- [x] `server/llm/negotiate.ts` 导出 `resolveReasoning`，签名 `(spec, intent, defaultOverride?) => Record<string, unknown>`。
- [x] T1.1–T1.10、T1.2b、T1.4b 共 12 个测试全部通过，覆盖无能力/关/toggle 开关/effort 默认/指定/越界回退/环境变量覆盖。
- [x] `npm run lint` 通过。

### 任务 2：推理响应解析纯函数 `extractAnswer`

**目标**：实现 §2.4 的 `extractAnswer`，正确处理 MiMo 字符串与 Mistral chunk 数组。

**设计**：见 §2.4。

**TDD 测试用例**（`server/llm/response.test.ts` 新增）：

- T2.1：标准结构（MiMo/OpenAI），`content` 为字符串 → 返回该字符串。
- T2.2：Mistral chunk 数组 `{content:[{type:"thinking",thinking:[...]},{type:"text",text:"答案"}]}` + `response.format:"chunk-array"` → 返回 `"答案"`。
- T2.2b：Mistral spec（`response.format:"chunk-array"`）但 `content` 为字符串（未开启推理）→ 返回该字符串（兼容未推理情形，避免误报格式错误）。
- T2.3：Mistral chunk 数组但只有 thinking 无 text → 抛错（含 "No text chunk"）。
- T2.4：`response.format:"chunk-array"` 但 `content` 不是数组 → 抛错。
- T2.5：响应缺 `choices` / `message` → 抛错（含 "Invalid API response format"）。
- T2.6：`content` 为非字符串非数组（异常结构）→ 抛错。
- T2.7：spec 未声明 reasoning（如 openai）→ 按 `format:"string"` 处理，返回 `content` 字符串。

**验收标准**：

- [x] `server/llm/response.ts` 导出 `extractAnswer`。
- [x] T2.1–T2.7 共 7 个测试全部通过，覆盖字符串/chunk 数组/缺失/异常。
- [x] `npm run lint` 通过。

### 任务 3：通用 Provider `RegistryProvider`

**目标**：用单类 `RegistryProvider` 取代 `OpenAICompatibleProvider` + `MimoProvider`，整合查表、`resolveReasoning`、温度约束、`extractAnswer`、Bearer/api-key 头、重试、LaTeX 提示、`maxTokens` 两级回退（字段名由登记表声明，默认 `max_completion_tokens`）。

**设计**：

```ts
// server/llm/provider.ts
export class RegistryProvider implements LLMProvider {
  constructor(
    private config: ProviderConfig,
    private spec: ProviderSpec
  ) {}

  async generate(prompt: string, system: string, opts?: GenerateOptions): Promise<string> {
    const enhancedSystem = this.enhanceSystemInstruction(system);
    const body = this.buildBody(prompt, enhancedSystem, opts);
    const headers = this.buildHeaders();
    // 重试逻辑同第一代（5 次，quota 错误重试）
    for (let i = 0; i < 5; i++) {
      try {
        const res = await fetch(`${this.config.baseUrl}/chat/completions`, { method:"POST", headers, body: JSON.stringify(body) });
        if (!res.ok) { const t = await res.text(); throw new Error(`LLM API Error (${res.status}): ${t}`); }
        const data = await res.json();
        return extractAnswer(data, this.spec);   // ← 用任务2
      } catch (e: any) {
        console.error(`Attempt ${i+1} failed:`, e.message);
        if (this.isQuotaError(e) && i < 4) continue;
        if (i === 4) throw e;
      }
    }
    throw new Error("Maximum retries reached for API generation.");
  }

  protected buildBody(prompt: string, system: string, opts?: GenerateOptions): Record<string, unknown> {
    const body: Record<string, unknown> = {
      model: this.config.model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
      temperature: this.resolveTemperature(opts),
      top_p: 0.95,
    };
    const maxTokens = opts?.maxTokens ?? this.config.maxTokens;
    if (maxTokens !== undefined) {
      body[this.spec.maxTokensField ?? "max_completion_tokens"] = maxTokens;
    }
    const reasoningField = resolveReasoning(this.spec.reasoning, opts?.reasoning, this.config.reasoningDefault);
    Object.assign(body, reasoningField);
    return body;
  }

  /** 温度：结合思考模式约束（§2.5）。reasoning 实际开启时才施加约束，避免 "none" 误触发。forcedTemperature / avoidZeroFallback 在对应 temperatureMode 下由登记表保证必填 */
  protected resolveTemperature(opts?: GenerateOptions): number {
    const temp = opts?.temperature ?? this.config.temperature;
    const r = this.spec.reasoning?.request;
    if (!r) return temp;
    const on = opts?.reasoning === true || (typeof opts?.reasoning === "string" && opts.reasoning !== "none");
    if (!on) return temp;
    if (r.temperatureMode === "force") return r.forcedTemperature ?? 1.0;
    if (r.temperatureMode === "avoid-zero" && temp <= 0) return r.avoidZeroFallback ?? 0.8;
    return temp;
  }

  protected buildHeaders(): Record<string, string> {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (this.spec.auth === "bearer") h["Authorization"] = `Bearer ${this.config.apiKey}`;
    else h["api-key"] = this.config.apiKey;
    return h;
  }

  // 与第一代保持完全一致的 LaTeX 提示与 quota 判定（向后兼容）
  protected enhanceSystemInstruction(system: string): string {
    return system +
      "\n重要格式提示：当你输出任何必须的数学公式、定量变量或严密的逻辑代数式时，请使用标准的 LaTeX 语法。行内公式使用单个美元符号 $...$，块级/段落公式使用双美元符号 $$...$$。但请极力避免将非数量化的现实抽象概念生搬硬套进一个生硬造作的伪物理或数学公式中。";
  }

  protected isQuotaError(error: any): boolean {
    return error.message?.includes("429")
      || error.message?.includes("RESOURCE_EXHAUSTED")
      || error.message?.toLowerCase().includes("quota")
      || error.message?.toLowerCase().includes("limit");
  }
}
```

**TDD 测试用例**（`server/llm/provider.test.ts` 新增，mock fetch）：

- T3.1：MiMo spec + `reasoning:true` → body 含 `thinking:{type:"enabled"}`，header 含 `api-key` 不含 `Authorization`。
- T3.2：MiMo spec + 无 reasoning → body **不含** `thinking` 字段。
- T3.3：MiMo spec + `reasoning:false` → body 含 `thinking:{type:"disabled"}`。
- T3.4：Mistral spec + `reasoning:"medium"` → body 含 `reasoning_effort:"medium"`，header 含 `Authorization: Bearer`。
- T3.5：Mistral spec + `reasoning:true` → body 含 `reasoning_effort:"high"`（兜底档）。
- T3.6：openai spec + `reasoning:true` → body **不含** `reasoning_effort`（模型不支持，忽略）。
- T3.7：MiMo 思考模式 → body 温度强制为 `1.0`（忽略 config 的 0.8）。
- T3.8：Mistral 思考模式 + config 温度 0 → body 温度改为 `0.8`（avoid-zero 兜底），不传 0。
- T3.8b：Mistral `intent="none"`（显式关）+ config 温度 0 → body 温度仍为 `0`（约束仅在推理实际开启时生效，"none" 不触发）。
- T3.9：Mistral chunk 数组响应 → `generate` 返回 text chunk 的 `"答案"`。
- T3.10：MiMo 字符串响应 → `generate` 返回 `content` 字符串（不暴露 reasoning_content）。
- T3.11：maxTokens 两级回退同第一代（配置/opts/不传三种）；且字段名取自 `this.spec.maxTokensField ?? "max_completion_tokens"`。
- T3.11b：Mistral spec + `maxTokens` 配置 → body 用 `max_tokens` 字段（非 `max_completion_tokens`）；MiMo spec + `maxTokens` → body 用 `max_completion_tokens`。
- T3.12：HTTP 错误 / quota 重试 / 格式异常抛错，同第一代行为。
- T3.13：LaTeX 提示附加到 system。

**验收标准**：

- [x] `server/llm/provider.ts` 实现 `RegistryProvider`，整合查表、协商、温度约束、解析、鉴权、重试、LaTeX。
- [x] T3.1–T3.13、T3.8b、T3.11b 共 15 个测试覆盖 MiMo/Mistral/openai 的请求、温度、响应解析、重试、maxTokens 字段名。
- [x] MiMo 行为逐条回归（T3.1/3.2/3.3/3.7/3.10 对应第一代 mimo.test 的 2.1–2.4/2.7/2.9）。
- [x] `npm run lint` 通过。

### 任务 4：工厂改用登记表 + 删除子类

**目标**：`createProvider` 改为查表返回 `RegistryProvider`；删除 `mimo.ts`、`openai-compat.ts`。

**设计**：

```ts
// server/llm/index.ts
import { loadProviderConfig } from "./types";
import { PROVIDERS } from "./registry";
import { RegistryProvider } from "./provider";
import type { LLMProvider } from "./types";

export function createProvider(env: Record<string,string|undefined> = process.env): LLMProvider {
  const config = loadProviderConfig(env);
  const spec = PROVIDERS[config.provider];
  if (!spec) {
    throw new Error(`Unknown LLM_PROVIDER: "${config.provider}". Supported: ${Object.keys(PROVIDERS).join(", ")}`);
  }
  return new RegistryProvider(config, spec);
}

export type { LLMProvider, GenerateOptions, ProviderConfig } from "./types";
export { PROVIDERS } from "./registry";
export { RegistryProvider } from "./provider";
```

> 注意：`index.test.ts` 当前 `import` 了已删除的 `MimoProvider` / `OpenAICompatibleProvider`（见测试 3.1/3.2/3.3），本任务重写时必须移除这些 import，断言改为 `instanceof RegistryProvider` 或读取内部 `spec` 字段。

**TDD 测试用例**（`server/llm/index.test.ts` 重写）：

- T4.1：`LLM_PROVIDER=mimo` → 返回 `RegistryProvider` 实例，内部 spec.auth==="api-key"。
- T4.2：`LLM_PROVIDER=mistral` → 返回 `RegistryProvider` 实例，内部 spec 含 reasoning effort 声明。
- T4.3：`LLM_PROVIDER=openai` → 返回 `RegistryProvider`，spec 无 reasoning。
- T4.4：未知 provider → 抛错且信息列出所有支持的 provider（含新增的 `mistral`，共 7 个）。
- T4.5：`LLM_BASE_URL`/`LLM_MODEL` 缺失由 `loadProviderConfig` 抛错向上传播（沿用第一代）。
- T4.6：返回对象有 `generate` 方法。

**验收标准**：

- [x] `mimo.ts` 与 `openai-compat.ts` 已删除。
- [x] `index.ts` 导出 `createProvider`，查表返回 `RegistryProvider`，未知 provider 抛明确错误。
- [x] T4.1–T4.6 全部通过。
- [x] `npm run lint` 通过。

### 任务 5：PROVIDERS 完整性与 .env 文档

**目标**：确认 7 个 provider 条目齐全；更新 `.env.example` 说明 Mistral 接入与可选推理默认档。

**设计**：`registry.ts` 已含全表（任务 0 即完整）。`LLM_REASONING_DEFAULT` 已由 `loadProviderConfig` 在任务 0 接线（读取并校验 6 档之一，非法抛错）。本任务在 `.env.example` 补充分说明与 Mistral 接入示例段。

`.env.example` 新增片段：

```env
# Mistral reasoning 可选：effort 型模型的默认推理档（不配则用登记表 default=high）
# 可选值：none | minimal | low | medium | high | xhigh
# LLM_REASONING_DEFAULT=high
```

**TDD 测试用例**：本任务偏文档/配置，无新单测；通过 lint + 人工核对 `.env.example` 包含 Mistral 接入说明。

**验收标准**：

- [x] `.env.example` 含 Mistral 接入示例（`LLM_PROVIDER=mistral` / `LLM_BASE_URL=https://api.mistral.ai/v1` / `LLM_MODEL=mistral-medium-3-5`）与 `LLM_REASONING_DEFAULT` 说明。
- [x] `PROVIDERS` 7 个条目齐全且 auth 正确。
- [x] `npm run lint` 通过。

### 任务 6：调用层适配 `server/index.ts`

**目标**：6 处 `{ thinking: true }` → `{ reasoning: true }`；移除临时 `// @ts-expect-error`（若任务 0 用了）；确保 MiMo 下行为不变、Mistral 下开启默认档推理。

**设计**：纯机械替换，`generate` 签名/返回不变。无需改 catch 块（错误行为一致）。

**TDD 测试用例**：

- T6.1：全局 grep 确认 `server/index.ts` 的 6 处调用已全部改为 `{ reasoning: true }`，且无任何 `{ thinking:` 残留。
- T6.2：`npm run lint` 通过（`thinking` 字段已不存在于调用层）。
- T6.3：现有 API 集成测试（`api.test.ts` 等）无回归。

**验收标准**：

- [x] `server/index.ts` 6 处调用全部改为 `{ reasoning: true }`。
- [x] 无残留 `thinking` 字段引用（全局 grep 确认）。
- [x] `npm run lint` 通过；`npm test` 中后端相关测试通过。

### 任务 7：测试迁移与清理

**目标**：删除已失效的 `mimo.test.ts`、`openai-compat.test.ts`；保留并适配 `types.test.ts`（任务 0）、`index.test.ts`（任务 4）；`negotiate.test.ts`/`response.test.ts`/`provider.test.ts` 已随对应任务建立。最终全量测试绿。

**TDD 测试用例**：

- T7.1：`npx vitest run server/llm` 全绿（types/negotiate/response/provider/index 共 5 个文件）。
- T7.2：`npm test` 全量（含 UI）除历史已知失败的 4 个 `HistoryList.test.tsx` 外全绿。

**验收标准**：

- [x] `mimo.test.ts`、`openai-compat.test.ts` 已删除。
- [x] LLM 模块测试文件为 `types/negotiate/response/provider/index` 五个，覆盖协商、解析、通用 Provider、工厂。
- [x] `npm run lint` 与 `npm test` 通过（历史 4 个 UI 失败除外，与本次无关）。

### 任务 8：端到端验证

**目标**：MiMo 行为回归 + Mistral reasoning 实测（需有效 key）。

**设计**：手动 curl / 前端发起精炼请求。

**TDD / 验证用例**：

- T8.1：`LLM_PROVIDER=mimo` + 有效 key → 精炼流程正常，响应含正确答案（思考在 reasoning_content，对外不可见）。
- T8.2：`LLM_PROVIDER=mistral` + 有效 key → 精炼流程正常，`reasoning_effort` 按 `LLM_REASONING_DEFAULT`（默认 high）发送；可选指定 `medium` 验证档位生效。
- T8.3：Mistral 下 `LLM_TEMPERATURE=0` 不导致 400（avoid-zero 兜底）。

**验收标准**：

- [ ] MiMo 端到端回归通过。
- [ ] Mistral 端到端 reasoning 通过（待用户最终验收，需有效 API key）。
- [ ] Mistral + temperature 0 不报 400。

---

## 4. TDD 流程约定

每个任务严格：

1. **Red**：先写测试（预期失败 / 类型错误）。
2. **Green**：写最小实现让测试通过。
3. **Refactor**：重构优化（如合并重复、提取常量）。
4. **Review**：逐条核对本节"验收标准"全部满足，再进入下一任务。

测试运行：`npx vitest run server/llm/<file>.test.ts`；全量：`npm test`；类型/lint：`npm run lint`（`tsc --noEmit`）。

---

## 5. 文件变更清单

| 文件 | 变更 | 说明 |
| --- | --- | --- |
| `server/llm/types.ts` | 修改 | 新增 Reasoning* 类型；`GenerateOptions.thinking` → `reasoning`；`ProviderConfig` 新增可选 `reasoningDefault`；`loadProviderConfig` 读取并校验 `LLM_REASONING_DEFAULT`；保留 `LLMProvider` |
| `server/llm/registry.ts` | 新增 | 导出 `PROVIDERS`（7 个 provider 双声明） |
| `server/llm/negotiate.ts` | 新增 | `resolveReasoning` 纯函数 |
| `server/llm/response.ts` | 新增 | `extractAnswer` 纯函数 |
| `server/llm/provider.ts` | 新增 | `RegistryProvider` 通用 Provider（取代基类+子类） |
| `server/llm/index.ts` | 修改 | 工厂查表返回 `RegistryProvider`；删除子类导入 |
| `server/llm/mimo.ts` | **删除** | 逻辑并入 `RegistryProvider` + 登记表 |
| `server/llm/openai-compat.ts` | **删除** | 同上 |
| `server/llm/types.test.ts` | 修改 | 新增登记表/类型测试 |
| `server/llm/negotiate.test.ts` | 新增 | 协商单测 |
| `server/llm/response.test.ts` | 新增 | 解析单测 |
| `server/llm/provider.test.ts` | 新增 | 通用 Provider 单测 |
| `server/llm/index.test.ts` | 重写 | 工厂查表单测 |
| `server/llm/mimo.test.ts` | **删除** | 类已不存在 |
| `server/llm/openai-compat.test.ts` | **删除** | 类已不存在 |
| `server/index.ts` | 修改 | 6 处 `{thinking:true}` → `{reasoning:true}` |
| `.env.example` | 修改 | 新增 Mistral 接入说明 + `LLM_REASONING_DEFAULT` |

**不变更**：`src/db.ts`、`src/utils/auth.ts`、前端代码、`vite.config.ts`、`tsconfig.json`、`scripts/*`、`package.json`（脚本不变）。

---

## 6. 风险与已知限制

1. **多轮回传未保留思考块**：当前 `server/index.ts` 每轮只回传最终答案文本，未回传 MiMo 的 `reasoning_content` 或 Mistral 的 thinking chunk。官方文档建议保留以保证多轮推理质量。本期**不改变**该行为（属独立优化，且当前 6 阶段流水线每阶段独立），列为后续任务。
2. **`reasoning:"none"` vs 不传**：Mistral 不传 `reasoning_effort` 即不推理；传 `"none"` 显式关闭，行为等价。协商对 `intent=false` 发 `"none"`，无副作用。
3. **历史 UI 测试**：现有 4 个 `HistoryList.test.tsx` 在第一代即失败（组件与测试不同步），与本次改动无关，不纳入本期验收阻塞项。
4. **API key 安全**：Mistral key 仅从环境变量 `LLM_API_KEY` 读取，不硬编码、不写入源码（用户已创建 key，接入时配置到 `.env`，不出现在代码或本仓库）。
5. **构建产物需重建**：仓库 `dist/` 为旧代码编译结果（含 `MimoProvider` / `OpenAICompatibleProvider`）。重构后若以 `dist` 产物部署运行，需重新 `npm run build` 刷新，否则会用旧逻辑；开发与 `npm test` 均基于 `src`，不受影响。

---

## 7. 向后兼容与迁移

- **MiMo 用户**：`.env` 无需改动（`LLM_PROVIDER=mimo` 等保持不变），行为零变化。
- **切换到 Mistral**：`.env` 改为 `LLM_PROVIDER=mistral` / `LLM_API_KEY=<key>` / `LLM_BASE_URL=https://api.mistral.ai/v1` / `LLM_MODEL=mistral-medium-3-5`；可选 `LLM_REASONING_DEFAULT=high`（环境级覆盖 effort 兜底档，须为 none/minimal/low/medium/high/xhigh 之一，非法值启动即报错）。重启生效，无需改代码。
- **调用层**：`{ thinking: true }` 语义等价于 `{ reasoning: true }`，6 处替换无行为变化。
- **数据库 / API / 前端**：无变化。
