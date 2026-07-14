import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RegistryProvider } from './provider';
import type { ProviderConfig, ProviderSpec } from './types';

// ---- 测试用 spec（与 registry.ts 一致，仅取必要字段） ----
const mimoSpec: ProviderSpec = {
  auth: 'api-key',
  reasoning: {
    request: {
      kind: 'toggle',
      field: 'thinking',
      on: { type: 'enabled' },
      off: { type: 'disabled' },
      temperatureMode: 'force',
      forcedTemperature: 1.0,
    },
    response: { format: 'string' },
  },
};

const mistralSpec: ProviderSpec = {
  auth: 'bearer',
  maxTokensField: 'max_tokens',
  reasoning: {
    request: {
      kind: 'effort',
      field: 'reasoning_effort',
      levels: ['none', 'high'],
      default: 'high',
      temperatureMode: 'avoid-zero',
      avoidZeroFallback: 0.8,
    },
    response: { format: 'chunk-array' },
  },
};

const openaiSpec: ProviderSpec = { auth: 'bearer' };

const agnesSpec: ProviderSpec = {
  auth: 'bearer',
  maxTokensField: 'max_tokens',
  reasoning: {
    request: {
      kind: 'toggle',
      field: 'chat_template_kwargs',
      on: { enable_thinking: true },
      off: { enable_thinking: false },
    },
    response: { format: 'string' },
  },
};

function makeConfig(overrides: Partial<ProviderConfig> = {}): ProviderConfig {
  return {
    provider: 'mimo',
    apiKey: 'test-key',
    baseUrl: 'https://api.test.com/v1',
    model: 'test-model',
    temperature: 0.8,
    ...overrides,
  };
}

function getCallBody(fetchMock: ReturnType<typeof vi.fn>, callIndex?: number): Record<string, unknown> {
  const idx = callIndex ?? fetchMock.mock.calls.length - 1;
  const call = fetchMock.mock.calls[idx];
  const init = call[1] as RequestInit;
  return JSON.parse(init.body as string);
}

function getCallHeaders(fetchMock: ReturnType<typeof vi.fn>): Record<string, string> {
  const call = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
  const init = call[1] as RequestInit;
  return init.headers as Record<string, string>;
}

