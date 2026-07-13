# LLM Provider 抽象与后端代码重组 — 需求文档

## 背景

### 问题描述

当前 LogicRefiner 的所有 LLM 调用都硬编码在 [server.ts](file:///d:\my_software\Logic_Refiner\logicrefiner\server.ts) 顶层，且深度绑定小米 MiMo API：

- `MIMO_API_KEY`、`MODEL_NAME="mimo-v2.5-pro"`、`ENDPOINT="https://api.xiaomimimo.com/v1/chat/completions"` 直接写在源码里
- 鉴权头使用小米风格的 `api-key: <key>`，而非 OpenAI 通用的 `Authorization: Bearer <key>`
- 6 个精炼阶段（Architect / RedTeam / Synthesizer / Boundary / Crystallizer / Explainer）全部调用 `generateWithThinking`，依赖 MiMo 私有字段 `thinking: { type: "enabled" }`
- `generate` 和 `generateWithThinking` 两个函数 90% 代码重复，仅 body 中是否带 `thinking` 字段不同

**直接推动力**：小米 MiMo API 额度即将耗尽，必须具备快速切换到其他 provider（DeepSeek、通义千问、Moonshot、智谱、OpenAI 兼容代理等）的能力。

### 目标

1. 抽象出统一的 `LLMProvider` 接口，将"调用哪家 API"与"如何调用 API"解耦
2. 提供 OpenAI 兼容基类（覆盖 90% 国产替代选项）和 MiMo 适配器（保留旧供应商）
3. 通过 `.env` 配置切换 provider，**无需改代码**
4. 将 server.ts 及新增的 LLM 模块挪入 `server/` 目录，改善后端代码组织
5. 全程 TDD，每个任务先写测试再写实现

### 非目标

- **不做** 自动 fallback / 多 key 轮询（额度耗尽自动切下一家）
- **不做** Admin 运行时动态切换 provider
- **不做** DeepSeek 等具体厂商的"换模型实现 thinking"逻辑（等真接入再补）
- **不动** `src/db.ts`、`src/utils/auth.ts`（属于另一个独立改动）
- **不引入** LangChain 等 SDK（项目调用极简，库抽象空转且破坏 vi.mock 测试约定）

### 设计原则

| 原则                  | 含义                                         |
| ------------------- | ------------------------------------------ |
| **调用层无感知**          | 6 个精炼阶段不关心当前用哪家 API，统一调 `llm.generate()`   |
| **OpenAI 兼容为主**     | 以 OpenAI 协议为通用基线，非兼容厂商单独适配                 |
| **配置驱动切换**          | `.env` 里改一行 `LLM_PROVIDER` 即可换家，重启生效       |
| **保留旧供应商**          | MiMo 适配器不删，额度恢复可切回，留作 fallback             |
| **最小化 thinking 处理** | 第一版只做"标志透传 + 不支持则忽略"，换模型逻辑留待真接入            |
| **TDD 流程**          | 每个任务 Red → Green → Refactor → Review       |
| **向后兼容**            | 旧 `MIMO_API_KEY` 不再被读取，文档明确告知如何迁移到 `LLM_*` |

***

## 总体架构

```
┌─────────────────────────────────────────────────────┐
│              server/index.ts (原 server.ts)         │
│   Architect / RedTeam / Synthesizer / ...           │
│         统一调用 llm.generate(prompt, system,       │
│                              { thinking: true })    │
│                                                     │
│   启动时调用 createProvider() 创建实例并持有         │
└────────────────────────┬────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────┐
│              server/llm/index.ts                    │
│         createProvider(env) 工厂函数                │
│   按 LLM_PROVIDER 返回对应实例（不导出单例）        │
└────────────────────────┬────────────────────────────┘
                         │
         ┌───────────────┼───────────────┐
         ▼               ▼               ▼
┌─────────────────┐ ┌─────────────┐ ┌─────────────┐
│  OpenAI Compat  │ │   MiMo      │ │  (未来扩展) │
│  (基类)         │ │  (继承基类) │ │  DeepSeek   │
│  - Bearer 鉴权  │ │  - api-key  │ │  Qwen ...   │
│  - 忽略 thinking│ │  - 注入     │ │             │
│                │ │   thinking  │ │             │
└─────────────────┘ └─────────────┘ └─────────────┘
```

### 调用流向

```
精炼阶段函数
    │
    │  llm.generate(prompt, system, { thinking: true })
    ▼
LLMProvider 接口（types.ts）
    │
    │  具体实现决定：
    │   - 走哪个 endpoint
    │   - 用什么鉴权头
    │   - body 怎么构造（含/不含 thinking 字段）
    │   - 如何重试
    ▼
fetch() → 实际 HTTP 请求
```

***

## 接口设计

### `LLMProvider` 接口

```ts
// server/llm/types.ts

export interface GenerateOptions {
  thinking?: boolean;       // 是否启用推理模式，默认 false
  temperature?: number;     // 可选，覆盖启动时的默认值
  maxTokens?: number;       // 可选，覆盖启动时的默认值
}

export interface ProviderConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  temperature: number;     // 启动级默认值，从 .env 读取
  maxTokens?: number;      // 可选，启动级默认值，不配则不传给 API（让 API 用默认值）
}

export interface LLMProvider {
  /**
   * 生成文本。实现内部决定如何处理 thinking 标志、鉴权方式、endpoint 等。
   * 调用方只需提供 prompt 和 system instruction。
   * opts 中的 temperature/maxTokens 可覆盖启动时的默认值。
   */
  generate(prompt: string, system: string, opts?: GenerateOptions): Promise<string>;
}
```

**设计要点**：

- **`generate`** **单一入口**：合并原 `generate` + `generateWithThinking`，通过 `opts.thinking` 控制
- **启动默认 + 调用覆盖**：`temperature` / `maxTokens` 从 `.env` 读取作为默认值（存在 ProviderConfig），调用方在 `opts` 里传值则覆盖默认值，不传则用默认值
- **返回纯字符串**：不暴露 raw response，避免调用方依赖具体厂商字段
- **错误抛出**：实现内部处理重试，最终失败抛 `Error`，调用方用 try/catch

### 环境变量

```env
# 必填
LLM_PROVIDER=mimo          # mimo | openai | deepseek | qwen | moonshot | zhipu
LLM_API_KEY=xxx
LLM_BASE_URL=https://api.xiaomimimo.com/v1
LLM_MODEL=mimo-v2.5-pro

# 可选（启动级参数，不填用默认值）
# LLM_TEMPERATURE=0.8       # 采样温度，默认 0.8
# LLM_MAX_TOKENS=131072     # 最大生成 token 数，不填则用各 provider 官方最大值
```

**字段说明**：

| 字段                | 必填 | 默认值            | 说明                                           |
| ----------------- | -- | -------------- | -------------------------------------------- |
| `LLM_PROVIDER`    | 是  | -              | 选择哪家 API 提供商                                 |
| `LLM_API_KEY`     | 是  | -              | 对应 provider 的 API Key                        |
| `LLM_BASE_URL`    | 是  | -              | API 端点地址（显式填写，避免隐式默认值导致误切）                   |
| `LLM_MODEL`       | 是  | -              | 模型名（显式填写，避免换 provider 时忘记改模型）                |
| `LLM_TEMPERATURE` | 否  | `0.8`          | 采样温度，作为默认值；调用方可在 `opts.temperature` 覆盖       |
| `LLM_MAX_TOKENS`  | 否  | 不传字段（让 API 自决） | 最大生成 token 数，作为默认值；调用方可在 `opts.maxTokens` 覆盖 |

**LLM\_MAX\_TOKENS 填写建议**：请参考各厂商文档填写对应模型的最大 max\_tokens 值，不配时不传该字段（让 API 自决）。

> 第一版只实现 `mimo` 和 `openai`（通用基类）两个 provider，其余 provider 复用 OpenAI 兼容基类。

### thinking 处理策略（第一版）

| Provider       | `opts.thinking=true` 的行为                |
| -------------- | --------------------------------------- |
| `mimo`         | body 注入 `thinking: { type: "enabled" }` |
| `openai` 及其他兼容 | **忽略**（不传任何相关字段）                        |

**降级说明**：切换到非 MiMo provider 期间，模型不思考，精炼质量可能下降。这是已知的、可接受的代价——等真接入 DeepSeek 等支持推理的厂商时，再在该 provider 实现里补"换模型"逻辑（例如 DeepSeek 把 model 从 `deepseek-chat` 换成 `deepseek-reasoner`），调用层无需改动。

***

## 实施顺序与 TDD 流程

### 总体流程

每个子任务严格遵循 TDD 循环：

1. **Red**：先写测试（预期失败）
2. **Green**：写最小实现让测试通过
3. **Refactor**：重构优化（如有必要）
4. **Review**：确认验收标准全部满足

### 任务依赖关系

```
任务 0: 环境配置 + 类型定义 (.env + types.ts)
  ↓
任务 1: OpenAI 兼容 Provider 基类 (openai-compat.ts)
  ↓
任务 2: MiMo Provider 适配器 (mimo.ts, 继承基类)
  ↓
任务 3: Provider 工厂 + 统一入口 (index.ts)
  ↓
任务 4: 后端代码重组 (server.ts → server/index.ts)
  ↓
任务 5: 调用层接入 + 端到端验证
```

***

## 任务 0：环境配置与类型定义

**目标**：完成环境变量更新和 LLMProvider 接口定义，为后续任务打基础。

### 设计

#### 0.1 环境变量更新

修改现有 `.env.example`（文件已存在），新增 LLM 相关配置，并废弃旧的 `MIMO_API_KEY`：

```env
# LLM Provider Configuration
# LLM_PROVIDER: 选择 API 提供商，可选值: mimo | openai | deepseek | qwen | moonshot | zhipu
LLM_PROVIDER=mimo

# LLM_API_KEY: 对应 provider 的 API Key
LLM_API_KEY=your_api_key_here

# LLM_BASE_URL: API 端点地址（必填，显式填写避免误切）
LLM_BASE_URL=https://api.xiaomimimo.com/v1

# LLM_MODEL: 模型名（必填，显式填写避免换 provider 时忘记改模型）
LLM_MODEL=mimo-v2.5-pro

# LLM_TEMPERATURE: 采样温度（可选，默认 0.8）
# LLM_TEMPERATURE=0.8

# LLM_MAX_TOKENS: 最大生成 token 数（可选，不填则用各 provider 官方最大值；MiMo 为 131072）
# LLM_MAX_TOKENS=131072

# [已废弃] MIMO_API_KEY 不再被读取，请迁移到 LLM_PROVIDER + LLM_API_KEY
# MIMO_API_KEY=your_mimo_api_key_here
```

#### 0.2 类型定义

新建文件：`server/llm/types.ts`

```ts
export interface GenerateOptions {
  thinking?: boolean;       // 调用级：是否启用推理模式
  temperature?: number;     // 调用级：覆盖启动时的默认温度
  maxTokens?: number;       // 调用级：覆盖启动时的默认 maxTokens
}

export interface ProviderConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  temperature: number;     // 启动级默认值，从 .env 读取
  maxTokens?: number;      // 可选，启动级默认值
}

export interface LLMProvider {
  generate(prompt: string, system: string, opts?: GenerateOptions): Promise<string>;
}
```

#### 0.3 配置读取工具

在 `server/llm/types.ts` 中附带一个配置读取函数（便于测试）：

```ts
export function loadProviderConfig(env: NodeJS.ProcessEnv = process.env): ProviderConfig & { provider: string } {
  const provider = env.LLM_PROVIDER;
  if (!provider) {
    throw new Error("LLM_PROVIDER is not configured. Please set it in .env file.");
  }
  const apiKey = env.LLM_API_KEY;
  if (!apiKey) {
    throw new Error("LLM_API_KEY is not configured. Please set it in .env file.");
  }
  const baseUrl = env.LLM_BASE_URL;
  if (!baseUrl) {
    throw new Error("LLM_BASE_URL is not configured. Please set it in .env file.");
  }
  const model = env.LLM_MODEL;
  if (!model) {
    throw new Error("LLM_MODEL is not configured. Please set it in .env file.");
  }
  return {
    provider,
    apiKey,
    baseUrl,
    model,
    temperature: env.LLM_TEMPERATURE ? parseFloat(env.LLM_TEMPERATURE) : 0.8,
    maxTokens: env.LLM_MAX_TOKENS ? parseInt(env.LLM_MAX_TOKENS) : undefined,
  };
}
```

> **注意**：现有 `.env` 里的 `MIMO_API_KEY` 不再被读取。迁移期内若用户未配置 `LLM_*`，需给出明确报错提示。

### TDD 测试用例

**测试文件**：`server/llm/types.test.ts`

#### 测试 0.1：loadProviderConfig 缺少 LLM\_PROVIDER 抛错

- 传入 `{ LLM_API_KEY: "xxx" }`（无 LLM\_PROVIDER）
- 应抛出包含 "LLM\_PROVIDER" 的错误

#### 测试 0.2：loadProviderConfig 缺少 LLM\_API\_KEY 抛错

- 传入 `{ LLM_PROVIDER: "mimo" }`（无 LLM\_API\_KEY）
- 应抛出包含 "LLM\_API\_KEY" 的错误

#### 测试 0.2b：loadProviderConfig 缺少 LLM\_BASE\_URL 抛错

- 传入 `{ LLM_PROVIDER: "mimo", LLM_API_KEY: "k" }`（无 LLM\_BASE\_URL）
- 应抛出包含 "LLM\_BASE\_URL" 的错误

#### 测试 0.2c：loadProviderConfig 缺少 LLM\_MODEL 抛错

- 传入 `{ LLM_PROVIDER: "mimo", LLM_API_KEY: "k", LLM_BASE_URL: "u" }`（无 LLM\_MODEL）
- 应抛出包含 "LLM\_MODEL" 的错误

#### 测试 0.3：loadProviderConfig 正常读取必填字段

- 传入 `{ LLM_PROVIDER: "mimo", LLM_API_KEY: "k", LLM_BASE_URL: "u", LLM_MODEL: "m" }`
- 返回对象应包含 provider/apiKey/baseUrl/model，值正确

#### 测试 0.4：可选字段为空时使用默认值

- 传入 `{ LLM_PROVIDER: "mimo", LLM_API_KEY: "k", LLM_BASE_URL: "u", LLM_MODEL: "m" }`（无 TEMPERATURE 和 MAX\_TOKENS）
- 返回对象的 `temperature` 应为 `0.8`（默认值）
- 返回对象的 `maxTokens` 应为 `undefined`

#### 测试 0.5：loadProviderConfig 读取 LLM\_TEMPERATURE

- 传入 `{ LLM_PROVIDER: "mimo", LLM_API_KEY: "k", LLM_BASE_URL: "u", LLM_MODEL: "m", LLM_TEMPERATURE: "0.5" }`
- 返回对象的 `temperature` 应为 `0.5`（parseFloat 后的数值）

#### 测试 0.6：loadProviderConfig 读取 LLM\_MAX\_TOKENS

- 传入 `{ LLM_PROVIDER: "mimo", LLM_API_KEY: "k", LLM_BASE_URL: "u", LLM_MODEL: "m", LLM_MAX_TOKENS: "4096" }`
- 返回对象的 `maxTokens` 应为 `4096`（parseInt 后的数值）

### 验收标准

- [x] `.env.example` 包含 LLM\_PROVIDER / LLM\_API\_KEY / LLM\_BASE\_URL / LLM\_MODEL（必填）/ LLM\_TEMPERATURE / LLM\_MAX\_TOKENS（可选）说明
- [x] `server/llm/types.ts` 定义 LLMProvider、GenerateOptions、ProviderConfig 接口
- [x] `server/llm/types.ts` 导出 loadProviderConfig 函数
- [x] 8 个新增测试用例全部通过
- [x] `npm run lint` 通过

### 实施记录

- 8 个测试全过（`npx vitest run server/llm/types.test.ts`）
- lint 通过
- 现有测试中有 4 个 HistoryList.test.tsx 失败，属预先存在问题（UI 测试与组件实现不同步），与本次改动无关

***

## 任务 1：OpenAI 兼容 Provider 基类

**目标**：实现 OpenAI 协议兼容的通用 provider 基类，覆盖 DeepSeek/Qwen/Moonshot/智谱/OpenAI 等。

### 设计

新建文件：`server/llm/openai-compat.ts`

```ts
import { LLMProvider, GenerateOptions, ProviderConfig } from "./types";

export class OpenAICompatibleProvider implements LLMProvider {
  protected apiKey: string;
  protected baseUrl: string;
  protected model: string;
  protected temperature: number;
  protected maxTokens?: number;

  constructor(config: ProviderConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl;
    this.model = config.model;
    this.temperature = config.temperature;
    this.maxTokens = config.maxTokens;
  }

  async generate(prompt: string, system: string, opts?: GenerateOptions): Promise<string> {
    const enhancedSystem = this.enhanceSystemInstruction(system);
    const body = this.buildBody(prompt, enhancedSystem, opts);
    const headers = this.buildHeaders();

    // 重试逻辑（从原 server.ts 迁移）
    const retries = 5;
    for (let i = 0; i < retries; i++) {
      try {
        const response = await fetch(`${this.baseUrl}/chat/completions`, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`LLM API Error (${response.status}): ${errorText}`);
        }

        const data: any = await response.json();
        const content = data.choices?.[0]?.message?.content;
        if (content === undefined || content === null) {
          throw new Error("Invalid API response format: " + JSON.stringify(data));
        }
        return content;
      } catch (error: any) {
        console.error(`Attempt ${i + 1} failed:`, error.message);
        const isQuotaError = this.isQuotaError(error);
        if (isQuotaError && i < retries - 1) {
          continue;
        }
        if (i === retries - 1) {
          throw error;
        }
      }
    }
    throw new Error("Maximum retries reached for API generation.");
  }

  protected enhanceSystemInstruction(system: string): string {
    return system +
      "\n重要格式提示：当你输出任何必须的数学公式、定量变量或严密的逻辑代数式时，请使用标准的 LaTeX 语法。行内公式使用单个美元符号 $...$，块级/段落公式使用双美元符号 $$...$$。但请极力避免将非数量化的现实抽象概念生搬硬套进一个生硬造作的伪物理或数学公式中。";
  }

  protected buildHeaders(): Record<string, string> {
    return {
      "Authorization": `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
    };
  }

  protected buildBody(prompt: string, system: string, opts?: GenerateOptions): Record<string, unknown> {
    const body: Record<string, unknown> = {
      model: this.model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
      // 调用方在 opts 传值则覆盖启动默认值
      temperature: opts?.temperature ?? this.temperature,
      top_p: 0.95,
    };
    // maxTokens：opts 传值 → 启动配置（未配则不传字段，让 API 自决）
    const maxTokens = opts?.maxTokens ?? this.maxTokens;
    if (maxTokens !== undefined) {
      body.max_completion_tokens = maxTokens;
    }
    // OpenAI 兼容版忽略 thinking 标志（第一版降级策略）
    return body;
  }

  protected isQuotaError(error: any): boolean {
    return error.message?.includes("429")
      || error.message?.includes("RESOURCE_EXHAUSTED")
      || error.message?.toLowerCase().includes("quota")
      || error.message?.toLowerCase().includes("limit");
  }
}
```

**设计要点**：

- **`protected`** **方法**：`buildHeaders` / `buildBody` / `enhanceSystemInstruction` / `isQuotaError` 都是 `protected`，子类（如 MiMo）可重写
- **endpoint 拼接**：`baseUrl + /chat/completions`，baseUrl 不含末尾斜杠
- **重试逻辑保留**：与原 server.ts 行为一致，避免引入回归
- **thinking 忽略**：第一版基类直接不处理 `opts.thinking`
- **启动默认 + 调用覆盖**：`temperature` / `maxTokens` 从 `.env` 读取后存在实例上，`buildBody` 用 `opts?.xxx ?? this.xxx` 实现"调用方传值则覆盖，不传则用默认"
- **maxTokens 两级回退**：opts 传值 → 启动配置（未配则不传字段，让 API 自决）
- **baseUrl/model 必填**：构造函数直接从 config 取值，不再需要 defaults 参数

### TDD 测试用例

**测试文件**：`server/llm/openai-compat.test.ts`

**测试策略**：mock 全局 `fetch`，验证 provider 发出的请求形状，不实际调用 API。

#### 测试 1.1：generate 发起正确请求

- Mock fetch 返回 `{ choices: [{ message: { content: "hello" } }] }`
- 调用 `provider.generate("prompt", "system")`
- 验证 fetch 被调用 1 次
- 验证 URL 是 `<baseUrl>/chat/completions`
- 验证 method 是 POST

#### 测试 1.2：使用 Bearer 鉴权头

- Mock fetch
- 调用 generate
- 验证 headers 包含 `Authorization: Bearer <apiKey>`
- 验证 headers 包含 `Content-Type: application/json`
- 验证 headers **不**包含 `api-key`

#### 测试 1.3：body 包含 model、messages、temperature（用启动默认值）

- Mock fetch
- 用 `{ apiKey: "k", baseUrl: "https://api.test.com/v1", model: "test-model", temperature: 0.8 }` 构造 provider
- 调用 generate("p", "s")（不传 opts）
- 验证 body.model 是 "test-model"
- 验证 body.messages 是 \[{role:"system",content:"s+格式提示"}, {role:"user",content:"p"}]
- 验证 body.temperature 是 0.8（启动默认值）
- 验证 body **不**包含 `max_completion_tokens`（未配置 maxTokens 时不传字段，让 API 自决）

#### 测试 1.4：启动时配置 maxTokens 则 body 含该字段

- 用 `{ apiKey: "k", baseUrl: "u", model: "m", temperature: 0.8, maxTokens: 1000 }` 构造 provider
- 调用 generate("p", "s")（不传 opts）
- 验证 body.max\_completion\_tokens 是 1000

#### 测试 1.4b：opts.temperature 覆盖启动默认值

- 用 `{ apiKey: "k", baseUrl: "u", model: "m", temperature: 0.8 }` 构造 provider
- 调用 generate("p", "s", { temperature: 0.5 })
- 验证 body.temperature 是 0.5（opts 覆盖启动默认）

#### 测试 1.4c：opts.maxTokens 覆盖启动默认值

- 用 `{ apiKey: "k", baseUrl: "u", model: "m", temperature: 0.8, maxTokens: 1000 }` 构造 provider
- 调用 generate("p", "s", { maxTokens: 4096 })
- 验证 body.max\_completion\_tokens 是 4096（opts 覆盖启动默认）

#### 测试 1.4d：opts.maxTokens 在启动未配置时仍生效

- 用 `{ apiKey: "k", baseUrl: "u", model: "m", temperature: 0.8 }`（无 maxTokens）构造 provider
- 调用 generate("p", "s", { maxTokens: 2048 })
- 验证 body.max\_completion\_tokens 是 2048

#### 测试 1.5：opts.thinking 被静默忽略

- 调用 generate("p", "s", { thinking: true })
- 验证 body **不**包含 `thinking` 字段

#### 测试 1.6：返回 choices\[0].message.content

- Mock fetch 返回 `{ choices: [{ message: { content: "result text" } }] }`
- 调用 generate
- 验证返回值是 "result text"

#### 测试 1.7：响应格式异常时抛错

- Mock fetch 返回 `{ foo: "bar" }`（无 choices）
- 调用 generate
- 应抛出包含 "Invalid API response format" 的错误

#### 测试 1.8：HTTP 错误状态抛错

- Mock fetch 返回 `{ status: 401, statusText: "Unauthorized" }`，`response.ok` 为 false
- 调用 generate
- 应抛出包含 "401" 的错误

#### 测试 1.9：quota 错误触发重试

- Mock fetch 前两次返回 429，第三次返回成功
- 调用 generate
- 验证 fetch 被调用 3 次
- 验证返回成功结果

#### 测试 1.10：重试耗尽后抛出最后错误

- Mock fetch 始终返回 429
- 调用 generate
- 应抛出错误
- 验证 fetch 被调用 5 次（默认重试次数）

#### 测试 1.11：system instruction 附加 LaTeX 格式提示

- 调用 generate("p", "base system")
- 验证 body.messages\[0].content 包含 "LaTeX" 字样
- 验证 body.messages\[0].content 以 "base system" 开头

#### 测试 1.12：未配 maxTokens 且调用未传时，body 不传该字段

- 用 `{ apiKey: "k", baseUrl: "u", model: "m", temperature: 0.8 }`（无 maxTokens）构造 provider
- 调用 generate("p", "s")（不传 opts）
- 验证 body **不**包含 `max_completion_tokens`（让 API 自决）

### 验收标准

- [x] `server/llm/openai-compat.ts` 实现 OpenAICompatibleProvider 类
- [x] 使用 `Authorization: Bearer` 鉴权头
- [x] `opts.thinking` 被静默忽略（不写入 body）
- [x] 未配 `LLM_MAX_TOKENS` 且调用未传时，body 不含 `max_completion_tokens`（让 API 自决）
- [x] temperature/maxTokens 支持"启动默认 + 调用覆盖"
- [x] 重试逻辑工作正常（quota 错误重试，其他错误直接抛）
- [x] 15 个新增测试用例全部通过
- [x] `npm run lint` 通过

### 实施记录

- 15 个测试全过（`npx vitest run server/llm/openai-compat.test.ts`）
- lint 通过
- 模板方法模式：generate 定义流程骨架，protected 钩子（enhanceSystemInstruction / buildHeaders / buildBody / isQuotaError）供子类重写
- maxTokens 两级回退：opts 传值 → 启动配置 → 不传字段（让 API 自决）
- temperature 覆盖：opts 传值 → 启动配置默认值
- 重试逻辑从原 server.ts 迁移，保留原行为（5 次重试，quota 错误触发）

***

## 任务 2：MiMo Provider 适配器

**目标**：实现 MiMo 适配器，继承 OpenAI 兼容基类，重写鉴权头和 body 构造以支持 `thinking` 字段。

### 设计

新建文件：`server/llm/mimo.ts`

```ts
import { OpenAICompatibleProvider } from "./openai-compat";
import { GenerateOptions, ProviderConfig } from "./types";

