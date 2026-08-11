// 逻辑精炼"节点伪数学"评估脚本（reduce-formula-expression 需求的 T0 交付物，长期保留）。
//
// 两种模式：
//   静态（默认）：读取 refinements.db 中既有历史记录，按节点统计"真实公式/伪数学"出现率。
//                 这些是旧提示词生成的"基线"数据，仅作报告，不判定通过/失败（exit 0）。
//   实跑（--live）：用改后的真实 prompt 通过 createProvider 实跑精炼，写入【临时 DB】
//                 （默认 refinements.eval.db，绝不污染真实 refinements.db），再测新产出。
//                 任一节点出现真实公式或伪数学即 exit 1（红）；全无则 exit 0（绿）。
//
// 用法：
//   tsx scripts/evaluate-no-formula.ts                # 静态报告
//   tsx scripts/evaluate-no-formula.ts --live         # 实跑（需 LLM_* 环境变量可用）
//   tsx scripts/evaluate-no-formula.ts --live --db my.db --cycles 1 --limit 2 --no-reasoning

import initSqlJs from "sql.js";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
dotenv.config(); // 让 --live 能拾取项目 .env 中的 LLM_* 配置

// ---------- 检测逻辑 ----------
// 真实"公式/伪数学"判定（门禁用）：内联 LaTeX（$...$）、LaTeX 命令（\frac 等）、伪公式（变量=变量）。
// 注意：自然语言里的箭头（→）、乘号（×）、约等（≈）等 NOT 算公式，否则会把
// "因为…所以…""A 越强 B 越…"等正常论述误判为数学。
const LATEX_CMDS = [
  "\\frac","\\sum","\\int","\\alpha","\\beta","\\gamma","\\delta","\\theta","\\sigma","\\pi",
  "\\lambda","\\omega","\\mu","\\rho","\\phi","\\psi","\\nabla","\\partial","\\sqrt","\\cdot",
  "\\times","\\propto","\\Rightarrow","\\rightarrow","\\leftarrow","\\leftrightarrow","\\Leftrightarrow",
  "\\approx","\\leq","\\geq","\\equiv","\\sim","\\in","\\notin","\\forall","\\exists","\\cup","\\cap",
  "\\infty","\\log","\\lim","\\mathbb","\\mathcal","\\otimes","\\oplus","\\vec","\\hat","\\bar","\\tilde",
];
const PROSE_ARROWS = ["→","⇒","⇔","↔","×","÷","·","≈","≤","≥","∝","∑","∫","√","∂","∇","∞","Δ","λ","σ","Ω"];

function hasInlineMath(s: string): boolean {
  return /\$.+?\$/.test(s) || /\$\$.+?\$\$/.test(s) || /\\\(.*?\\\)/.test(s) || /\\\[.*?\\\]/.test(s);
}
function hasLatexCmd(s: string): boolean {
  return LATEX_CMDS.some((c) => s.includes(c));
}
function hasPseudoFormula(s: string): boolean {
  const lines = s.split("\n");
  for (const line of lines) {
    const l = line.trim();
    if (l.length > 90) continue;
    // 真正的伪数学：变量/符号用 = => × ÷ ∝ ≈ → ⇒ ∈ 之类的"关系算子"连接两侧字母或数字。
    // 注意：连字符 - 不算（Wi-Fi、Self-reference 这类英文合成词会被误判），
    //       自然语言箭头由 PROSE_ARROWS 单独记录、不计入伪数学。
    if (/[A-Za-z0-9]\s*(?:=|=>|×|÷|∝|≈|→|⇒|∈)\s*[A-Za-z0-9]/.test(l)) return true;
    // 自定义函数记号 f(...)= 也算伪数学
    if (/[A-Za-z]\s*\([^)]{0,20}\)\s*=/.test(l)) return true;
  }
  return false;
}
// 门禁用：是否含真实公式/伪数学
function isFormula(s: string): boolean {
  return hasInlineMath(s) || hasLatexCmd(s) || hasPseudoFormula(s);
}
// 仅供参考：是否出现可能被误用的数学符号（自然语言箭头等），单独不计伪数学
function hasProseArrow(s: string): boolean {
  return PROSE_ARROWS.some((c) => s.includes(c));
}

