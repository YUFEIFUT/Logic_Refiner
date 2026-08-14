// 手动执行模式的前端流程引擎（纯函数，便于 TDD 测试）。
// 状态完全由前端持有；提示词来自共享模块 shared/prompts.ts（与自动模式同一份，零漂移）。
// 阶段顺序与自动模式 server/index.ts 的 runStage 流程保持一致：
//   architect → (redteam → synthesizer) × cycles → boundary → crystallization → explainer

import {
  architectSystem,
  redTeamSystem,
  synthesizerSystem,
  boundarySystem,
  crystallizationSystem,
  explainerSystem,
  buildArchitectPrompt,
  buildRedTeamPrompt,
  buildSynthesizerPrompt,
  buildBoundaryPrompt,
  buildCrystallizationPrompt,
  buildExplainerPrompt,
} from "../../shared/prompts";

export type ManualStepKind =
  | "architect"
  | "redteam"
  | "synthesizer"
  | "boundary"
  | "crystallization"
  | "explainer";

export interface ManualStep {
  kind: ManualStepKind;
  cycle?: number;
}

/** 手动流程的累计上下文（等价于自动模式内部的局部变量组） */
export interface ManualContext {
  input: string;
  cycles: number;
  architectOutput: string;
  currentLogic: string;
  redTeamOutput: string;
  boundaryOutput: string;
  finalLogic: string;
  explanation: string;
}

/** 供落库/展示的阶段卡（与自动模式落库的 stages 结构一致） */
export interface ManualStage {
  name: string;
  title: string;
  content: string;
  thinking?: string;
}

export interface StepPrompt {
  system: string;
  user: string;
  title: string;
  name: string;
}

/** 按 cycles 生成完整步骤序列 */
export function buildSteps(cycles: number): ManualStep[] {
  const steps: ManualStep[] = [{ kind: "architect" }];
  for (let c = 1; c <= cycles; c++) {
    steps.push({ kind: "redteam", cycle: c });
    steps.push({ kind: "synthesizer", cycle: c });
  }
  steps.push({ kind: "boundary" });
  steps.push({ kind: "crystallization" });
  steps.push({ kind: "explainer" });
  return steps;
}

/** 根据当前累计上下文，构建某一步的 system / user / 标题 */
export function buildStepPrompt(step: ManualStep, ctx: ManualContext): StepPrompt {
  switch (step.kind) {
    case "architect":
      return {
        system: architectSystem,
        user: buildArchitectPrompt(ctx.input),
        title: "逻辑解构 (Architect)",
        name: "architect",
      };
    case "redteam":
      return {
        system: redTeamSystem,
        user: buildRedTeamPrompt(ctx.input, ctx.currentLogic),
        title: `红方压力测试 #${step.cycle} (Red Team)`,
        name: "redteam",
      };
    case "synthesizer":
      return {
        system: synthesizerSystem,
        user: buildSynthesizerPrompt(ctx.input, ctx.currentLogic, ctx.redTeamOutput),
        title: `合成与剥离 #${step.cycle} (Synthesizer)`,
        name: "synthesizer",
      };
    case "boundary":
      return {
        system: boundarySystem,
        user: buildBoundaryPrompt(ctx.input, ctx.currentLogic),
        title: "边界判定 (Boundary Definer)",
        name: "boundary",
      };
    case "crystallization":
      return {
        system: crystallizationSystem,
        user: buildCrystallizationPrompt({
          architectOutput: ctx.architectOutput,
          currentLogic: ctx.currentLogic,
          boundaryOutput: ctx.boundaryOutput,
          input: ctx.input,
        }),
        title: "结晶结论 (Crystallizer)",
        name: "crystallizer",
      };
    case "explainer":
      return {
        system: explainerSystem,
        user: buildExplainerPrompt(ctx.finalLogic),
        title: "深度解读 (Explainer)",
        name: "explainer",
      };
  }
}

/**
 * 应用一步的执行结果，返回新的上下文与（若为阶段卡则返回）阶段记录。
 * architect/redteam/synthesizer/boundary 产出阶段卡；
 * crystallization/explainer 分别写入 finalLogic/explanation，不产出阶段卡。
 */
export function applyStepResult(
  prev: ManualContext,
  step: ManualStep,
  content: string,
  thinking?: string
): { ctx: ManualContext; stage: ManualStage | null } {
  const ctx: ManualContext = { ...prev };
  switch (step.kind) {
    case "architect":
      ctx.architectOutput = content;
      ctx.currentLogic = content;
      return { ctx, stage: { name: "architect", title: "逻辑解构 (Architect)", content, thinking } };
    case "redteam":
      ctx.redTeamOutput = content;
      return { ctx, stage: { name: "redteam", title: `红方压力测试 #${step.cycle} (Red Team)`, content, thinking } };
    case "synthesizer":
      ctx.currentLogic = content;
      return { ctx, stage: { name: "synthesizer", title: `合成与剥离 #${step.cycle} (Synthesizer)`, content, thinking } };
    case "boundary":
      ctx.boundaryOutput = content;
      return { ctx, stage: { name: "boundary", title: "边界判定 (Boundary Definer)", content, thinking } };
    case "crystallization":
      ctx.finalLogic = content;
      return { ctx, stage: null };
    case "explainer":
      ctx.explanation = content;
      return { ctx, stage: null };
  }
}