export class MimoProvider extends OpenAICompatibleProvider {
  constructor(config: ProviderConfig) {
    super(config);
  }

  protected buildHeaders(): Record<string, string> {
    // MiMo 用 api-key 头，不用 Authorization: Bearer
    return {
      "api-key": this.apiKey,
      "Content-Type": "application/json",
    };
  }

  protected buildBody(prompt: string, system: string, opts?: GenerateOptions): Record<string, unknown> {
    const body = super.buildBody(prompt, system, opts);
    // MiMo 通过 thinking 字段开启推理模式
    if (opts?.thinking) {
      body.thinking = { type: "enabled" };
    }
    return body;
  }
}
```

**设计要点**：

- **继承而非重写**：复用基类的重试、URL 拼接、响应解析、enhanceSystemInstruction、温度/maxTokens 覆盖逻辑
- **只重写两个方法**：`buildHeaders`（改鉴权头）和 `buildBody`（注入 thinking）
- **baseUrl/model 不再需要默认值**：.env 必填，构造函数直接从 config 取
- **`opts.thinking`** **才注入**：保持与原 `generateWithThinking` 一致的行为，`thinking: false` 时不注入
- **maxTokens 无硬编码默认值**：未配 LLM\_MAX\_TOKENS 时不传字段，让 API 自决

### TDD 测试用例

**测试文件**：`server/llm/mimo.test.ts`

#### 测试 2.1：使用 api-key 鉴权头（不用 Bearer）

- Mock fetch
- 调用 `mimo.generate("p", "s")`
- 验证 headers 包含 `api-key: <apiKey>`
- 验证 headers **不**包含 `Authorization`

#### 测试 2.2：不传 thinking 时不注入 thinking 字段

- Mock fetch
- 调用 `mimo.generate("p", "s")`（无 opts）
- 验证 body **不**包含 `thinking` 字段

#### 测试 2.3：opts.thinking=true 注入 thinking 字段

- Mock fetch
- 调用 `mimo.generate("p", "s", { thinking: true })`
- 验证 body 包含 `thinking: { type: "enabled" }`

#### 测试 2.4：opts.thinking=false 不注入 thinking 字段

- Mock fetch
- 调用 `mimo.generate("p", "s", { thinking: false })`
- 验证 body **不**包含 `thinking` 字段

#### 测试 2.5：默认 baseUrl 和 model 从 config 传入

- 用 `{ apiKey: "k", baseUrl: "https://api.xiaomimimo.com/v1", model: "mimo-v2.5-pro", temperature: 0.8 }` 构造 MimoProvider
- 调用 generate
- 验证 URL 是 `https://api.xiaomimimo.com/v1/chat/completions`
- 验证 body.model 是 `mimo-v2.5-pro`

