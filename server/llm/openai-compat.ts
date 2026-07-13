// OpenAI 兼容协议的 LLM Provider 基类
// 适用于 OpenAI / DeepSeek / Qwen / Moonshot / 智谱 等兼容厂商
// 使用模板方法模式：generate 定义流程骨架，子类可重写 protected 钩子

import type { LLMProvider, GenerateOptions, ProviderConfig } from "./types";

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

  // 模板方法：定义完整生成流程
  async generate(prompt: string, system: string, opts?: GenerateOptions): Promise<string> {
    const enhancedSystem = this.enhanceSystemInstruction(system);
    const body = this.buildBody(prompt, enhancedSystem, opts);
    const headers = this.buildHeaders();

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

  // 钩子：附加 LaTeX 格式提示到 system instruction
  protected enhanceSystemInstruction(system: string): string {
    return system +
      "\n重要格式提示：当你输出任何必须的数学公式、定量变量或严密的逻辑代数式时，请使用标准的 LaTeX 语法。行内公式使用单个美元符号 $...$，块级/段落公式使用双美元符号 $$...$$。但请极力避免将非数量化的现实抽象概念生搬硬套进一个生硬造作的伪物理或数学公式中。";
  }

  // 钩子：构造请求头（OpenAI 标准用 Bearer）
  protected buildHeaders(): Record<string, string> {
    return {
      "Authorization": `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
    };
  }

  // 钩子：构造请求体
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

  // 钩子：判断是否为 quota / rate limit 错误（值得重试）
  protected isQuotaError(error: any): boolean {
    return error.message?.includes("429")
      || error.message?.includes("RESOURCE_EXHAUSTED")
      || error.message?.toLowerCase().includes("quota")
      || error.message?.toLowerCase().includes("limit");
  }
}
