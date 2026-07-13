import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { OpenAICompatibleProvider } from './openai-compat';

// 测试用的标准配置
function makeConfig(overrides: Partial<{ apiKey: string; baseUrl: string; model: string; temperature: number; maxTokens: number }> = {}) {
  return {
    provider: 'openai',
    apiKey: 'test-key',
    baseUrl: 'https://api.test.com/v1',
    model: 'test-model',
    temperature: 0.8,
    ...overrides,
  };
}

// 提取 fetch 调用时传入的 body（JSON 字符串 → 对象）
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

function mockFetchSuccess(content: string = 'hello') {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ choices: [{ message: { content } }] }),
    text: () => Promise.resolve(''),
  });
}

function mockFetchHttpError(status: number, text: string = 'error') {
  return vi.fn().mockResolvedValue({
    ok: false,
    status,
    json: () => Promise.resolve({}),
    text: () => Promise.resolve(text),
  });
}

describe('OpenAICompatibleProvider', () => {
  let originalFetch: typeof globalThis.fetch;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    fetchMock = mockFetchSuccess();
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  // 测试 1.1：generate 发起正确请求
  it('should send request to correct URL with POST method', async () => {
    const provider = new OpenAICompatibleProvider(makeConfig({ baseUrl: 'https://api.test.com/v1' }));
    await provider.generate('prompt', 'system');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(getCallUrl(fetchMock)).toBe('https://api.test.com/v1/chat/completions');
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe('POST');
  });

  // 测试 1.2：使用 Bearer 鉴权头
  it('should use Bearer auth header', async () => {
    const provider = new OpenAICompatibleProvider(makeConfig({ apiKey: 'my-key' }));
    await provider.generate('p', 's');
    const headers = getCallHeaders(fetchMock);
    expect(headers['Authorization']).toBe('Bearer my-key');
    expect(headers['Content-Type']).toBe('application/json');
    expect(headers['api-key']).toBeUndefined();
  });

  // 测试 1.3：body 包含 model、messages、temperature（用启动默认值）
  it('should build body with model, messages, and default temperature', async () => {
    const provider = new OpenAICompatibleProvider(makeConfig({ model: 'test-model', temperature: 0.8 }));
    await provider.generate('p', 's');
    const body = getCallBody(fetchMock);
    expect(body.model).toBe('test-model');
    expect(body.messages).toEqual([
      { role: 'system', content: expect.stringContaining('s') },
      { role: 'user', content: 'p' },
    ]);
    expect(body.temperature).toBe(0.8);
    expect(body.max_completion_tokens).toBeUndefined();
  });

  // 测试 1.4：启动时配置 maxTokens 则 body 含该字段
  it('should include max_completion_tokens when configured at startup', async () => {
    const provider = new OpenAICompatibleProvider(makeConfig({ maxTokens: 1000 }));
    await provider.generate('p', 's');
    const body = getCallBody(fetchMock);
    expect(body.max_completion_tokens).toBe(1000);
  });

  // 测试 1.4b：opts.temperature 覆盖启动默认值
  it('should let opts.temperature override startup default', async () => {
    const provider = new OpenAICompatibleProvider(makeConfig({ temperature: 0.8 }));
    await provider.generate('p', 's', { temperature: 0.5 });
    const body = getCallBody(fetchMock);
    expect(body.temperature).toBe(0.5);
  });

  // 测试 1.4c：opts.maxTokens 覆盖启动默认值
  it('should let opts.maxTokens override startup default', async () => {
    const provider = new OpenAICompatibleProvider(makeConfig({ maxTokens: 1000 }));
    await provider.generate('p', 's', { maxTokens: 4096 });
    const body = getCallBody(fetchMock);
    expect(body.max_completion_tokens).toBe(4096);
  });

  // 测试 1.4d：opts.maxTokens 在启动未配置时仍生效
  it('should let opts.maxTokens take effect when startup has none', async () => {
    const provider = new OpenAICompatibleProvider(makeConfig({}));
    await provider.generate('p', 's', { maxTokens: 2048 });
    const body = getCallBody(fetchMock);
    expect(body.max_completion_tokens).toBe(2048);
  });

  // 测试 1.5：opts.thinking 被静默忽略
  it('should silently ignore opts.thinking', async () => {
    const provider = new OpenAICompatibleProvider(makeConfig({}));
    await provider.generate('p', 's', { thinking: true });
    const body = getCallBody(fetchMock);
    expect(body.thinking).toBeUndefined();
  });

  // 测试 1.6：返回 choices[0].message.content
  it('should return choices[0].message.content', async () => {
    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ choices: [{ message: { content: 'result text' } }] }),
      text: () => Promise.resolve(''),
    });
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const provider = new OpenAICompatibleProvider(makeConfig({}));
    const result = await provider.generate('p', 's');
    expect(result).toBe('result text');
  });

  // 测试 1.7：响应格式异常时抛错
  it('should throw when response format is invalid', async () => {
    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ foo: 'bar' }),
      text: () => Promise.resolve(''),
    });
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const provider = new OpenAICompatibleProvider(makeConfig({}));
    await expect(provider.generate('p', 's')).rejects.toThrow(/Invalid API response format/);
  });

  // 测试 1.8：HTTP 错误状态抛错
  it('should throw on HTTP error status', async () => {
    fetchMock = mockFetchHttpError(401, 'Unauthorized');
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const provider = new OpenAICompatibleProvider(makeConfig({}));
    await expect(provider.generate('p', 's')).rejects.toThrow(/401/);
  });

  // 测试 1.9：quota 错误触发重试
  it('should retry on quota error', async () => {
    fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 429, text: () => Promise.resolve('429 Too Many Requests') })
      .mockResolvedValueOnce({ ok: false, status: 429, text: () => Promise.resolve('429 Too Many Requests') })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ choices: [{ message: { content: 'success' } }] }), text: () => Promise.resolve('') });
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const provider = new OpenAICompatibleProvider(makeConfig({}));
    const result = await provider.generate('p', 's');
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result).toBe('success');
  });

  // 测试 1.10：重试耗尽后抛出最后错误
  it('should throw last error when retries exhausted', async () => {
    fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: () => Promise.resolve('429 Too Many Requests'),
    });
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const provider = new OpenAICompatibleProvider(makeConfig({}));
    await expect(provider.generate('p', 's')).rejects.toThrow(/429/);
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  // 测试 1.11：system instruction 附加 LaTeX 格式提示
  it('should append LaTeX hint to system instruction', async () => {
    const provider = new OpenAICompatibleProvider(makeConfig({}));
    await provider.generate('p', 'base system');
    const body = getCallBody(fetchMock);
    const systemContent = (body.messages as Array<{ role: string; content: string }>)[0].content;
    expect(systemContent).toContain('LaTeX');
    expect(systemContent.startsWith('base system')).toBe(true);
  });

  // 测试 1.12：未配 maxTokens 且调用未传时，body 不传该字段
  it('should not include max_completion_tokens when neither configured nor passed', async () => {
    const provider = new OpenAICompatibleProvider(makeConfig({}));
    await provider.generate('p', 's');
    const body = getCallBody(fetchMock);
    expect(body.max_completion_tokens).toBeUndefined();
  });
});