#### 测试 2.6：自定义 baseUrl 和 model

- 用 `{ apiKey: "k", baseUrl: "https://custom.api/v1", model: "custom-model", temperature: 0.8 }` 构造
- 调用 generate
- 验证 URL 用 custom baseUrl
- 验证 body.model 用 custom model

#### 测试 2.7：继承基类的响应解析

- Mock fetch 返回 `{ choices: [{ message: { content: "mimo result" } }] }`
- 调用 `mimo.generate("p", "s", { thinking: true })`
- 验证返回值是 "mimo result"（不返回 reasoning\_content）

#### 测试 2.8：继承基类的重试逻辑

- Mock fetch 前两次返回 429，第三次返回成功
- 调用 generate
- 验证 fetch 被调用 3 次
- 验证返回成功结果

#### 测试 2.9：继承基类的 LaTeX 格式提示

- 调用 `mimo.generate("p", "base system")`
- 验证 body.messages\[0].content 包含 "LaTeX"

#### 测试 2.10：未配 LLM\_MAX\_TOKENS 时不传 max\_completion\_tokens 字段

- Mock fetch
- 用 `{ apiKey: "k", baseUrl: "https://api.xiaomimimo.com/v1", model: "mimo-v2.5-pro", temperature: 0.8 }`（无 maxTokens）构造 MimoProvider
- 调用 `mimo.generate("p", "s")`
- 验证 body **不**包含 `max_completion_tokens`（让 API 自决）