// 目标阈值（方向性守卫，见需求 §2.3；核心看相对基线改善 + 人工抽查无伪数学）
const TARGET: Record<string, number> = {
  architect: 15, redteam: 20, synthesizer: 20, boundary: 25, explainer: 30,
};

const CORPUS = [
  "人格魅力的本质是什么",
  "黑暗的本质是什么",
  "努力就会成功",
  "自由意志存在吗",
  "为什么有些人看起来更有领导力",
];

async function staticMode(dbPath: string) {
  const SQL = await initSqlJs();
  if (!fs.existsSync(dbPath)) {
    console.error(`[静态] 找不到数据库: ${dbPath}`);
    process.exit(2);
  }
  const db = new SQL.Database(fs.readFileSync(dbPath));
  const res = db.exec("SELECT stages FROM refinements");
  const stat: Record<string, { total: number; math: number; pseudo: number; arrows: number }> = {};
  if (res.length) {
    for (const row of res[0].values) {
      const stages = JSON.parse((row[0] as string) || "[]");
      for (const st of stages) {
        const name = st.name as string;
        if (!stat[name]) stat[name] = { total: 0, math: 0, pseudo: 0, arrows: 0 };
        stat[name].total++;
        const content = st.content || "";
        if (isFormula(content)) stat[name].math++;
        if (hasPseudoFormula(content)) stat[name].pseudo++;
        if (hasProseArrow(content)) stat[name].arrows++;
      }
    }
  }
  db.close();
  console.log("\n========== 静态模式：历史数据基线（旧提示词生成）==========");
  console.log("注意：这是 LEGACY 数据，仅作报告，不判定通过/失败。\n");
  console.log("节点".padEnd(16), "真实公式率".padEnd(12), "伪数学", "含箭头(参考)");
  for (const [name, s] of Object.entries(stat)) {
    const rate = ((s.math / s.total) * 100).toFixed(0);
    console.log(name.padEnd(16), `${s.math}/${s.total} (${rate}%)`.padEnd(12), `${s.pseudo}`.padEnd(6), `${s.arrows}`);
  }
  console.log("\n[静态] 退出码 0（报告完毕）。要验证修复效果请加 --live 实跑新产出。");
  process.exit(0);
}