describe('RegistryProvider', () => {
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

  // T3.1：MiMo + reasoning:true → body 含 thinking enabled，header 含 api-key 不含 Authorization
  it('T3.1 mimo reasoning:true injects thinking enabled, uses api-key header', async () => {
    const p = new RegistryProvider(makeConfig({ apiKey: 'my-key' }), mimoSpec);
    await p.generate('p', 's', { reasoning: true });
    const body = getCallBody(fetchMock);
    const headers = getCallHeaders(fetchMock);
    expect(body.thinking).toEqual({ type: 'enabled' });
    expect(headers['api-key']).toBe('my-key');
    expect(headers['Authorization']).toBeUndefined();
  });

  // T3.2：MiMo + 无 reasoning → body 不含 thinking 字段
  it('T3.2 mimo without reasoning does not inject thinking', async () => {
    const p = new RegistryProvider(makeConfig({}), mimoSpec);
    await p.generate('p', 's');
    const body = getCallBody(fetchMock);
    expect(body.thinking).toBeUndefined();
  });

  // T3.3：MiMo + reasoning:false → body 含 thinking disabled
  it('T3.3 mimo reasoning:false injects thinking disabled', async () => {
    const p = new RegistryProvider(makeConfig({}), mimoSpec);
    await p.generate('p', 's', { reasoning: false });
    const body = getCallBody(fetchMock);
    expect(body.thinking).toEqual({ type: 'disabled' });
  });

  // T3.4：Mistral + reasoning:"medium"（mistral-medium-3-5 不支持）→ 回退 high，Bearer 头
  it('T3.4 mistral reasoning:medium (unsupported) falls back to high, uses Bearer', async () => {
    const p = new RegistryProvider(makeConfig({ apiKey: 'mistral-key' }), mistralSpec);
    await p.generate('p', 's', { reasoning: 'medium' });
    const body = getCallBody(fetchMock);
    const headers = getCallHeaders(fetchMock);
    expect(body.reasoning_effort).toBe('high');
    expect(headers['Authorization']).toBe('Bearer mistral-key');
  });

  // T3.5：Mistral + reasoning:true → reasoning_effort:high（兜底档）
  it('T3.5 mistral reasoning:true uses default high', async () => {
    const p = new RegistryProvider(makeConfig({}), mistralSpec);
    await p.generate('p', 's', { reasoning: true });
    const body = getCallBody(fetchMock);
    expect(body.reasoning_effort).toBe('high');
  });

  // T3.6：openai + reasoning:true → body 不含 reasoning_effort（模型不支持，忽略）
  it('T3.6 openai reasoning:true ignores reasoning_effort', async () => {
    const p = new RegistryProvider(makeConfig({}), openaiSpec);
    await p.generate('p', 's', { reasoning: true });
    const body = getCallBody(fetchMock);
    expect(body.reasoning_effort).toBeUndefined();
    expect(body.thinking).toBeUndefined();
  });

  // T3.7：MiMo 思考模式 → body 温度强制 1.0（忽略 config 0.8）
  it('T3.7 mimo thinking mode forces temperature 1.0', async () => {
    const p = new RegistryProvider(makeConfig({ temperature: 0.8 }), mimoSpec);
    await p.generate('p', 's', { reasoning: true });
    const body = getCallBody(fetchMock);
    expect(body.temperature).toBe(1.0);
  });

  // T3.8：Mistral 思考模式 + config 温度 0 → body 温度 0.8（avoid-zero 兜底）
  it('T3.8 mistral thinking mode + temp 0 avoids zero', async () => {
    const p = new RegistryProvider(makeConfig({ temperature: 0 }), mistralSpec);
    await p.generate('p', 's', { reasoning: true });
    const body = getCallBody(fetchMock);
    expect(body.temperature).toBe(0.8);
  });

  // T3.8b：Mistral intent="none"（显式关）+ config 温度 0 → body 温度仍为 0
  it('T3.8b mistral intent=none does not trigger avoid-zero', async () => {
    const p = new RegistryProvider(makeConfig({ temperature: 0 }), mistralSpec);
    await p.generate('p', 's', { reasoning: 'none' });
    const body = getCallBody(fetchMock);
    expect(body.temperature).toBe(0);
    expect(body.reasoning_effort).toBe('none');
  });

  // T3.9：Mistral chunk 数组响应 → generate 返回 text chunk
  it('T3.9 mistral chunk-array response returns text chunk', async () => {
    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        choices: [{
          message: {
            content: [
              { type: 'thinking', thinking: [{ type: 'text', text: '思考...' }] },
              { type: 'text', text: '答案' },
            ],
          },
        }],
      }),
      text: () => Promise.resolve(''),
    });
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const p = new RegistryProvider(makeConfig({}), mistralSpec);
    const result = await p.generate('p', 's', { reasoning: true });
    expect(result).toBe('答案');
  });

  // T3.10：MiMo 字符串响应 → generate 返回 content（不暴露 reasoning_content）
  it('T3.10 mimo string response returns content', async () => {
    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        choices: [{ message: { content: 'mimo answer', reasoning_content: 'hidden thinking' } }],
      }),
      text: () => Promise.resolve(''),
    });
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const p = new RegistryProvider(makeConfig({}), mimoSpec);
    const result = await p.generate('p', 's', { reasoning: true });
    expect(result).toBe('mimo answer');
  });

  // T3.11：maxTokens 两级回退（配置/opts/不传）
  it('T3.11 maxTokens two-level fallback', async () => {
    // 不传
    let p = new RegistryProvider(makeConfig({}), mimoSpec);
    await p.generate('p', 's');
    expect(getCallBody(fetchMock).max_completion_tokens).toBeUndefined();
    // 配置
    p = new RegistryProvider(makeConfig({ maxTokens: 5000 }), mimoSpec);
    await p.generate('p', 's');
    expect(getCallBody(fetchMock).max_completion_tokens).toBe(5000);
    // opts 覆盖配置
    p = new RegistryProvider(makeConfig({ maxTokens: 5000 }), mimoSpec);
    await p.generate('p', 's', { maxTokens: 2048 });
    expect(getCallBody(fetchMock).max_completion_tokens).toBe(2048);
  });

  // T3.11b：maxTokens 字段名取自 spec（Mistral→max_tokens，MiMo→max_completion_tokens）
  it('T3.11b maxTokens field name follows spec', async () => {
    const mistralP = new RegistryProvider(makeConfig({ maxTokens: 4096 }), mistralSpec);
    await mistralP.generate('p', 's');
    const mb = getCallBody(fetchMock);
    expect(mb.max_tokens).toBe(4096);
    expect(mb.max_completion_tokens).toBeUndefined();

    const mimoP = new RegistryProvider(makeConfig({ maxTokens: 4096 }), mimoSpec);
    await mimoP.generate('p', 's');
    const mib = getCallBody(fetchMock);
    expect(mib.max_completion_tokens).toBe(4096);
    expect(mib.max_tokens).toBeUndefined();
  });

  // T3.12：HTTP 错误 / quota 重试 / 格式异常抛错（同第一代行为）
  it('T3.12 retries on quota error and throws when exhausted', async () => {
    fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: () => Promise.resolve('429 Too Many Requests'),
    });
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const p = new RegistryProvider(makeConfig({}), mimoSpec);
    await expect(p.generate('p', 's')).rejects.toThrow(/429/);
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it('T3.12b http error throws', async () => {
    fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve('Unauthorized'),
    });
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const p = new RegistryProvider(makeConfig({}), openaiSpec);
    await expect(p.generate('p', 's')).rejects.toThrow(/401/);
  });

  // T3.13：LaTeX 提示附加到 system
  it('T3.13 appends LaTeX hint to system instruction', async () => {
    const p = new RegistryProvider(makeConfig({}), mimoSpec);
    await p.generate('p', 'base system');
    const body = getCallBody(fetchMock);
    const systemContent = (body.messages as Array<{ role: string; content: string }>)[0].content;
    expect(systemContent).toContain('LaTeX');
    expect(systemContent.startsWith('base system')).toBe(true);
  });

  // T3.14：Agnes + reasoning:true → body.chat_template_kwargs.enable_thinking true，Bearer 头
  it('T3.14 agnes reasoning:true injects chat_template_kwargs.enable_thinking true, uses Bearer', async () => {
    const p = new RegistryProvider(makeConfig({ apiKey: 'agnes-key' }), agnesSpec);
    await p.generate('p', 's', { reasoning: true });
    const body = getCallBody(fetchMock);
    const headers = getCallHeaders(fetchMock);
    expect(body.chat_template_kwargs).toEqual({ enable_thinking: true });
    expect(headers['Authorization']).toBe('Bearer agnes-key');
  });

  // T3.15：Agnes + reasoning:false → body.chat_template_kwargs.enable_thinking false
  it('T3.15 agnes reasoning:false injects enable_thinking false', async () => {
    const p = new RegistryProvider(makeConfig({}), agnesSpec);
    await p.generate('p', 's', { reasoning: false });
    const body = getCallBody(fetchMock);
    expect(body.chat_template_kwargs).toEqual({ enable_thinking: false });
  });

  // T3.16：Agnes 思考模式 + config 温度 0 → body.temperature 仍为 0（无温度约束，passthrough）
  it('T3.16 agnes thinking mode does not constrain temperature', async () => {
    const p = new RegistryProvider(makeConfig({ temperature: 0 }), agnesSpec);
    await p.generate('p', 's', { reasoning: true });
    const body = getCallBody(fetchMock);
    expect(body.temperature).toBe(0);
  });

  // T3.17：Agnes 字符串响应 → generate 返回 content，忽略 reasoning_content（与 MiMo 同构）
  it('T3.17 agnes string response returns content, ignores reasoning_content', async () => {
    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        choices: [{ message: { content: 'agnes answer', reasoning_content: 'hidden thinking' } }],
      }),
      text: () => Promise.resolve(''),
    });
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const p = new RegistryProvider(makeConfig({}), agnesSpec);
    const result = await p.generate('p', 's', { reasoning: true });
    expect(result).toBe('agnes answer');
  });

  // T3.18：Agnes maxTokens 字段名 = max_tokens
  it('T3.18 agnes maxTokens field name is max_tokens', async () => {
    const p = new RegistryProvider(makeConfig({ maxTokens: 4096 }), agnesSpec);
    await p.generate('p', 's');
    const body = getCallBody(fetchMock);
    expect(body.max_tokens).toBe(4096);
    expect(body.max_completion_tokens).toBeUndefined();
  });
});