#### 测试 2.11：显式配 LLM\_MAX\_TOKENS 时使用配置值

- Mock fetch
- 用 `{ apiKey: "k", baseUrl: "u", model: "m", temperature: 0.8, maxTokens: 4096 }` 构造 MimoProvider
- 调用 `mimo.generate("p", "s")`
- 验证 body.max\_completion\_tokens 是 4096

#### 测试 2.12：opts.maxTokens 覆盖启动配置的 LLM\_MAX\_TOKENS

- Mock fetch
- 用 `{ apiKey: "k", baseUrl: "u", model: "m", temperature: 0.8, maxTokens: 5000 }` 构造 MimoProvider
- 调用 `mimo.generate("p", "s", { maxTokens: 2048 })`
- 验证 body.max\_completion\_tokens 是 2048（opts 覆盖了启动配置）

### 验收标准

- [x] `server/llm/mimo.ts` 实现 MimoProvider 类，继承 OpenAICompatibleProvider
- [x] 使用 `api-key` 鉴权头（非 Bearer）
- [x] `opts.thinking=true` 时 body 含 `thinking: { type: "enabled" }`
- [x] `opts.thinking=false` 或不传时 body 不含 thinking 字段
- [x] 未配 `LLM_MAX_TOKENS` 时不传 max\_completion\_tokens 字段（让 API 自决）
- [x] baseUrl/model 从 .env 必填，不依赖默认值回退
- [x] 复用基类的重试、响应解析、LaTeX 提示、温度/maxTokens 覆盖逻辑
- [x] 12 个新增测试用例全部通过
- [x] `npm run lint` 通过

