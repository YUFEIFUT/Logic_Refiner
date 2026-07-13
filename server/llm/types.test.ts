import { describe, it, expect } from 'vitest';
import { loadProviderConfig } from './types';

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
