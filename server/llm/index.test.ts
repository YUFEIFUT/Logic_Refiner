import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createProvider } from './index';
import { MimoProvider } from './mimo';
import { OpenAICompatibleProvider } from './openai-compat';

function makeFullEnv(overrides: Record<string, string> = {}): Record<string, string | undefined> {
  return {
    LLM_PROVIDER: 'mimo',
    LLM_API_KEY: 'k',
    LLM_BASE_URL: 'https://api.xiaomimimo.com/v1',
    LLM_MODEL: 'mimo-v2.5-pro',
    ...overrides,
  };
}

describe('createProvider', () => {
  // 测试 3.1：LLM_PROVIDER=mimo 返回 MimoProvider 实例
  it('should return MimoProvider when provider is mimo', () => {
    const provider = createProvider(makeFullEnv({ LLM_PROVIDER: 'mimo' }));
    expect(provider).toBeInstanceOf(MimoProvider);
  });

  // 测试 3.2：LLM_PROVIDER=openai 返回 OpenAICompatibleProvider 实例
  it('should return OpenAICompatibleProvider when provider is openai', () => {
    const provider = createProvider(makeFullEnv({ LLM_PROVIDER: 'openai' }));
    expect(provider).toBeInstanceOf(OpenAICompatibleProvider);
    expect(provider).not.toBeInstanceOf(MimoProvider);
  });

  // 测试 3.3：LLM_PROVIDER=deepseek 返回 OpenAI 兼容实例
  it('should return OpenAICompatibleProvider when provider is deepseek', () => {
    const provider = createProvider(makeFullEnv({
      LLM_PROVIDER: 'deepseek',
      LLM_BASE_URL: 'https://api.deepseek.com/v1',
      LLM_MODEL: 'deepseek-chat',
    }));
    expect(provider).toBeInstanceOf(OpenAICompatibleProvider);
    expect(provider).not.toBeInstanceOf(MimoProvider);
  });

  // 测试 3.4：未识别的 provider 抛错
  it('should throw for unknown provider', () => {
    expect(() => createProvider(makeFullEnv({ LLM_PROVIDER: 'unknown' }))).toThrow(/Unknown LLM_PROVIDER/);
  });

  // 测试 3.5：自定义 LLM_BASE_URL 和 LLM_MODEL 透传
  it('should pass through custom LLM_BASE_URL and LLM_MODEL', async () => {
    const originalFetch = globalThis.fetch;
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ choices: [{ message: { content: 'ok' } }] }),
      text: () => Promise.resolve(''),
    });
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    try {
      const provider = createProvider(makeFullEnv({
        LLM_PROVIDER: 'openai',
        LLM_BASE_URL: 'https://my.proxy/v1',
        LLM_MODEL: 'my-model',
      }));
      await provider.generate('p', 's');
      const url = fetchMock.mock.calls[0][0] as string;
      const init = fetchMock.mock.calls[0][1] as RequestInit;
      const body = JSON.parse(init.body as string);
      expect(url).toBe('https://my.proxy/v1/chat/completions');
      expect(body.model).toBe('my-model');
    } finally {
      globalThis.fetch = originalFetch;
      vi.restoreAllMocks();
    }
  });

  // 测试 3.6：LLM_BASE_URL 缺失时抛错
  it('should throw when LLM_BASE_URL is missing', () => {
    const env = makeFullEnv();
    delete env.LLM_BASE_URL;
    expect(() => createProvider(env)).toThrow(/LLM_BASE_URL/);
  });

  // 测试 3.7：返回的对象有 generate 方法
  it('should return object with generate method', () => {
    const provider = createProvider(makeFullEnv({ LLM_PROVIDER: 'openai' }));
    expect(typeof (provider as any).generate).toBe('function');
  });
});
