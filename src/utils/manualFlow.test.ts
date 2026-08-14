import { describe, it, expect } from "vitest";
import {
  buildSteps,
  buildStepPrompt,
  applyStepResult,
  type ManualContext,
} from "./manualFlow";

function emptyCtx(input: string, cycles: number): ManualContext {
  return {
    input,
    cycles,
    architectOutput: "",
    currentLogic: "",
    redTeamOutput: "",
    boundaryOutput: "",
    finalLogic: "",
    explanation: "",
  };
}

describe("buildSteps", () => {
  it("cycles=1 时生成 6 步（architect + redteam/synth + boundary + crystallization + explainer）", () => {
    const steps = buildSteps(1);
    expect(steps.map((s) => s.kind)).toEqual([
      "architect",
      "redteam",
      "synthesizer",
      "boundary",
      "crystallization",
      "explainer",
    ]);
    expect(steps).toHaveLength(6);
  });

  it("cycles=2 时生成 8 步（每轮 redteam+synthesizer 各一次）", () => {
    const steps = buildSteps(2);
    expect(steps.map((s) => s.kind)).toEqual([
      "architect",
      "redteam",
      "synthesizer",
      "redteam",
      "synthesizer",
      "boundary",
      "crystallization",
      "explainer",
    ]);
    expect(steps).toHaveLength(8);
    // 每轮 cycle 编号递增
    const reds = steps.filter((s) => s.kind === "redteam");
    expect(reds.map((s) => s.cycle)).toEqual([1, 2]);
  });
});

describe("buildStepPrompt", () => {
  it("architect 使用架构 system 且用户提示包含输入", () => {
    const p = buildStepPrompt({ kind: "architect" }, emptyCtx("努力就会成功", 1));
    expect(p.system).toContain("Architect");
    expect(p.user).toContain("努力就会成功");
  });

  it("redteam 用户提示包含当前逻辑，cycle 编号进入标题", () => {
    const ctx = { ...emptyCtx("x", 1), currentLogic: "当前逻辑文本" };
    const p = buildStepPrompt({ kind: "redteam", cycle: 2 }, ctx);
    expect(p.user).toContain("当前逻辑文本");
    expect(p.title).toContain("#2");
  });

  it("synthesizer 用户提示包含红方反例", () => {
    const ctx = { ...emptyCtx("x", 1), currentLogic: "L", redTeamOutput: "反例文本" };
    const p = buildStepPrompt({ kind: "synthesizer", cycle: 1 }, ctx);
    expect(p.user).toContain("反例文本");
  });

  it("crystallization 用户提示包含架构/当前逻辑/边界/输入", () => {
    const ctx = {
      ...emptyCtx("命题", 1),
      architectOutput: "架构",
      currentLogic: "逻辑",
      boundaryOutput: "边界",
    };
    const p = buildStepPrompt({ kind: "crystallization" }, ctx);
    expect(p.user).toContain("架构");
    expect(p.user).toContain("逻辑");
    expect(p.user).toContain("边界");
    expect(p.user).toContain("命题");
  });

  it("explainer 用户提示包含最终结论", () => {
    const ctx = { ...emptyCtx("x", 1), finalLogic: "最终结论" };
    const p = buildStepPrompt({ kind: "explainer" }, ctx);
    expect(p.user).toContain("最终结论");
  });
});

describe("applyStepResult", () => {
  it("architect 结果写入 architectOutput 与 currentLogic，并产出阶段", () => {
    const { ctx, stage } = applyStepResult(emptyCtx("x", 1), { kind: "architect" }, "A架构结果");
    expect(ctx.architectOutput).toBe("A架构结果");
    expect(ctx.currentLogic).toBe("A架构结果");
    expect(stage).toMatchObject({ name: "architect", content: "A架构结果" });
  });

  it("synthesizer 结果更新 currentLogic", () => {
    const { ctx, stage } = applyStepResult(emptyCtx("x", 1), { kind: "synthesizer", cycle: 1 }, "S新逻辑");
    expect(ctx.currentLogic).toBe("S新逻辑");
    expect(stage?.name).toBe("synthesizer");
  });

  it("crystallization 只写 finalLogic，不产出阶段卡", () => {
    const { ctx, stage } = applyStepResult(emptyCtx("x", 1), { kind: "crystallization" }, "F结论");
    expect(ctx.finalLogic).toBe("F结论");
    expect(stage).toBeNull();
  });

  it("explainer 只写 explanation，不产出阶段卡", () => {
    const { ctx, stage } = applyStepResult(emptyCtx("x", 1), { kind: "explainer" }, "E解读");
    expect(ctx.explanation).toBe("E解读");
    expect(stage).toBeNull();
  });

  it("thinking 被写入阶段卡", () => {
    const { stage } = applyStepResult(emptyCtx("x", 1), { kind: "boundary" }, "B", "思考过程");
    expect(stage?.thinking).toBe("思考过程");
  });
});