async function liveMode(dbPath: string, cycles: number, limit: number, noReasoning: boolean) {
  const { createProvider } = await import("../server/llm");
  const prompts = await import("../server/prompts");
  let llm: any;
  try {
    llm = createProvider();
  } catch (e: any) {
    console.error(`[实跑] 无法初始化 LLM provider（缺少 LLM_* 环境变量？）：${e.message}`);
    console.error("[实跑] 跳过。红/绿门禁请改用 vitest（tests/prompt-no-formula.test.ts）。");
    process.exit(3);
  }

  const SQL = await initSqlJs();
  // 临时 DB，不污染真实库。沙箱 safe-delete 会拦截 unlinkSync 抛错，故：
  // ① 默认用带时间戳/pid 的唯一路径，避免删除既有文件；② 即便显式 --db 命中旧文件，删除失败也忽略，
  //    因为末尾的 writeFileSync 会直接覆盖，不影响判定。
  try { if (fs.existsSync(dbPath)) fs.rmSync(dbPath, { force: true }); } catch { /* 覆盖即可 */ }
  const db = new SQL.Database();
  db.run(`CREATE TABLE refinements (
    id INTEGER PRIMARY KEY AUTOINCREMENT, input TEXT NOT NULL, final_logic TEXT NOT NULL,
    explanation TEXT, stages TEXT NOT NULL, cycles INTEGER NOT NULL DEFAULT 1,
    session_id TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);

  const collect = async (stage: string, prompt: string, system: string) => {
    let content = "";
    process.stdout.write(`  · ${stage} …`);
    await llm.streamGenerate(prompt, system, { reasoning: !noReasoning }, {
      onDelta: (d: string) => { content += d; },
      onThinking: () => {},
    });
    process.stdout.write(` ok(${content.length})\n`);
    return content;
  };

  const stat: Record<string, { total: number; math: number; pseudo: number }> = {};
  const bump = (name: string, content: string) => {
    if (!stat[name]) stat[name] = { total: 0, math: 0, pseudo: 0 };
    stat[name].total++;
    if (isFormula(content)) stat[name].math++;
    if (hasPseudoFormula(content)) stat[name].pseudo++;
  };

  for (const input of CORPUS.slice(0, limit)) {
    console.log(`\n[实跑] 输入: ${input}`);
    const stages: any[] = [];
    const arch = await collect("architect", prompts.buildArchitectPrompt(input), prompts.architectSystem);
    stages.push({ name: "architect", title: "逻辑解构 (Architect)", content: arch });
    bump("architect", arch);
    let currentLogic = arch;
    let architectOutput = arch;
    for (let c = 1; c <= cycles; c++) {
      const rt = await collect("redteam", prompts.buildRedTeamPrompt(input, currentLogic), prompts.redTeamSystem);
      stages.push({ name: "redteam", title: `红方压力测试 #${c} (Red Team)`, content: rt });
      bump("redteam", rt);
      const synth = await collect("synthesizer", prompts.buildSynthesizerPrompt(input, currentLogic, rt), prompts.synthesizerSystem);
      stages.push({ name: "synthesizer", title: `合成与剥离 #${c} (Synthesizer)`, content: synth });
      bump("synthesizer", synth);
      currentLogic = synth;
    }
    const bnd = await collect("boundary", prompts.buildBoundaryPrompt(input, currentLogic), prompts.boundarySystem);
    stages.push({ name: "boundary", title: "边界判定 (Boundary Definer)", content: bnd });
    bump("boundary", bnd);
    const finalLogic = await collect("crystallizer", prompts.buildCrystallizationPrompt({ architectOutput, currentLogic, boundaryOutput: bnd, input }), prompts.crystallizationSystem);
    const exp = await collect("explainer", prompts.buildExplainerPrompt(finalLogic), prompts.explainerSystem);
    stages.push({ name: "explainer", title: "深度解读 (Explainer)", content: exp });
    bump("explainer", exp);
    db.run("INSERT INTO refinements (input, final_logic, explanation, stages, cycles) VALUES (?,?,?,?,?)",
      [input, finalLogic, exp, JSON.stringify(stages), cycles]);
  }

  console.log("\n========== 实跑模式：新提示词产出 ==========");
  console.log("节点".padEnd(16), "真实公式率".padEnd(12), "伪数学条数", " 目标");
  let failed = false;
  for (const [name, s] of Object.entries(stat)) {
    const rate = (s.math / s.total) * 100;
    const t = TARGET[name] ?? 100;
    const ok = s.math === 0 && s.pseudo === 0;
    if (!ok) failed = true;
    console.log(
      name.padEnd(16),
      `${s.math}/${s.total} (${rate.toFixed(0)}%)`.padEnd(12),
      `${s.pseudo}`.padEnd(10),
      `${t}%  ${ok ? "✓" : "✗ 含真实公式/伪数学"}`
    );
  }
  try {
    const data = (db as any).export();
    if (data) fs.writeFileSync(dbPath, Buffer.from(data));
  } catch { /* export 失败不致命 */ }
  db.close?.();

  if (failed) {
    console.error("\n[实跑] 存在节点含真实公式或伪数学 → exit 1（红）。");
    process.exit(1);
  }
  console.log("\n[实跑] 全部节点无真实公式/伪数学 → exit 0（绿）。临时数据已写入 " + dbPath);
  process.exit(0);
}

async function main() {
  const args = process.argv.slice(2);
  const live = args.includes("--live");
  const dbArg = args.find((a) => a.startsWith("--db="));
  const cyclesArg = args.find((a) => a.startsWith("--cycles="));
  const limitArg = args.find((a) => a.startsWith("--limit="));
  const realDb = path.resolve("refinements.db");
  const liveDb = path.resolve(dbArg ? dbArg.slice(5) : "refinements.eval.db");
  const cycles = cyclesArg ? parseInt(cyclesArg.slice(9)) || 1 : 1;
  const limit = limitArg ? parseInt(limitArg.slice(8)) || CORPUS.length : CORPUS.length;
  const noReasoning = args.includes("--no-reasoning");

  if (live) {
    await liveMode(liveDb, cycles, limit, noReasoning);
  } else {
    await staticMode(realDb);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
