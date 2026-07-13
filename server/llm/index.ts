// LLM Provider 工厂与统一入口
// 按 LLM_PROVIDER 环境变量返回对应 provider 实例
// 不导出单例，避免模块加载时初始化污染测试

import { loadProviderConfig } from "./types";
import { OpenAICompatibleProvider } from "./openai-compat";
import { MimoProvider } from "./mimo";
import type { LLMProvider } from "./types";

export function createProvider(env: Record<string, string | undefined> = process.env): LLMProvider {
  const config = loadProviderConfig(env);

  switch (config.provider) {
    case "mimo":
      return new MimoProvider(config);

    case "openai":
    case "deepseek":
    case "qwen":
    case "moonshot":
    case "zhipu":
      return new OpenAICompatibleProvider(config);

    default:
      throw new Error(`Unknown LLM_PROVIDER: "${config.provider}". Supported: mimo, openai, deepseek, qwen, moonshot, zhipu`);
  }
}

export type { LLMProvider, GenerateOptions, ProviderConfig } from "./types";
export { MimoProvider, OpenAICompatibleProvider };
