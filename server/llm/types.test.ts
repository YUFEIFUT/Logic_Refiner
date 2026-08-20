import { describe, it, expect } from 'vitest';
import { loadProviderConfig } from './types';
import { PROVIDERS } from './registry';
import type { GenerateOptions } from './types';

describe('loadProviderConfig', () => {
  // 测试 0.1：缺少 LLM_PROVIDER 抛错
  it('should throw when LLM_PROVIDER is missing', () => {
    expect(() => loadProviderConfig({ LLM_API_KEY: 'xxx' })).toThrow(/LLM_PROVIDER/);
  });

  // 测试 0.2：缺少 LLM_API_KEY 抛错
  it('should throw when LLM_API_KEY is missing', () => {
    expect(() => loadProviderConfig({ LLM_PROVIDER: 'mimo' })).toThrow(/LLM_API_KEY/);
  });

  // 测试 0.2b：缺少 LLM_BASE_URL 抛错
  it('should throw when LLM_BASE_URL is missing', () => {
    expect(() =>
      loadProviderConfig({ LLM_PROVIDER: 'mimo', LLM_API_KEY: 'k' })
    ).toThrow(/LLM_BASE_URL/);
  });

  // 测试 0.2c：缺少 LLM_MODEL 抛错
  it('should throw when LLM_MODEL is missing', () => {
    expect(() =>
      loadProviderConfig({ LLM_PROVIDER: 'mimo', LLM_API_KEY: 'k', LLM_BASE_URL: 'u' })
    ).toThrow(/LLM_MODEL/);
  });

  // 测试 0.3：正常读取必填字段
  it('should read required fields correctly', () => {
    const config = loadProviderConfig({
      LLM_PROVIDER: 'mimo',
      LLM_API_KEY: 'k',
      LLM_BASE_URL: 'u',
      LLM_MODEL: 'm',
    });
    expect(config.provider).toBe('mimo');
    expect(config.apiKey).toBe('k');
    expect(config.baseUrl).toBe('u');
    expect(config.model).toBe('m');
  });

  // 测试 0.4：可选字段为空时使用默认值
  it('should use default values when optional fields are missing', () => {
    const config = loadProviderConfig({
      LLM_PROVIDER: 'mimo',
      LLM_API_KEY: 'k',
      LLM_BASE_URL: 'u',
      LLM_MODEL: 'm',
    });
    expect(config.temperature).toBe(0.8);
    expect(config.maxTokens).toBeUndefined();
    expect(config.reasoningDefault).toBeUndefined();
  });

  // 测试 0.5：读取 LLM_TEMPERATURE（字符串转数字）
  it('should parse LLM_TEMPERATURE as number', () => {
    const config = loadProviderConfig({
      LLM_PROVIDER: 'mimo',
      LLM_API_KEY: 'k',
      LLM_BASE_URL: 'u',
      LLM_MODEL: 'm',
      LLM_TEMPERATURE: '0.5',
    });
    expect(config.temperature).toBe(0.5);
  });

  // 测试 0.6：读取 LLM_MAX_TOKENS（字符串转数字）
  it('should parse LLM_MAX_TOKENS as number', () => {
    const config = loadProviderConfig({
      LLM_PROVIDER: 'mimo',
      LLM_API_KEY: 'k',
      LLM_BASE_URL: 'u',
      LLM_MODEL: 'm',
      LLM_MAX_TOKENS: '4096',
    });
    expect(config.maxTokens).toBe(4096);
  });
});

