// TDD 红/绿门禁：断言逻辑精炼各节点的 prompt / system 含"反公式强硬约束"，
// 且全局 LaTeX 提示已从"鼓励用公式"降级为"默认自然语言、仅定量可用"。
// 这组测试在改提示词之前必然失败（红），改完之后通过（绿）。

import { describe, it, expect } from "vitest";
import {
  architectSystem, redTeamSystem, synthesizerSystem, boundarySystem,
  crystallizationSystem, explainerSystem,
  buildArchitectPrompt, buildRedTeamPrompt, buildSynthesizerPrompt,
  buildBoundaryPrompt, buildCrystallizationPrompt, buildExplainerPrompt,
} from "../server/prompts";
import { enhanceSystemInstruction } from "../server/llm/enhance";

// 各节点 system 必须导向"不使用数学公式"
const SYSTEMS: [string, string][] = [
  ["architectSystem", architectSystem],
  ["redTeamSystem", redTeamSystem],
  ["synthesizerSystem", synthesizerSystem],
  ["boundarySystem", boundarySystem],
  ["explainerSystem", explainerSystem],
];

describe("各节点 system 指令：导向不使用数学公式", () => {
  for (const [name, sys] of SYSTEMS) {
    it(`${name} 含"不使用数学公式"导向`, () => {
      expect(sys).toContain("不使用数学公式");
    });
  }
  it("crystallizationSystem 保持原样（已达标，不作改动）", () => {
    expect(crystallizationSystem).toContain("经过证伪检验");
    expect(crystallizationSystem).not.toContain("不使用数学公式"); // 其禁止写在其 prompt 内
  });
});

describe("各节点 prompt：含强硬反公式约束", () => {
  it("architect：强硬禁令 + 自然语言范例", () => {
    const p = buildArchitectPrompt("测试命题");
    expect(p).toContain("绝对不要使用 LaTeX 数学公式");
    expect(p).toContain("自然语言的句子清楚描述");
    expect(p).toContain("当观察者的认知框架"); // 白话范例
    expect(p).not.toContain("请避免使用生硬、造作的物理/数学公式形式"); // 旧软约束已替换
  });

  it("redteam：理解确认用自然语言 + 不得沿用公式", () => {
    const p = buildRedTeamPrompt("测试命题", "当前逻辑");
    expect(p).toContain("必须用自然语言完成");
    expect(p).toContain("不得引入或沿用 LaTeX 公式");
  });

  it("synthesizer：绝对不用公式 + 去掉物理味举例", () => {
    const p = buildSynthesizerPrompt("测试命题", "当前逻辑", "红方反例");
    expect(p).toContain("绝对不要使用 LaTeX 公式或符号代数");
    expect(p).not.toContain("环境熵增"); // 物理味举例已移除
  });

  it("boundary：禁止概率等式 / 极限记号", () => {
    const p = buildBoundaryPrompt("测试命题", "当前逻辑");
    expect(p).toContain("不得写成 P(...)");
    expect(p).toContain("κ→0");
  });

  it("explainer：解读不出现公式，必要时翻译", () => {
    const p = buildExplainerPrompt("最终结论");
    expect(p).toContain("不该出现公式");
    expect(p).toContain("翻译成自然语言");
  });

  it("crystallizer：保持原强禁令（未改动）", () => {
    const p = buildCrystallizationPrompt({
      architectOutput: "架构", currentLogic: "逻辑", boundaryOutput: "边界", input: "命题",
    });
    expect(p).toContain("绝对不要将抽象概念强行塞进数学或物理公式");
  });
});

describe("全局 LaTeX 提示（enhanceSystemInstruction）：从鼓励降级为克制", () => {
  it("默认导向：自然语言、不要使用 LaTeX 数学公式或符号代数", () => {
    const out = enhanceSystemInstruction("base system");
    expect(out.startsWith("base system")).toBe(true);
    expect(out).toContain("一律用自然语言表达变量关系与因果");
    expect(out).toContain("不要使用 LaTeX 数学公式或符号代数");
  });

  it("保留定量例外 + 禁伪数学底线，且仍含 'LaTeX' 关键字（兼容 T3.13）", () => {
    const out = enhanceSystemInstruction("base system");
    expect(out).toContain("LaTeX");
    expect(out).toContain("确属定量场景必须使用公式");
    expect(out).toContain("未定义、不可计算的伪数学记号");
  });

  it("旧鼓励句式已移除", () => {
    const out = enhanceSystemInstruction("base system");
    expect(out).not.toContain("当你输出任何必须的数学公式");
    expect(out).not.toContain("请使用标准的 LaTeX 语法");
    expect(out).not.toContain("块级/段落公式使用双美元符号");
  });
});
