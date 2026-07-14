import { describe, it, expect } from 'vitest';
import { resolveReasoning } from './negotiate';
import type { ReasoningSpec } from './types';

// MiMo toggle 型 spec（与登记表一致）
const mimoSpec: ReasoningSpec = {
  request: {
    kind: 'toggle',
    field: 'thinking',
    on: { type: 'enabled' },
    off: { type: 'disabled' },
    temperatureMode: 'force',
    forcedTemperature: 1.0,
  },
  response: { format: 'string' },
};

// Mistral effort 型 spec（与登记表一致：mistral-medium-3-5 仅支持 high/none）
const mistralSpec: ReasoningSpec = {
  request: {
    kind: 'effort',
    field: 'reasoning_effort',
    levels: ['none', 'high'],
    default: 'high',
    temperatureMode: 'avoid-zero',
    avoidZeroFallback: 0.8,
  },
  response: { format: 'chunk-array' },
};

describe('resolveReasoning', () => {
  // T1.1：spec undefined（模型不支持推理）→ {}
  it('T1.1 returns {} when spec is undefined', () => {
    expect(resolveReasoning(undefined, true)).toEqual({});
    expect(resolveReasoning(undefined, 'high')).toEqual({});
  });

  // T1.2：intent undefined（调用者没表达）→ {}
  it('T1.2 returns {} when intent is undefined', () => {
    expect(resolveReasoning(mimoSpec, undefined)).toEqual({});
    expect(resolveReasoning(mistralSpec, undefined)).toEqual({});
  });

  // T1.2b：effort 型 intent=false → { reasoning_effort: "none" }
  it('T1.2b effort intent=false returns reasoning_effort none', () => {
    expect(resolveReasoning(mistralSpec, false)).toEqual({ reasoning_effort: 'none' });
  });

  // T1.3：toggle 型 intent=true → thinking enabled
  it('T1.3 toggle intent=true returns thinking enabled', () => {
    expect(resolveReasoning(mimoSpec, true)).toEqual({ thinking: { type: 'enabled' } });
  });

  // T1.4：toggle 型 intent="high"（带强度）→ 仍 thinking enabled（强度被忽略）
  it('T1.4 toggle intent=high still returns thinking enabled', () => {
    expect(resolveReasoning(mimoSpec, 'high')).toEqual({ thinking: { type: 'enabled' } });
  });

  // T1.4b：toggle 型 intent="none" → thinking disabled
  it('T1.4b toggle intent=none returns thinking disabled', () => {
    expect(resolveReasoning(mimoSpec, 'none')).toEqual({ thinking: { type: 'disabled' } });
  });

  // T1.5：toggle 型 intent=false → thinking disabled
  it('T1.5 toggle intent=false returns thinking disabled', () => {
    expect(resolveReasoning(mimoSpec, false)).toEqual({ thinking: { type: 'disabled' } });
  });

  // T1.6：effort 型 intent=true（无 override）→ reasoning_effort high（兜底档）
  it('T1.6 effort intent=true returns reasoning_effort high (default)', () => {
    expect(resolveReasoning(mistralSpec, true)).toEqual({ reasoning_effort: 'high' });
  });

  // T1.7：effort 型 intent="none"（显式支持的档位）→ reasoning_effort none
  it('T1.7 effort intent=none returns reasoning_effort none', () => {
    expect(resolveReasoning(mistralSpec, 'none')).toEqual({ reasoning_effort: 'none' });
  });

  // T1.8：effort 型 intent="medium"（mistral-medium-3-5 不支持）→ 回退兜底 high
  it('T1.8 effort intent=medium (unsupported) falls back to default high', () => {
    expect(resolveReasoning(mistralSpec, 'medium')).toEqual({ reasoning_effort: 'high' });
  });

  // T1.9：effort 型 intent=false → reasoning_effort none
  it('T1.9 effort intent=false returns reasoning_effort none', () => {
    expect(resolveReasoning(mistralSpec, false)).toEqual({ reasoning_effort: 'none' });
  });

  // T1.10：effort 型 intent=true + defaultOverride="medium"（不在 levels 内）→ 回退 high
  it('T1.10 effort intent=true with unsupported defaultOverride falls back to default', () => {
    expect(resolveReasoning(mistralSpec, true, 'medium')).toEqual({ reasoning_effort: 'high' });
  });

  // T1.10b：effort 型 intent=true + defaultOverride="none"（在 levels 内）→ 用 override
  it('T1.10b effort intent=true with supported defaultOverride uses override', () => {
    expect(resolveReasoning(mistralSpec, true, 'none')).toEqual({ reasoning_effort: 'none' });
  });

  // T1.10c：effort 型 指定档位不被 defaultOverride 覆盖（intent=none + override=high → none）
  it('T1.10c effort explicit supported level not overridden by defaultOverride', () => {
    expect(resolveReasoning(mistralSpec, 'none', 'high')).toEqual({ reasoning_effort: 'none' });
  });
});
