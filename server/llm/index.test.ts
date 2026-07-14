import { describe, it, expect } from 'vitest';
import { createProvider, RegistryProvider, PROVIDERS } from './index';

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
  // T4.1：LLM_PROVIDER=mimo → RegistryProvider，spec.auth==="api-key"
  it('T4.1 returns RegistryProvider with mimo spec (api-key)', () => {
    const provider = createProvider(makeFullEnv({ LLM_PROVIDER: 'mimo' })) as RegistryProvider;
    expect(provider).toBeInstanceOf(RegistryProvider);
    // 内部 spec.auth === "api-key"（MiMo 用 api-key 头）
    expect((provider as any).spec.auth).toBe('api-key');
  });

  // T4.2：LLM_PROVIDER=mistral → RegistryProvider，spec 含 effort 推理声明
  it('T4.2 returns RegistryProvider with mistral effort spec', () => {
    const provider = createProvider(makeFullEnv({
      LLM_PROVIDER: 'mistral',
      LLM_BASE_URL: 'https://api.mistral.ai/v1',
      LLM_MODEL: 'mistral-medium-3-5',
    })) as RegistryProvider;
    expect(provider).toBeInstanceOf(RegistryProvider);
    const spec = (provider as any).spec;
    expect(spec.reasoning.request.kind).toBe('effort');
    expect(spec.reasoning.request.field).toBe('reasoning_effort');
  });

  // T4.3：LLM_PROVIDER=openai → RegistryProvider，spec 无 reasoning
  it('T4.3 returns RegistryProvider with openai spec (no reasoning)', () => {
    const provider = createProvider(makeFullEnv({
      LLM_PROVIDER: 'openai',
      LLM_BASE_URL: 'https://api.openai.com/v1',
      LLM_MODEL: 'gpt-4o',
    })) as RegistryProvider;
    expect(provider).toBeInstanceOf(RegistryProvider);
    expect((provider as any).spec.reasoning).toBeUndefined();
  });

  // T4.4：未知 provider → 抛错且信息列出所有支持的 provider（含 mistral，共 7 个）
  it('T4.4 throws for unknown provider listing all supported', () => {
    expect(() => createProvider(makeFullEnv({ LLM_PROVIDER: 'unknown' }))).toThrow(/Unknown LLM_PROVIDER/);
    try {
      createProvider(makeFullEnv({ LLM_PROVIDER: 'unknown' }));
    } catch (e: any) {
      expect(e.message).toContain('mistral');
      // 列出全部 7 个
      ['mimo', 'openai', 'deepseek', 'qwen', 'moonshot', 'zhipu', 'mistral'].forEach((p) => {
        expect(e.message).toContain(p);
      });
    }
  });

  // T4.5：LLM_BASE_URL 缺失由 loadProviderConfig 抛错向上传播
  it('T4.5 propagates loadProviderConfig error when LLM_BASE_URL missing', () => {
    const env = makeFullEnv();
    delete env.LLM_BASE_URL;
    expect(() => createProvider(env)).toThrow(/LLM_BASE_URL/);
  });

  // T4.6：返回对象有 generate 方法
  it('T4.6 returns object with generate method', () => {
    const provider = createProvider(makeFullEnv({ LLM_PROVIDER: 'openai' }));
    expect(typeof (provider as any).generate).toBe('function');
  });
});

// 补充：PROVIDERS 重新导出可从 index 访问
describe('PROVIDERS re-export', () => {
  it('PROVIDERS is re-exported from index with 7 entries', () => {
    expect(Object.keys(PROVIDERS)).toHaveLength(7);
  });
});