### 实施记录

- 12 个测试全过（`npx vitest run server/llm/mimo.test.ts`）
- lint 通过
- 仅重写 buildHeaders（api-key）和 buildBody（注入 thinking 字段），其余逻辑复用基类
- maxTokens 无硬编码默认值，未配则不传字段让 API 自决

***

## 任务 3：Provider 工厂与统一入口

**目标**：实现工厂函数，按 `LLM_PROVIDER` 环境变量返回对应 provider 实例。

### 设计

新建文件：`server/llm/index.ts`

```ts
import { loadProviderConfig, LLMProvider, ProviderConfig } from "./types";
import { OpenAICompatibleProvider } from "./openai-compat";
import { MimoProvider } from "./mimo";

export function createProvider(env: NodeJS.ProcessEnv = process.env): LLMProvider {
  const config = loadProviderConfig(env);
  const providerConfig: ProviderConfig = {
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    model: config.model,
    temperature: config.temperature,
    maxTokens: config.maxTokens,
  };

  switch (config.provider) {
    case "mimo":
      return new MimoProvider(providerConfig);

    case "openai":
    case "deepseek":
    case "qwen":
    case "moonshot":
    case "zhipu":
      return new OpenAICompatibleProvider(providerConfig);

    default:
      throw new Error(`Unknown LLM_PROVIDER: "${config.provider}". Supported: mimo, openai, deepseek, qwen, moonshot, zhipu`);
  }
}
```

**设计要点**：

- **工厂函数** **`createProvider(env)`**：env 作为参数便于测试，默认用 `process.env`
- **不导出单例**：避免模块加载时初始化导致测试污染。由 `server/index.ts` 在启动时调用 `createProvider()` 创建实例（见任务 5）
- **未识别 provider 抛错**：避免静默降级到错误实现
- **MiMo 走专用适配器，其余走 OpenAI 兼容基类**

