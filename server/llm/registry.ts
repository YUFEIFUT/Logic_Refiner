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
  agnes: {
    auth: "bearer",
    // Agnes 2.0 Flash：OpenAI 兼容端点，使用 max_tokens 作为总输出上限（文档列出）
    maxTokensField: "max_tokens",
    // 已验证支持 SSE 流式（OpenAI 兼容 /chat/completions?stream=true）
    streaming: true,
    reasoning: {
      request: {
        kind: "toggle",
        // OpenAI 兼容思考开关：chat_template_kwargs.enable_thinking（实测 curl 确认）
        field: "chat_template_kwargs",
        on: { enable_thinking: true },
        off: { enable_thinking: false },
        // 实测：思考模式下 temperature:0 被正常接受 → 无温度约束（默认 passthrough）
      },
      response: { format: "string" }, // 思考在 message.reasoning_content，content 是答案（与 MiMo 同构）
    },
  },
  toter: {
    auth: "bearer",
    // toter 是第三方聚合平台，OpenAI 兼容端点，使用 max_tokens 作为输出上限（实测 curl 确认）
    maxTokensField: "max_tokens",
    // 已验证支持 SSE 流式（OpenAI 兼容 /chat/completions?stream=true）
    streaming: true,
    reasoning: {
      request: {
        kind: "toggle",
        // 思考开关：thinking.type（与 MiMo 同构）
        // 注：toter 兼容层接受 Anthropic 风格的 thinking.budget_tokens，但实测不生效
        //    （reasoning_tokens 不受其约束），故不声明，避免传递无效魔法值
        field: "thinking",
        on: { type: "enabled" },
        off: { type: "disabled" },
        // 实测思考模式下无温度约束（temperature:0.7 正常返回）
      },
      response: { format: "string" }, // 思考在 message.reasoning_content，content 是答案（与 MiMo 同构）
    },
  },
};
