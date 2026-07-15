// LLM Provider 工厂与统一入口（第二代：登记表查表）
// createProvider 不再 switch，而是查表返回 RegistryProvider。
// 不导出单例，避免模块加载时初始化污染测试。

import { loadProviderConfig } from "./types";
import { PROVIDERS } from "./registry";
import { RegistryProvider } from "./provider";
import type { LLMProvider } from "./types";

export function createProvider(env: Record<string, string | undefined> = process.env): LLMProvider {
  const config = loadProviderConfig(env);
  const spec = PROVIDERS[config.provider];
  if (!spec) {
    const supported = Object.keys(PROVIDERS).join(", ");
    throw new Error(`Unknown LLM_PROVIDER: "${config.provider}". Supported: ${supported}`);
  }
  return new RegistryProvider(config, spec);
}

export type { LLMProvider, GenerateOptions, ProviderConfig, ProviderSpec, ProviderRegistry } from "./types";
export { PROVIDERS } from "./registry";
export { RegistryProvider } from "./provider";
export { resolveReasoning } from "./negotiate";
export { extractAnswer } from "./response";