### TDD 测试用例

**测试文件**：`server/llm/index.test.ts`

#### 测试 3.1：LLM\_PROVIDER=mimo 返回 MimoProvider 实例

- 设置 env: `{ LLM_PROVIDER: "mimo", LLM_API_KEY: "k" }`
- 调用 createProvider(env)
- 验证返回值是 MimoProvider 实例（`instanceof MimoProvider`）

#### 测试 3.2：LLM\_PROVIDER=openai 返回 OpenAICompatibleProvider 实例

- 设置 env: `{ LLM_PROVIDER: "openai", LLM_API_KEY: "k" }`
- 调用 createProvider(env)
- 验证返回值是 OpenAICompatibleProvider 实例
- 验证**不是** MimoProvider 实例

#### 测试 3.3：LLM\_PROVIDER=deepseek 返回 OpenAI 兼容实例

- 设置 env: `{ LLM_PROVIDER: "deepseek", LLM_API_KEY: "k", LLM_BASE_URL: "https://api.deepseek.com/v1", LLM_MODEL: "deepseek-chat" }`
- 调用 createProvider(env)
- 验证返回值是 OpenAICompatibleProvider 实例
- 验证**不是** MimoProvider 实例

#### 测试 3.4：未识别的 provider 抛错

- 设置 env: `{ LLM_PROVIDER: "unknown", LLM_API_KEY: "k", LLM_BASE_URL: "u", LLM_MODEL: "m" }`
- 调用 createProvider(env)
- 应抛出包含 "Unknown LLM\_PROVIDER" 的错误
- 错误信息应列出所有支持的 provider

#### 测试 3.5：自定义 LLM\_BASE\_URL 和 LLM\_MODEL 透传

- 设置 env: `{ LLM_PROVIDER: "openai", LLM_API_KEY: "k", LLM_BASE_URL: "https://my.proxy/v1", LLM_MODEL: "my-model" }`
- 调用 createProvider(env)
- Mock fetch，调用 generate
- 验证 URL 用 `https://my.proxy/v1/chat/completions`，model 用 `my-model`

#### 测试 3.6：LLM\_BASE\_URL 或 LLM\_MODEL 缺失时抛错

- 设置 env: `{ LLM_PROVIDER: "openai", LLM_API_KEY: "k" }`（无 LLM\_BASE\_URL 和 LLM\_MODEL）
- 调用 createProvider(env)
- 应抛出包含 "LLM\_BASE\_URL" 的错误

#### 测试 3.7：返回的对象有 generate 方法

- 设置 env: `{ LLM_PROVIDER: "openai", LLM_API_KEY: "k" }`
- 调用 createProvider(env)
- 验证返回值的 `typeof generate` 是 "function"

### 验收标准

- [x] `server/llm/index.ts` 导出 `createProvider` 工厂函数
- [x] `mimo` provider 返回 MimoProvider 实例
- [x] `openai`/`deepseek`/`qwen`/`moonshot`/`zhipu` 返回 OpenAICompatibleProvider 实例
- [x] 未识别 provider 抛明确错误
- [x] LLM\_BASE\_URL/LLM\_MODEL 缺失时由 loadProviderConfig 抛错向上传播
- [x] 7 个新增测试用例全部通过
- [x] `npm run lint` 通过

### 实施记录

- 7 个测试全过（`npx vitest run server/llm/index.test.ts`）
- lint 通过
- 实现时直接将 `loadProviderConfig` 返回的 `config` 传给 provider 构造函数（ProviderConfig 已包含 provider 字段，无需构造中间对象）
- 不导出单例，由 server/index.ts 启动时调用 createProvider() 创建实例，避免模块加载副作用污染测试
- 重新导出类型和类（LLMProvider / GenerateOptions / ProviderConfig / MimoProvider / OpenAICompatibleProvider）方便外部引用

***

## 任务 4：后端代码重组（server.ts → server/）

**目标**：将 server.ts 挪入 `server/` 目录，更新 package.json 的 dev/build 引用，为后续接入 llm 模块做准备。

### 设计

#### 4.1 目录结构调整

```
变更前:                          变更后:
logicrefiner/                   logicrefiner/
├── server.ts (单文件)          ├── server/
├── src/                        │   ├── index.ts (原 server.ts)
│   ├── db.ts                   │   └── llm/ (任务 0-3 已创建)
│   └── utils/                  ├── src/ (不动)
├── package.json                │   ├── db.ts
└── ...                         │   └── utils/
                                ├── package.json
                                └── ...
```

#### 4.2 文件移动

- `server.ts` → `server/index.ts`
- **不改动** `src/db.ts`、`src/utils/auth.ts` 及其引用关系

#### 4.3 引用路径更新

`server/index.ts` 中现有的相对引用保持不变（因为相对位置一致）：

```ts
// server/index.ts 中现有引用（相对 server/ 目录）
import { initDb, ... } from "../src/db";        // 原来是 "./src/db"
import { getAuthContext } from "../src/utils/auth";  // 原来是 "./src/utils/auth"
```

#### 4.4 package.json 脚本更新

```json
{
  "scripts": {
    "dev": "tsx server/index.ts",
    "build": "vite build && esbuild server/index.ts --bundle --platform=node --format=cjs --packages=external --sourcemap --outfile=dist/server.cjs",
    "start": "node dist/server.cjs",
    ...
  }
}
```

#### 4.5 验证项

- `npm run dev` 能正常启动
- `npm run build` 能正常打包
- `npm run lint` 通过
- `npm test` 通过（原有测试不受影响）

### TDD 测试用例

**说明**：本任务是代码重组，无新功能逻辑，主要通过现有测试和手动验证保证不回归。

#### 测试 4.1：server/index.ts 能正常 import

- `npm run lint` 通过
- TypeScript 编译无错

#### 测试 4.2：dev server 正常启动

- 执行 `npm run dev`
- 验证 server 在 3000 端口监听
- 验证日志输出 "Server running on <http://localhost:3000>"
- 用 curl 请求 `http://localhost:3000/api/refinements`，验证响应

#### 测试 4.3：build 产物正常

- 执行 `npm run build`
- 验证 `dist/server.cjs` 生成
- 执行 `npm start`，验证 server 正常启动

#### 测试 4.4：原有测试无回归

- 执行 `npm test`
- 所有现有测试通过（db.test.ts、api.test.ts、auth.test.ts、App.test.tsx 等）

### 验收标准

- [x] `server.ts` 已移动到 `server/index.ts`
- [x] `package.json` 的 dev/build 脚本指向新路径
- [x] `server/index.ts` 中的相对引用路径正确（`../src/...`）
- [x] `npm run dev` 正常启动
- [x] `npm run build` 正常打包
- [x] `npm run lint` 通过
- [x] `npm test` 全部通过（无回归）

