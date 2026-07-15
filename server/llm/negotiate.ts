// 推理协商纯函数（第二代：能力 ∩ 意图 → wire 字段）
// 零 I/O、零副作用，最优先 TDD。

import type { ReasoningSpec } from "./types";

/** 调用层表达的推理意图（厂商中立） */
export type ReasoningIntent =
  | boolean
  | "none" | "minimal" | "low" | "medium" | "high" | "xhigh";

/**
 * 把"调用意图"翻译成"请求体里的字段值"。
 *
 * @param spec 模型推理能力声明（来自登记表）；undefined 表示模型不支持推理
 * @param intent 调用层意图；undefined 表示调用者没表达（不注入任何推理字段）
 * @param defaultOverride 环境变量 LLM_REASONING_DEFAULT 提供的兜底档覆盖（仅 effort 型 + intent===true 生效）
 * @returns 注入到请求体的字段键值对；返回 {} 表示不注入任何推理字段
 *
 * 关键语义：
 *  - intent===undefined（没表达）≠ intent===false（显式关闭）。前者不注入，后者发"关"值。
 *  - toggle 型：强度被忽略；"none" 视为关。
 *  - effort 型：intent===true 时用 defaultOverride，但 defaultOverride 必须在 r.levels 内，否则回退 r.default；
 *    指定档不在 levels 内也回退 r.default（指定档不被 defaultOverride 覆盖）。
 */
export function resolveReasoning(
  spec: ReasoningSpec | undefined,
  intent: ReasoningIntent | undefined,
  defaultOverride?: string
): Record<string, unknown> {
  if (!spec?.request) return {};              // 模型不支持推理 → 不传
  if (intent === undefined) return {};         // 调用者没表达意图 → 不传
  const r = spec.request;

  if (r.kind === "toggle") {
    // 只开/关；意图里的强度被忽略（含 "none" 也视为关）
    const isOn = intent === true || (typeof intent === "string" && intent !== "none");
    return { [r.field]: isOn ? r.on : r.off };
  }

  // effort 型
  if (intent === false) return { [r.field]: "none" };                          // 显式关闭
  if (intent === true) {
    // defaultOverride 必须在模型支持档位内，否则回退 r.default（与"指定档越界回退"语义一致）。
    // 例：mistral-medium-3-5 仅支持 high/none，若 LLM_REASONING_DEFAULT=medium，则回退 high，避免运行时 400。
    const level = defaultOverride && r.levels?.includes(defaultOverride) ? defaultOverride : r.default;
    return { [r.field]: level };
  }
  // 指定了档位：不在支持列表内则回退兜底（指定档位不被 defaultOverride 覆盖）
  const level = r.levels?.includes(intent) ? intent : r.default;
  return { [r.field]: level };
}
