// 通用 LLM Provider（第二代：登记表驱动，取代基类 + 子类）
// 一个类适配所有 provider：按 spec 声明组装请求、解析响应、施加温度约束。

import type { LLMProvider, GenerateOptions, ProviderConfig, ProviderSpec, StreamHandlers } from "./types";
import { resolveReasoning } from "./negotiate";
import { extractAnswer, extractStreamChunk } from "./response";
import { enhanceSystemInstruction as enhanceSystemInstructionImpl } from "./enhance";

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

  /**
   * 流式生成：边收边通过 handlers 回调增量，最终返回完整文本。
   *
   * - spec.streaming === true：请求体加 stream:true，读 response.body 流，
   *   按 OpenAI SSE 帧（data:{...} / data:[DONE]）解析，逐帧抽 content/thinking 回调。
   * - 否则退化为一次性 generate + 单条 onDelta（调用方无需感知差异）。
   */
  async streamGenerate(
    prompt: string,
    system: string,
    opts: GenerateOptions | undefined,
    handlers: StreamHandlers
  ): Promise<string> {
    // 非流式 provider：退化路径，保证上层调用统一
    if (!this.spec.streaming) {
      const full = await this.generate(prompt, system, opts);
      handlers.onDelta?.(full);
      return full;
    }

    const enhancedSystem = this.enhanceSystemInstruction(system);
    const body = this.buildBody(prompt, enhancedSystem, opts);
    body.stream = true;
    const headers = this.buildHeaders();

    const retries = 5;
    // 一旦向调用方推送过增量，说明该请求已部分生效；此时若失败不应重试
    // （否则重试会再次推送前缀，造成前端重复文本）。仅限"尚未推送任何增量"时重试。
    let delivered = false;
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

        const reader = response.body?.getReader();
        if (!reader) {
          // 极端情况：无 body 流，退化读全量 JSON
          const data: any = await response.json();
          const full = extractAnswer(data, this.spec);
          handlers.onDelta?.(full);
          return full;
        }

        const decoder = new TextDecoder();
        let buffer = "";
        let full = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          // 按 SSE 帧（\n\n 分隔）切分
          let sep: number;
          while ((sep = buffer.indexOf("\n\n")) >= 0) {
            const frame = buffer.slice(0, sep);
            buffer = buffer.slice(sep + 2);

            const dataLine = frame
              .split("\n")
              .find((l) => l.startsWith("data:"));
            if (!dataLine) continue;

            const payload = dataLine.slice(5).trim();
            if (payload === "[DONE]") continue;

            let chunk: any;
            try {
              chunk = JSON.parse(payload);
            } catch {
              continue; // 跳过无法解析的残帧
            }

            const { content, thinking } = extractStreamChunk(chunk, this.spec);
            if (content) {
              full += content;
              handlers.onDelta?.(content);
              delivered = true;
            }
            if (thinking) {
              handlers.onThinking?.(thinking);
              delivered = true;
            }
          }
        }

        // 冲刷残留 buffer 中的最后一帧（无尾随 \n\n 时）
        const tail = buffer.trim();
        if (tail.startsWith("data:")) {
          const payload = tail.slice(5).trim();
          if (payload && payload !== "[DONE]") {
            try {
              const chunk = JSON.parse(payload);
              const { content, thinking } = extractStreamChunk(chunk, this.spec);
              if (content) {
                full += content;
                handlers.onDelta?.(content);
              }
              if (thinking) handlers.onThinking?.(thinking);
            } catch {
              /* ignore */
            }
          }
        }

        return full;
      } catch (error: any) {
        console.error(`Stream attempt ${i + 1} failed:`, error.message);
        // 已向调用方推送过增量 → 视为部分成功，任何错误都不再重试/重启，
        // 否则新一次 fetch 会从头再推一遍增量，造成前端文本重复。直接抛出失败。
        if (delivered) {
          throw error;
        }
        if (this.isQuotaError(error) && i < retries - 1) {
          continue;
        }
        if (i === retries - 1) {
          throw error;
        }
      }
    }
    throw new Error("Maximum retries reached for API streaming.");
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

  /**
   * 附加输出格式提示到 system instruction。
   * 实现已抽至 ./enhance 纯函数；此处保留 protected 方法签名以兼容既有 provider.test.ts 的子类断言（T3.13）。
   */
  protected enhanceSystemInstruction(system: string): string {
    return enhanceSystemInstructionImpl(system);
  }

  /** 判断是否为 quota / rate limit 错误（值得重试，与第一代一致） */
  protected isQuotaError(error: any): boolean {
    return error.message?.includes("429")
      || error.message?.includes("RESOURCE_EXHAUSTED")
      || error.message?.toLowerCase().includes("quota")
      || error.message?.toLowerCase().includes("limit");
  }
}