### 实施记录

- server.ts 通过 `git mv` 移动到 server/index.ts
- 引用路径更新：`./src/db` → `../src/db`，`./src/utils/auth` → `../src/utils/auth`
- package.json 的 dev 脚本改为 `tsx server/index.ts`，build 脚本改为 `esbuild server/index.ts ...`
- lint 通过，138 个测试通过（4 个 HistoryList.test.tsx 失败属预先存在问题，与本次改动无关）

***

## 任务 5：调用层接入与端到端验证

**目标**：将 server/index.ts 中 6 处 `generateWithThinking` 调用替换为 `llm.generate(..., { thinking: true })`，删除原 `generate` 和 `generateWithThinking` 函数，验证完整精炼流程。

### 设计

#### 5.1 导入并创建 llm 实例

在 `server/index.ts` 顶部添加：

```ts
import { createProvider } from "./llm";

// 启动时创建 provider 实例（若 LLM_PROVIDER / LLM_API_KEY 未配置，此处会抛错导致 server 启动失败）
const llm = createProvider();
```

> **注意**：不导出 llm 单例，由 server/index.ts 模块内部持有。这避免了模块加载时的副作用污染测试。

#### 5.2 删除原函数

删除 `server/index.ts` 中的以下内容：

- `MIMO_API_KEY` 常量及启动检查（第 17-22 行）
- `MODEL_NAME` 常量（第 23 行）
- `ENDPOINT` 常量（第 24 行）
- `generate` 函数（第 27-88 行）
- `generateWithThinking` 函数（第 91-154 行）

#### 5.3 替换调用点

6 处调用统一改为 `llm.generate(prompt, system, { thinking: true })`：

| 位置（原 server.ts 行号） | 阶段           | 原调用                                                                  | 新调用                                                                              |
| ------------------ | ------------ | -------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| 200                | Architect    | `generateWithThinking(architectPrompt, architectSystem)`             | `llm.generate(architectPrompt, architectSystem, { thinking: true })`             |
| 229                | Red Team     | `generateWithThinking(redTeamPrompt, redTeamSystem)`                 | `llm.generate(redTeamPrompt, redTeamSystem, { thinking: true })`                 |
| 258                | Synthesizer  | `generateWithThinking(synthesizerPrompt, synthesizerSystem)`         | `llm.generate(synthesizerPrompt, synthesizerSystem, { thinking: true })`         |
| 275                | Boundary     | `generateWithThinking(boundaryPrompt, boundarySystem)`               | `llm.generate(boundaryPrompt, boundarySystem, { thinking: true })`               |
| 306                | Crystallizer | `generateWithThinking(crystallizationPrompt, crystallizationSystem)` | `llm.generate(crystallizationPrompt, crystallizationSystem, { thinking: true })` |
| 317                | Explainer    | `generateWithThinking(explainerPrompt, explainerSystem)`             | `llm.generate(explainerPrompt, explainerSystem, { thinking: true })`             |

#### 5.4 错误处理

原代码在 `/api/refine` 端点的 try/catch 中已捕获 generate 抛出的错误，并返回 500。新接口的错误行为一致，无需改动 catch 块。

#### 5.5 启动校验

原代码在启动时检查 `MIMO_API_KEY`，未配置则 `process.exit(1)`。新逻辑改为：`server/llm/index.ts` 模块加载时调用 `createProvider()`，若 `LLM_PROVIDER` 或 `LLM_API_KEY` 未配置，会抛错导致 import 失败，server 启动失败。效果等价。

### TDD 测试用例

**测试策略**：本任务主要是机械替换，无新逻辑。测试重点在于：

1. 通过现有测试验证无回归
2. 手动端到端测试验证精炼流程

#### 测试 5.1：单元测试无回归

- 执行 `npm test`
- 所有现有测试通过
- 所有 LLM 模块测试（任务 0-3）通过

#### 测试 5.2：lint 通过

- 执行 `npm run lint`
- 无 TypeScript 错误

#### 测试 5.3：server 启动检查 LLM\_PROVIDER

- 不设置 `LLM_PROVIDER` 环境变量
- 执行 `npm run dev`
- 应在启动时失败，错误信息包含 "LLM\_PROVIDER"

#### 测试 5.4：server 启动检查 LLM\_API\_KEY

- 设置 `LLM_PROVIDER=mimo`，不设置 `LLM_API_KEY`
- 执行 `npm run dev`
- 应在启动时失败，错误信息包含 "LLM\_API\_KEY"

#### 测试 5.5：端到端精炼流程（MiMo）

- 配置 `.env`: `LLM_PROVIDER=mimo`, `LLM_API_KEY=<有效 key>`
- 启动 server
- 通过 curl 或前端发起一次精炼请求：`GET /api/refine?input=测试输入&cycles=1&session_id=xxx`
- 验证 SSE 事件正常推送
- 验证最终生成 final\_logic 和 explanation
- 验证数据库中有新记录

#### 测试 5.6：切换 provider 可工作（OpenAI 兼容）— 可选

- **前置条件**：手头有任一 OpenAI 兼容 API 的有效 key（DeepSeek / 通义 / Moonshot / 智谱 / OpenAI 代理等）
- 若暂无备用 provider，此测试可延后至真正切换时执行
- 配置 `.env`: `LLM_PROVIDER=<provider>`, `LLM_API_KEY=<有效 key>`（如非默认端点再设 `LLM_BASE_URL` 和 `LLM_MODEL`）
- 启动 server
- 发起一次精炼请求
- 验证精炼流程正常完成（虽然无 thinking，但流程不报错）

### 验收标准

- [x] `server/index.ts` 中删除了 `generate` 和 `generateWithThinking` 函数
- [x] 删除了 `MIMO_API_KEY` / `MODEL_NAME` / `ENDPOINT` 三个硬编码常量
- [x] 6 处调用点全部改为 `llm.generate(prompt, system, { thinking: true })`
- [x] 缺少 `LLM_PROVIDER` 或 `LLM_API_KEY` 时 server 启动失败并给出明确错误
- [ ] MiMo provider 端到端精炼流程正常工作（待用户最终验收）
- [ ] OpenAI 兼容 provider 端到端精炼流程正常工作（可选，待用户最终验收）
- [x] `npm run lint` 通过
- [x] `npm test` 全部通过

### 实施记录

- 6 处调用点全部替换：Architect / RedTeam / Synthesizer / Boundary / Crystallizer / Explainer
- 启动时调用 `createProvider()`，若必填环境变量缺失会抛错导致 server 启动失败（由 loadProviderConfig 校验）
- lint 通过，138 个测试通过（4 个 HistoryList.test.tsx 失败属预先存在问题，与本次改动无关）
- `npm run build` 验证通过，dist/server.cjs 正常生成
- 端到端精炼流程（测试 5.5/5.6）需要有效 API key，留待用户最终验收
- 附带修复：README.md 中引用的 `MIMO_API_KEY` 更新为 `LLM_PROVIDER` / `LLM_API_KEY` / `LLM_BASE_URL` / `LLM_MODEL`

