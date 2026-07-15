import { describe, it, expect } from 'vitest';
import { extractAnswer } from './response';
import type { ProviderSpec } from './types';

// 各 provider 的 spec（与登记表一致，仅取必要字段）
const mistralSpec: ProviderSpec = {
  auth: 'bearer',
  maxTokensField: 'max_tokens',
  reasoning: {
    request: {
      kind: 'effort',
      field: 'reasoning_effort',
      levels: ['none', 'minimal', 'low', 'medium', 'high', 'xhigh'],
      default: 'high',
      temperatureMode: 'avoid-zero',
      avoidZeroFallback: 0.8,
    },
    response: { format: 'chunk-array' },
  },
};

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

const openaiSpec: ProviderSpec = { auth: 'bearer' };

describe('extractAnswer', () => {
  // T2.1：标准结构 content 为字符串 → 返回该字符串
  it('T2.1 returns string content for standard response', () => {
    const data = { choices: [{ message: { content: 'answer' } }] };
    expect(extractAnswer(data, mimoSpec)).toBe('answer');
    expect(extractAnswer(data, openaiSpec)).toBe('answer');
    expect(extractAnswer(data, undefined)).toBe('answer');
  });

  // T2.2：Mistral chunk 数组（开推理）→ 抽 type:"text"
  it('T2.2 extracts text chunk from chunk-array content', () => {
    const data = {
      choices: [{
        message: {
          content: [
            { type: 'thinking', thinking: [{ type: 'text', text: '思考过程...' }] },
            { type: 'text', text: '答案' },
          ],
        },
      }],
    };
    expect(extractAnswer(data, mistralSpec)).toBe('答案');
  });

  // T2.2b：Mistral spec 但 content 是字符串（未开推理）→ 返回该字符串
  it('T2.2b returns string content even for chunk-array spec when not reasoning', () => {
    const data = { choices: [{ message: { content: 'plain answer' } }] };
    expect(extractAnswer(data, mistralSpec)).toBe('plain answer');
  });

  // T2.3：chunk 数组但只有 thinking 无 text → 抛错
  it('T2.3 throws when chunk-array has no text chunk', () => {
    const data = {
      choices: [{
        message: {
          content: [{ type: 'thinking', thinking: [{ type: 'text', text: '...' }] }],
        },
      }],
    };
    expect(() => extractAnswer(data, mistralSpec)).toThrow(/No text chunk/);
  });

  // T2.4：chunk-array 型但 content 不是数组也不是字符串 → 抛错
  it('T2.4 throws when chunk-array content is neither array nor string', () => {
    const data = { choices: [{ message: { content: 123 } }] };
    expect(() => extractAnswer(data, mistralSpec)).toThrow(/Expected chunk-array or string/);
  });

  // T2.5：响应缺 choices / message → 抛错
  it('T2.5 throws when response missing choices/message', () => {
    expect(() => extractAnswer({ foo: 'bar' }, mistralSpec)).toThrow(/Invalid API response format/);
    expect(() => extractAnswer({ choices: [] }, mistralSpec)).toThrow(/Invalid API response format/);
    expect(() => extractAnswer({ choices: [{}] }, mistralSpec)).toThrow(/Invalid API response format/);
  });

  // T2.6：string 型 content 非字符串 → 抛错
  it('T2.6 throws when string-spec content is not a string', () => {
    const data = { choices: [{ message: { content: { weird: true } } }] };
    expect(() => extractAnswer(data, mimoSpec)).toThrow(/Expected string content/);
  });

  // T2.7：spec 未声明 reasoning（openai）→ 按 string 处理返回 content
  it('T2.7 treats spec without reasoning as string format', () => {
    const data = { choices: [{ message: { content: 'openai answer' } }] };
    expect(extractAnswer(data, openaiSpec)).toBe('openai answer');
  });
});
