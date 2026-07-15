// 通用 LLM Provider（第二代：登记表驱动，取代基类 + 子类）
// 一个类适配所有 provider：按 spec 声明组装请求、解析响应、施加温度约束。

import type { LLMProvider, GenerateOptions, ProviderConfig, ProviderSpec } from "./types";
import { resolveReasoning } from "./negotiate";
import { extractAnswer } from "./response";

export class RegistryProvider implements LLMProvider {
  protected config: ProviderConfig;
  protected spec: ProviderSpec;

  constructor(config: ProviderConfig, spec: ProviderSpec) {
    this.config = config;
    this.spec = spec;
  }

  async generate(prompt: string, system: string, opts?: GenerateOptions): Promise<string> {
    const enhancedSystem = this.enhanceSystemInstruction(system);
    const body = this.buildBody(prompt, enhancedSystem, opts);
    const headers = this.buildHeaders();

    // 重试逻辑同第一代（5 次，quota 错误重试）
    const retries = 5;
    for (let i = 0; i < retries; i++) {
      try {
        const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`LLM API Error (${response.status}): ${errorText}`);
        }

        const data: any = await response.json();
        return extractAnswer(data, this.spec);   // ← 用任务2
      } catch (error: any) {
        console.error(`Attempt ${i + 1} failed:`, error.message);
        if (this.isQuotaError(error) && i < retries - 1) {
          continue;
        }
        if (i === retries - 1) {
          throw error;
        }
      }
    }
    throw new Error("Maximum retries reached for API generation.");
  }

  /** 构造请求体：注入 model/messages/温度/reasoning 字段/maxTokens */
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

    // maxTokens：opts 传值 → 启动配置（未配则不传字段，让 API 自决）；字段名取自 spec
    const maxTokens = opts?.maxTokens ?? this.config.maxTokens;
    if (maxTokens !== undefined) {
      body[this.spec.maxTokensField ?? "max_completion_tokens"] = maxTokens;
    }

    // reasoning 协商（能力 ∩ 意图）
    const reasoningField = resolveReasoning(this.spec.reasoning, opts?.reasoning, this.config.reasoningDefault);
    Object.assign(body, reasoningField);
    return body;
  }

  /**
   * 温度：结合思考模式约束（§2.5）。
   * reasoning 实际开启时才施加约束，避免 "none" 误触发。
   * forcedTemperature / avoidZeroFallback 在对应 temperatureMode 下由登记表保证必填。
   */
  protected resolveTemperature(opts?: GenerateOptions): number {
    const temp = opts?.temperature ?? this.config.temperature;
    const r = this.spec.reasoning?.request;
    if (!r) return temp;
    // 推理实际开启：true 或档位字符串（"none" 视为显式关闭，不触发约束）
    const on = opts?.reasoning === true ||
      (typeof opts?.reasoning === "string" && opts.reasoning !== "none");
    if (!on) return temp;
    if (r.temperatureMode === "force") return r.forcedTemperature ?? 1.0;
    if (r.temperatureMode === "avoid-zero" && temp <= 0) return r.avoidZeroFallback ?? 0.8;
    return temp;
  }

  /** 鉴权头：bearer → Authorization: Bearer；api-key → api-key 头 */
  protected buildHeaders(): Record<string, string> {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (this.spec.auth === "bearer") {
      h["Authorization"] = `Bearer ${this.config.apiKey}`;
    } else {
      h["api-key"] = this.config.apiKey;
    }
    return h;
  }

  /** 附加 LaTeX 格式提示到 system instruction（与第一代保持一致，向后兼容） */
  protected enhanceSystemInstruction(system: string): string {
    return system +
      "\n重要格式提示：当你输出任何必须的数学公式、定量变量或严密的逻辑代数式时，请使用标准的 LaTeX 语法。行内公式使用单个美元符号 $...$，块级/段落公式使用双美元符号 $$...$$。但请极力避免将非数量化的现实抽象概念生搬硬套进一个生硬造作的伪物理或数学公式中。";
  }

  /** 判断是否为 quota / rate limit 错误（值得重试，与第一代一致） */
  protected isQuotaError(error: any): boolean {
    return error.message?.includes("429")
      || error.message?.includes("RESOURCE_EXHAUSTED")
      || error.message?.toLowerCase().includes("quota")
      || error.message?.toLowerCase().includes("limit");
  }
}
