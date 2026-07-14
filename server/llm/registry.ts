// LLM Provider 登记表（第二代：数据驱动）
// 新增模型只需在本表加一行配置，无需写类、无需改 switch、无需改类型。

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
        // MiMo 思考模式下 temperature/top_p 被静默强制为 1.0 / 0.95，传入被忽略
        temperatureMode: "force",
        forcedTemperature: 1.0,
      },
      response: { format: "string" }, // 思考在 reasoning_content，content 始终是答案
    },
  },
  openai: { auth: "bearer" },
  deepseek: { auth: "bearer" },
  qwen: { auth: "bearer" },
  moonshot: { auth: "bearer" },
  zhipu: { auth: "bearer" },
  mistral: {
    auth: "bearer",
    // Mistral 规范用 max_tokens（非 OpenAI 的 max_completion_tokens）
    maxTokensField: "max_tokens",
    reasoning: {
      request: {
        kind: "effort",
        field: "reasoning_effort",
        // mistral-medium-3-5 实际仅支持 high/none（API 报错权威：supported values [high, none]）。
        // SDK 的 6 档枚举(none/minimal/low/medium/high/xhigh)是通用类型，非本模型支持集。
        levels: ["none", "high"],
        default: "high",
        // reasoning_effort:"high" + temperature:0 会被 API 拒绝（400）
        temperatureMode: "avoid-zero",
        avoidZeroFallback: 0.8,
      },
      response: { format: "chunk-array" }, // 思考内容嵌在 content 数组，需抽 type:"text"
    },
  },
};
