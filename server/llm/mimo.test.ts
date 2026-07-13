import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MimoProvider } from './mimo';

function makeConfig(overrides: Partial<{ apiKey: string; baseUrl: string; model: string; temperature: number; maxTokens: number }> = {}) {
  return {
    provider: 'mimo',
    apiKey: 'test-key',
    baseUrl: 'https://api.xiaomimimo.com/v1',
    model: 'mimo-v2.5-pro',
    temperature: 0.8,
    ...overrides,
  };
}

function getCallBody(fetchMock: ReturnType<typeof vi.fn>): Record<string, unknown> {
  const call = fetchMock.mock.calls[0];
  const init = call[1] as RequestInit;
  return JSON.parse(init.body as string);
}

function getCallHeaders(fetchMock: ReturnType<typeof vi.fn>): Record<string, string> {
  const call = fetchMock.mock.calls[0];
  const init = call[1] as RequestInit;
  return init.headers as Record<string, string>;
}

function getCallUrl(fetchMock: ReturnType<typeof vi.fn>): string {
  return fetchMock.mock.calls[0][0] as string;
}

describe('MimoProvider', () => {
  let originalFetch: typeof globalThis.fetch;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ choices: [{ message: { content: 'hello' } }] }),
      text: () => Promise.resolve(''),
    });
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  // 测试 2.1：使用 api-key 鉴权头（不用 Bearer）
  it('should use api-key header instead of Bearer', async () => {
    const mimo = new MimoProvider(makeConfig({ apiKey: 'my-key' }));
    await mimo.generate('p', 's');
    const headers = getCallHeaders(fetchMock);
    expect(headers['api-key']).toBe('my-key');
    expect(headers['Authorization']).toBeUndefined();
  });

  // 测试 2.2：不传 thinking 时不注入 thinking 字段
  it('should not inject thinking field when opts not passed', async () => {
    const mimo = new MimoProvider(makeConfig({}));
    await mimo.generate('p', 's');
    const body = getCallBody(fetchMock);
    expect(body.thinking).toBeUndefined();
  });

  // 测试 2.3：opts.thinking=true 注入 thinking 字段
  it('should inject thinking field when opts.thinking is true', async () => {
    const mimo = new MimoProvider(makeConfig({}));
    await mimo.generate('p', 's', { thinking: true });
    const body = getCallBody(fetchMock);
    expect(body.thinking).toEqual({ type: 'enabled' });
  });

  // 测试 2.4：opts.thinking=false 不注入 thinking 字段
  it('should not inject thinking field when opts.thinking is false', async () => {
    const mimo = new MimoProvider(makeConfig({}));
    await mimo.generate('p', 's', { thinking: false });
    const body = getCallBody(fetchMock);
    expect(body.thinking).toBeUndefined();
  });

  // 测试 2.5：默认 baseUrl 和 model 从 config 传入
  it('should use baseUrl and model from config', async () => {
    const mimo = new MimoProvider(makeConfig({
      baseUrl: 'https://api.xiaomimimo.com/v1',
      model: 'mimo-v2.5-pro',
    }));
    await mimo.generate('p', 's');
    expect(getCallUrl(fetchMock)).toBe('https://api.xiaomimimo.com/v1/chat/completions');
    const body = getCallBody(fetchMock);
    expect(body.model).toBe('mimo-v2.5-pro');
  });

  // 测试 2.6：自定义 baseUrl 和 model
  it('should use custom baseUrl and model', async () => {
    const mimo = new MimoProvider(makeConfig({
      baseUrl: 'https://custom.api/v1',
      model: 'custom-model',
    }));
    await mimo.generate('p', 's');
    expect(getCallUrl(fetchMock)).toBe('https://custom.api/v1/chat/completions');
    const body = getCallBody(fetchMock);
    expect(body.model).toBe('custom-model');
  });

  // 测试 2.7：继承基类的响应解析
  it('should inherit response parsing from base class', async () => {
    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ choices: [{ message: { content: 'mimo result' } }] }),
      text: () => Promise.resolve(''),
    });
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const mimo = new MimoProvider(makeConfig({}));
    const result = await mimo.generate('p', 's', { thinking: true });
    expect(result).toBe('mimo result');
  });

  // 测试 2.8：继承基类的重试逻辑
  it('should inherit retry logic from base class', async () => {
    fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 429, text: () => Promise.resolve('429 Too Many Requests') })
      .mockResolvedValueOnce({ ok: false, status: 429, text: () => Promise.resolve('429 Too Many Requests') })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ choices: [{ message: { content: 'success' } }] }), text: () => Promise.resolve('') });
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const mimo = new MimoProvider(makeConfig({}));
    const result = await mimo.generate('p', 's');
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result).toBe('success');
  });

  // 测试 2.9：继承基类的 LaTeX 格式提示
  it('should inherit LaTeX hint from base class', async () => {
    const mimo = new MimoProvider(makeConfig({}));
    await mimo.generate('p', 'base system');
    const body = getCallBody(fetchMock);
    const systemContent = (body.messages as Array<{ role: string; content: string }>)[0].content;
    expect(systemContent).toContain('LaTeX');
  });

  // 测试 2.10：未配 LLM_MAX_TOKENS 时不传 max_completion_tokens 字段
  it('should not include max_completion_tokens when not configured', async () => {
    const mimo = new MimoProvider(makeConfig({}));
    await mimo.generate('p', 's');
    const body = getCallBody(fetchMock);
    expect(body.max_completion_tokens).toBeUndefined();
  });

  // 测试 2.11：显式配 LLM_MAX_TOKENS 时使用配置值
  it('should use configured maxTokens', async () => {
    const mimo = new MimoProvider(makeConfig({ maxTokens: 4096 }));
    await mimo.generate('p', 's');
    const body = getCallBody(fetchMock);
    expect(body.max_completion_tokens).toBe(4096);
  });

  // 测试 2.12：opts.maxTokens 覆盖启动配置的 LLM_MAX_TOKENS
  it('should let opts.maxTokens override startup config', async () => {
    const mimo = new MimoProvider(makeConfig({ maxTokens: 5000 }));
    await mimo.generate('p', 's', { maxTokens: 2048 });
    const body = getCallBody(fetchMock);
    expect(body.max_completion_tokens).toBe(2048);
  });
});