describe('PROVIDERS registry', () => {
  // T0.1：10 个 provider 键齐全
  it('T0.1 should contain all 10 providers', () => {
    const keys = Object.keys(PROVIDERS);
    expect(keys).toEqual(
      expect.arrayContaining(['mimo', 'openai', 'deepseek', 'qwen', 'moonshot', 'zhipu', 'mistral', 'agnes', 'toter', 'opencode'])
    );
    expect(keys).toHaveLength(10);
  });

  // T0.2：MiMo toggle 声明
  it('T0.2 mimo reasoning is toggle with enabled/disabled', () => {
    const r = PROVIDERS.mimo.reasoning?.request;
    expect(r?.kind).toBe('toggle');
    expect(r?.field).toBe('thinking');
    expect(r?.on).toEqual({ type: 'enabled' });
    expect(r?.off).toEqual({ type: 'disabled' });
  });

  // T0.3：Mistral effort 声明（mistral-medium-3-5 仅支持 high/none）
  it('T0.3 mistral reasoning is effort with levels [none,high] and default high', () => {
    const r = PROVIDERS.mistral.reasoning?.request;
    expect(r?.kind).toBe('effort');
    expect(r?.field).toBe('reasoning_effort');
    expect(r?.levels).toEqual(['none', 'high']);
    expect(r?.default).toBe('high');
  });

  // T0.4：响应侧 format
  it('T0.4 response format: mistral=chunk-array, mimo=string', () => {
    expect(PROVIDERS.mistral.reasoning?.response.format).toBe('chunk-array');
    expect(PROVIDERS.mimo.reasoning?.response.format).toBe('string');
  });

  // T0.5：openai 不声明 reasoning
  it('T0.5 openai has no reasoning capability', () => {
    expect(PROVIDERS.openai.reasoning).toBeUndefined();
  });

  // T0.6：GenerateOptions.reasoning 类型允许 boolean 与档位字符串
  it('T0.6 GenerateOptions.reasoning accepts boolean and level string', () => {
    const a: GenerateOptions = { reasoning: true };
    const b: GenerateOptions = { reasoning: false };
    const c: GenerateOptions = { reasoning: 'medium' };
    const d: GenerateOptions = { reasoning: 'none' };
    const e: GenerateOptions = {};
    expect(a.reasoning).toBe(true);
    expect(b.reasoning).toBe(false);
    expect(c.reasoning).toBe('medium');
    expect(d.reasoning).toBe('none');
    expect(e.reasoning).toBeUndefined();
  });

  // T0.7：maxTokensField
  it('T0.7 maxTokensField: mistral=max_tokens, mimo=undefined', () => {
    expect(PROVIDERS.mistral.maxTokensField).toBe('max_tokens');
    expect(PROVIDERS.mimo.maxTokensField).toBeUndefined();
  });

  // T0.9：Agnes toggle 声明（OpenAI 兼容思考开关）
  it('T0.9 agnes reasoning is toggle with chat_template_kwargs.enable_thinking', () => {
    const r = PROVIDERS.agnes.reasoning?.request;
    expect(r?.kind).toBe('toggle');
    expect(r?.field).toBe('chat_template_kwargs');
    expect(r?.on).toEqual({ enable_thinking: true });
    expect(r?.off).toEqual({ enable_thinking: false });
    // 无温度约束：不声明 temperatureMode → 默认 passthrough
    expect(r?.temperatureMode).toBeUndefined();
  });

  // T0.10：Agnes 响应侧 format=string，maxTokensField=max_tokens
  it('T0.10 agnes response string + maxTokensField max_tokens', () => {
    expect(PROVIDERS.agnes.reasoning?.response.format).toBe('string');
    expect(PROVIDERS.agnes.maxTokensField).toBe('max_tokens');
  });

  // T0.11：toter toggle 声明（与 MiMo 同构：thinking.type enabled/disabled，无 budget_tokens）
  it('T0.11 toter reasoning is toggle with thinking.type enabled/disabled (no budget_tokens)', () => {
    const r = PROVIDERS.toter.reasoning?.request;
    expect(r?.kind).toBe('toggle');
    expect(r?.field).toBe('thinking');
    expect(r?.on).toEqual({ type: 'enabled' });
    expect(r?.off).toEqual({ type: 'disabled' });
    // 显式断言不带 budget_tokens（实测无效，避免传递无效魔法值）
    expect((r?.on as any)?.budget_tokens).toBeUndefined();
    // 无温度约束：不声明 temperatureMode → 默认 passthrough
    expect(r?.temperatureMode).toBeUndefined();
  });

  // T0.12：toter 响应侧 format=string，maxTokensField=max_tokens，streaming=true
  it('T0.12 toter response string + maxTokensField max_tokens + streaming true', () => {
    expect(PROVIDERS.toter.reasoning?.response.format).toBe('string');
    expect(PROVIDERS.toter.maxTokensField).toBe('max_tokens');
    expect(PROVIDERS.toter.streaming).toBe(true);
    expect(PROVIDERS.toter.auth).toBe('bearer');
  });

  // T0.13：opencode 本地代理：bearer + streaming，无 reasoning 声明（模型默认思考，无请求侧开关）
  it('T0.13 opencode bearer + streaming, no reasoning declared', () => {
    expect(PROVIDERS.opencode.auth).toBe('bearer');
    expect(PROVIDERS.opencode.streaming).toBe(true);
    expect(PROVIDERS.opencode.reasoning).toBeUndefined();
    expect(PROVIDERS.opencode.maxTokensField).toBeUndefined();
  });

  // T0.8：loadProviderConfig 读 LLM_REASONING_DEFAULT
  // 注：当前(C 未做)用全局 6 档常量校验，medium 能过启动校验；运行时 resolveReasoning 会回退到 high。
  //    待 docs/issues 的 C 提议落地后，此处应改为按 provider 实际 levels 校验（medium 启动即报错）。
  it('T0.8 loadProviderConfig reads LLM_REASONING_DEFAULT', () => {
    const base = {
      LLM_PROVIDER: 'mistral',
      LLM_API_KEY: 'k',
      LLM_BASE_URL: 'u',
      LLM_MODEL: 'm',
    };
    // 合法值（pre-C：medium 仍被启动校验接受）
    const ok = loadProviderConfig({ ...base, LLM_REASONING_DEFAULT: 'medium' });
    expect(ok.reasoningDefault).toBe('medium');
    // 非法值
    expect(() => loadProviderConfig({ ...base, LLM_REASONING_DEFAULT: 'ultra' })).toThrow(
      /LLM_REASONING_DEFAULT/
    );
    // 缺省
    const none = loadProviderConfig({ ...base });
    expect(none.reasoningDefault).toBeUndefined();
  });
});
