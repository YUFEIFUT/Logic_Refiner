// 推理响应解析纯函数（第二代）
// 从 API 响应里抽取"最终答案字符串"，处理 MiMo 字符串与 Mistral chunk 数组两种形态。

import type { ProviderSpec } from "./types";

/**
 * 从 API 响应里抽取"最终答案字符串"。
 *
 * @param data API 返回的 JSON（期望含 choices[0].message）
 * @param spec provider 能力声明；undefined 或未声明 reasoning 时按 string 处理
 * @returns 最终答案字符串（思考内容不对外暴露）
 *
 * 三种情形：
 *  - chunk-array 型（Mistral 开推理）：content 是数组，抽 type==="text" 的 text
 *  - chunk-array 型但 content 是字符串（Mistral 未开推理）：直接返回该字符串
 *  - string 型（MiMo 等，含 openai/deepseek 等）：content 即答案
 */
export function extractAnswer(
  data: any,
  spec: ProviderSpec | undefined
): string {
  const msg = data?.choices?.[0]?.message;
  if (msg === undefined || msg === null) {
    throw new Error("Invalid API response format: " + JSON.stringify(data));
  }

  if (spec?.reasoning?.response.format === "chunk-array") {
    const content = msg.content;
    if (Array.isArray(content)) {
      // 开启了推理：content 是 chunk 数组，抽取 type==="text" 的 text
      const textChunk = content.find((c: any) => c?.type === "text");
      if (!textChunk || typeof textChunk.text !== "string") {
        throw new Error("No text chunk in reasoning response: " + JSON.stringify(content));
      }
      return textChunk.text;
    }
    if (typeof content === "string") {
      // 未开启推理：content 直接是最终答案字符串（Mistral 不推理时即此情形）
      return content;
    }
    throw new Error("Expected chunk-array or string content but got: " + JSON.stringify(content));
  }

  // 默认 string 型（MiMo 等）：content 即答案
  if (typeof msg.content !== "string") {
    throw new Error("Expected string content but got: " + JSON.stringify(msg.content));
  }
  return msg.content;
}
