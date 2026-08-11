// 提示词反公式约束的"红/绿门禁"（tsx 版）。
//
// 背景：项目内 vitest 在该沙箱环境存在预存的运行期问题（连零依赖的 smoke 测试都会
// 在模块求值期抛 "reading 'config'"，全部 15 个测试文件一致失败），与本次改动无关。
// 为保证 TDD 门禁仍可实际执行，这里用纯 tsx 脚本复刻 tests/prompt-no-formula.test.ts
// 的 15 条断言：任一断言失败即 exit 1（红），全过则 exit 0（绿）。
//
// 用法：
//   tsx scripts/check-prompt-lint.ts

import {
  architectSystem, redTeamSystem, synthesizerSystem, boundarySystem,
  crystallizationSystem, explainerSystem,
  buildArchitectPrompt, buildRedTeamPrompt, buildSynthesizerPrompt,
  buildBoundaryPrompt, buildCrystallizationPrompt, buildExplainerPrompt,
} from "../server/prompts";
import { enhanceSystemInstruction } from "../server/llm/enhance";

let passed = 0;
const failures: string[] = [];
function check(name: string, cond: boolean) {
  if (cond) { passed++; }
  else { failures.push(name); }
}

// ---------- 各节点 system：导向不使用数学公式 ----------
const SYSTEMS: [string, string][] = [
  ["architectSystem", architectSystem],
  ["redTeamSystem", redTeamSystem],
  ["synthesizerSystem", synthesizerSystem],
  ["boundarySystem", boundarySystem],
  ["explainerSystem", explainerSystem],
];
for (const [name, sys] of SYSTEMS) {
  check(`${name} 含"不使用数学公式"`, sys.includes("不使用数学公式"));
}
check("crystallizationSystem 含'经过证伪检验'（保持原样）", crystallizationSystem.includes("经过证伪检验"));
check("crystallizationSystem 不写'不使用数学公式'（禁令在其 prompt 内）", !crystallizationSystem.includes("不使用数学公式"));

// ---------- 各节点 prompt：强硬反公式约束 ----------
const arch = buildArchitectPrompt("测试命题");
check("architect：绝对不要使用 LaTeX 数学公式", arch.includes("绝对不要使用 LaTeX 数学公式"));
check("architect：自然语言的句子清楚描述", arch.includes("自然语言的句子清楚描述"));
check("architect：白话范例（当观察者的认知框架）", arch.includes("当观察者的认知框架"));
check("architect：旧软约束已替换", !arch.includes("请避免使用生硬、造作的物理/数学公式形式"));

const rt = buildRedTeamPrompt("测试命题", "当前逻辑");
check("redteam：必须用自然语言完成", rt.includes("必须用自然语言完成"));
check("redteam：不得引入或沿用 LaTeX 公式", rt.includes("不得引入或沿用 LaTeX 公式"));

const syn = buildSynthesizerPrompt("测试命题", "当前逻辑", "红方反例");
check("synthesizer：绝对不要使用 LaTeX 公式或符号代数", syn.includes("绝对不要使用 LaTeX 公式或符号代数"));
check("synthesizer：物理味举例已移除（环境熵增）", !syn.includes("环境熵增"));

const bnd = buildBoundaryPrompt("测试命题", "当前逻辑");
check("boundary：不得写成 P(...)", bnd.includes("不得写成 P(...)"));
check("boundary：禁止 κ→0 极限记号", bnd.includes("κ→0"));

const exp = buildExplainerPrompt("最终结论");
check("explainer：不该出现公式", exp.includes("不该出现公式"));
check("explainer：翻译成自然语言", exp.includes("翻译成自然语言"));

const cry = buildCrystallizationPrompt({
  architectOutput: "架构", currentLogic: "逻辑", boundaryOutput: "边界", input: "命题",
});
check("crystallizer：保持原强禁令", cry.includes("绝对不要将抽象概念强行塞进数学或物理公式"));

// ---------- 全局 LaTeX 提示：从鼓励降级为克制 ----------
const enh = enhanceSystemInstruction("base system");
check("enhance：以 base system 开头", enh.startsWith("base system"));
check("enhance：一律用自然语言表达变量关系与因果", enh.includes("一律用自然语言表达变量关系与因果"));
check("enhance：不要使用 LaTeX 数学公式或符号代数", enh.includes("不要使用 LaTeX 数学公式或符号代数"));
check("enhance：保留 'LaTeX' 关键字（兼容旧断言）", enh.includes("LaTeX"));
check("enhance：保留定量例外", enh.includes("确属定量场景必须使用公式"));
check("enhance：禁伪数学底线", enh.includes("未定义、不可计算的伪数学记号"));
check("enhance：旧鼓励句式已移除（当你输出任何必须的数学公式）", !enh.includes("当你输出任何必须的数学公式"));
check("enhance：旧鼓励句式已移除（请使用标准的 LaTeX 语法）", !enh.includes("请使用标准的 LaTeX 语法"));
check("enhance：旧鼓励句式已移除（块级/段落公式使用双美元符号）", !enh.includes("块级/段落公式使用双美元符号"));

// ---------- 汇总 ----------
const total = passed + failures.length;
console.log(`\n[提示词门禁] ${passed}/${total} 通过`);
if (failures.length) {
  console.error("失败项：");
  for (const f of failures) console.error("  ✗ " + f);
  console.error("\n[提示词门禁] 存在未满足的约束 → exit 1（红）。");
  process.exit(1);
}
console.log("[提示词门禁] 全部约束满足 → exit 0（绿）。");
process.exit(0);
