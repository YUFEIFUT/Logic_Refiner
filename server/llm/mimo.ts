// MiMo (小米) LLM Provider 适配器
// 与 OpenAI 协议的差异：
//   1. 鉴权头用 api-key 而非 Authorization: Bearer
//   2. 通过 body 中的 thinking 字段启用推理模式

import { OpenAICompatibleProvider } from "./openai-compat";
import type { GenerateOptions, ProviderConfig } from "./types";

export class MimoProvider extends OpenAICompatibleProvider {
  constructor(config: ProviderConfig) {
    super(config);
  }

  // 重写：使用 api-key 头，不用 Bearer
  protected buildHeaders(): Record<string, string> {
    return {
      "api-key": this.apiKey,
      "Content-Type": "application/json",
    };
  }

  // 重写：按 opts.thinking 注入 thinking 字段
  protected buildBody(prompt: string, system: string, opts?: GenerateOptions): Record<string, unknown> {
    const body = super.buildBody(prompt, system, opts);
    if (opts?.thinking) {
      body.thinking = { type: "enabled" };
    }
    return body;
  }
}