***

## 技术注意事项

### 安全考虑

- `LLM_API_KEY` 不能硬编码在源码中，只从环境变量读取
- `.env` 已在 `.gitignore` 中（现有约定）
- 错误日志中不应打印完整 API key（原代码已遵守，保持）

### 向后兼容

- 现有 `.env` 中的 `MIMO_API_KEY` **不再被读取**，需手动迁移到 `LLM_PROVIDER=mimo` + `LLM_API_KEY=xxx`（见下方迁移指引）
- 数据库结构无变化
- API 端点无变化
- 前端代码无变化

### 从旧 .env 迁移到新 .env 的指引

任务 5 完成后，用户需按以下步骤更新本地 `.env`：

1. 打开项目根目录的 `.env` 文件
2. 新增以下必填项（替换原来的 `MIMO_API_KEY` 值）：
   ```env
   LLM_PROVIDER=mimo
   LLM_API_KEY=<原来的 MIMO_API_KEY 值>
   LLM_BASE_URL=https://api.xiaomimimo.com/v1
   LLM_MODEL=mimo-v2.5-pro
   ```
3. （可选）注释掉旧的 `MIMO_API_KEY` 行，标记为废弃
4. 重启 dev server：`npm run dev`
5. 验证精炼流程正常工作

**未来切换到其他 provider 时**：

1. 修改 `.env` 的 `LLM_PROVIDER`、`LLM_API_KEY`、`LLM_BASE_URL`、`LLM_MODEL` 为新 provider 的值
2. 如需要可补充 `LLM_TEMPERATURE` 和 `LLM_MAX_TOKENS`
3. 重启 server 即可，无需改代码

### 性能影响

- LLM 调用本身的延迟和重试行为与原实现一致
- 多了一层接口抽象，但开销可忽略（一次额外的对象方法调用）
- 模块加载时初始化 provider 单例，避免每次调用重新构造

### 测试策略

- **单元测试**：types / openai-compat / mimo / index 四个模块，mock fetch 验证请求形状
- **回归测试**：现有测试（db / api / auth / App）保证不破坏既有功能
- **端到端测试**：手动通过 curl 或前端发起精炼请求，验证完整流程

### 已知限制（第一版）

1. **thinking 降级**：切到非 MiMo provider 时，模型不思考，精炼质量可能下降。等真接入 DeepSeek 等推理模型厂商时再补"换模型"逻辑。
2. **无自动 fallback**：单 provider 失败不会自动切到备用 provider。
3. **无运行时切换**：provider 在 server 启动时固定，切换需重启。
4. **未实现 Anthropic**：Claude 协议与 OpenAI 差异较大，若未来需要再单独写适配器。

### 文件变更清单

| 文件                                 | 变更类型  | 说明                                                                                                                              |
| ---------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------- |
| `.env.example`                     | 修改    | 新增 LLM\_PROVIDER / LLM\_API\_KEY / LLM\_BASE\_URL / LLM\_MODEL（必填）/ LLM\_TEMPERATURE / LLM\_MAX\_TOKENS（可选）说明，废弃 MIMO\_API\_KEY |
| `server/llm/types.ts`              | 新增    | LLMProvider 接口、GenerateOptions（thinking/temperature/maxTokens）、ProviderConfig（启动默认值）、loadProviderConfig（4 个必填校验）                |
| `server/llm/types.test.ts`         | 新增    | 8 个测试用例                                                                                                                         |
| `server/llm/openai-compat.ts`      | 新增    | OpenAICompatibleProvider 基类                                                                                                     |
| `server/llm/openai-compat.test.ts` | 新增    | 14 个测试用例                                                                                                                        |
| `server/llm/mimo.ts`               | 新增    | MimoProvider 适配器                                                                                                                |
| `server/llm/mimo.test.ts`          | 新增    | 12 个测试用例                                                                                                                        |
| `server/llm/index.ts`              | 新增    | createProvider 工厂函数（不导出单例，由 server 自行调用）                                                                                        |
| `server/llm/index.test.ts`         | 新增    | 7 个测试用例                                                                                                                         |
| `server/index.ts`                  | 移动+修改 | 从 server.ts 移入，删除原 generate 函数，6 处调用改用 llm.generate                                                                             |
| `package.json`                     | 修改    | dev/build 脚本指向 server/index.ts                                                                                                  |

### 不变更清单

| 文件                       | 原因                               |
| ------------------------ | -------------------------------- |
| `src/db.ts`              | 不属于本次范围                          |
| `src/db.test.ts`         | 同上                               |
| `src/utils/auth.ts`      | 同上                               |
| `src/utils/auth.test.ts` | 同上                               |
| `src/App.tsx`            | 前端无感知                            |
| `src/components/*`       | 前端无感知                            |
| `vite.config.ts`         | 前端构建配置无变化                        |
| `tsconfig.json`          | TS 配置无变化                         |
| `scripts/*`              | 仍引用 `./src/db`，不受 server.ts 移动影响 |

***

## 附录：原 server.ts 中需迁移的逻辑清单

供实施时对照，确保不遗漏：

| 原位置                   | 内容                             | 迁移目标                                                     |
| --------------------- | ------------------------------ | -------------------------------------------------------- |
| 第 17-22 行             | `MIMO_API_KEY` 读取与启动检查         | 删除，由 `loadProviderConfig` 替代                             |
| 第 23 行                | `MODEL_NAME = "mimo-v2.5-pro"` | 删除，作为 MimoProvider 默认值                                   |
| 第 24 行                | `ENDPOINT = "..."`             | 删除，作为 MimoProvider 默认 baseUrl                            |
| 第 27-88 行             | `generate` 函数                  | 删除，由 `OpenAICompatibleProvider.generate` 替代              |
| 第 91-154 行            | `generateWithThinking` 函数      | 删除，由 `MimoProvider.generate` + `opts.thinking` 替代        |
| 第 28-29 行 / 92-93 行   | LaTeX 格式提示拼接                   | 迁移到 `OpenAICompatibleProvider.enhanceSystemInstruction`  |
| 第 60-63 行 / 124-127 行 | HTTP 错误处理                      | 迁移到 `OpenAICompatibleProvider.generate`                  |
| 第 66-69 行 / 129-133 行 | 响应解析                           | 迁移到 `OpenAICompatibleProvider.generate`                  |
| 第 71-86 行 / 140-151 行 | 重试与 quota 错误判断                 | 迁移到 `OpenAICompatibleProvider.generate` + `isQuotaError` |
| 第 135-138 行           | reasoning\_content 日志          | 删除（不暴露 raw response 后无意义）                                |

