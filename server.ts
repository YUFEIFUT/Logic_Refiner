import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { initDb, saveRefinement, getRefinements, getRefinementById, deleteRefinement, createRefinement, updateRefinement, updateRefinementInput } from "./src/db";
import type { Database as SqlJsDatabase } from "sql.js";

dotenv.config();

const app = express();
const PORT = 3000;
let db: SqlJsDatabase;

app.use(express.json());

// Initialize Xiaomi MiMo configuration
const MIMO_API_KEY = process.env.MIMO_API_KEY;
if (!MIMO_API_KEY) {
  console.error("MIMO_API_KEY is not configured. Please set it in .env file.");
  process.exit(1);
}
const MODEL_NAME = "mimo-v2.5-pro";
const ENDPOINT = "https://api.xiaomimimo.com/v1/chat/completions";

// Helper function with retry for API quota / transient errors
async function generate(prompt: string, systemInstruction: string, retries = 5) {
  const enhancedSystemInstruction = systemInstruction + 
    "\n重要格式提示：当你输出任何必须的数学公式、定量变量或严密的逻辑代数式时，请使用标准的 LaTeX 语法。行内公式使用单个美元符号 $...$，块级/段落公式使用双美元符号 $$...$$。但请极力避免将非数量化的现实抽象概念生搬硬套进一个生硬造作的伪物理或数学公式中。";

  for (let i = 0; i < retries; i++) {
    try {
      // Add a small artificial delay to avoid hitting rate limits too fast
      // await new Promise(resolve => setTimeout(resolve, 800));
      
      const response = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          "api-key": MIMO_API_KEY,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: MODEL_NAME,
          messages: [
            {
              role: "system",
              content: enhancedSystemInstruction
            },
            {
              role: "user",
              content: prompt
            }
          ],
          temperature: 0.8,
          top_p: 0.95,
          max_completion_tokens: 131072
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Xiaomi MiMo API Error (${response.status}): ${errorText}`);
      }

      const data: any = await response.json();
      const content = data.choices?.[0]?.message?.content;
      if (content === undefined || content === null) {
        throw new Error("Invalid API response format: " + JSON.stringify(data));
      }
      return content;
    } catch (error: any) {
      console.error(`Attempt ${i + 1} failed:`, error.message);
      const isQuotaError = error.message?.includes("429") || error.message?.includes("RESOURCE_EXHAUSTED") || error.message?.toLowerCase().includes("quota") || error.message?.toLowerCase().includes("limit");
      if (isQuotaError && i < retries - 1) {
        const waitTime = 5000 + (i * 10000);
        console.log(`Quota or rate limit hit (Attempt ${i + 1}), waiting ${waitTime}ms before retry...`);
        // await new Promise(resolve => setTimeout(resolve, waitTime));
        continue;
      }
      if (i === retries - 1) {
        throw error;
      }
      // Wait a bit on normal error before retry
      // await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  throw new Error("Maximum retries reached for API generation.");
}

// Helper function with thinking (reasoning) enabled
async function generateWithThinking(prompt: string, systemInstruction: string, retries = 5) {
  const enhancedSystemInstruction = systemInstruction +
    "\n重要格式提示：当你输出任何必须的数学公式、定量变量或严密的逻辑代数式时，请使用标准的 LaTeX 语法。行内公式使用单个美元符号 $...$，块级/段落公式使用双美元符号 $$...$$。但请极力避免将非数量化的现实抽象概念生搬硬套进一个生硬造作的伪物理或数学公式中。";

  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          "api-key": MIMO_API_KEY,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: MODEL_NAME,
          messages: [
            {
              role: "system",
              content: enhancedSystemInstruction
            },
            {
              role: "user",
              content: prompt
            }
          ],
          temperature: 0.8,
          top_p: 0.95,
          max_completion_tokens: 131072,
          thinking: {
            type: "enabled"
          }
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Xiaomi MiMo API Error (${response.status}): ${errorText}`);
      }

      const data: any = await response.json();
      const content = data.choices?.[0]?.message?.content;
      if (content === undefined || content === null) {
        throw new Error("Invalid API response format: " + JSON.stringify(data));
      }
      // Log reasoning content if present
      const reasoningContent = data.choices?.[0]?.message?.reasoning_content;
      if (reasoningContent) {
        console.log(`[Thinking] reasoning_tokens=${data.usage?.completion_tokens_details?.reasoning_tokens ?? 'N/A'}`);
      }
      return content;
    } catch (error: any) {
      console.error(`Attempt ${i + 1} failed:`, error.message);
      const isQuotaError = error.message?.includes("429") || error.message?.includes("RESOURCE_EXHAUSTED") || error.message?.toLowerCase().includes("quota") || error.message?.toLowerCase().includes("limit");
      if (isQuotaError && i < retries - 1) {
        const waitTime = 5000 + (i * 10000);
        console.log(`Quota or rate limit hit (Attempt ${i + 1}), waiting ${waitTime}ms before retry...`);
        continue;
      }
      if (i === retries - 1) {
        throw error;
      }
    }
  }
  throw new Error("Maximum retries reached for API generation.");
}

app.get("/api/refine", async (req, res) => {
  const { input: inputQuery, cycles: cyclesQuery, id: idQuery } = req.query;
  const input = inputQuery as string;
  const cycles = parseInt(cyclesQuery as string) || 1;
  const recordId = idQuery ? parseInt(idQuery as string) : null;

  console.log(`[GET /api/refine] Starting refinement: input="${input}", cycles=${cycles}, recordId=${recordId}`);

  if (!input) {
    return res.status(400).json({ error: "Missing input" });
  }

  // Set headers for SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const sendEvent = (data: any) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    console.log(`Refining: "${input}" with ${cycles} cycles.`);

    // Collect stages for database storage
    const collectedStages: { name: string; title: string; content: string }[] = [];

    // --- STEP 1: The Architect ---
    sendEvent({ log: "架构组正在解析原始逻辑空间..." });
    const architectPrompt = `将以下输入转化为基本的核心因果逻辑结构，识别背后的变量关系与隐含假设。

    如果输入是一个问题，先给出一个你认为最合理、最有解释力的初步回答或立场，然后对该回答进行逻辑解构。
    如果输入是一个观点或命题，直接进行逻辑解构。

    【注意】：请避免使用生硬、造作的物理/数学公式形式。关注于核心概念之间的因果推导与哲学结构。
    【输出要求】：最终输出必须是一个明确的、可被证伪的逻辑结构（而非一个问题分析或开放式讨论），便于后续进行压力测试。

    输入： "${input}"`;
    const architectSystem = "你是 'The Architect'（架构师）。你的任务是剖析表面观点的因果链条，发现隐藏的底层变量，输出清晰的逻辑演绎和核心假设。无论输入是问题还是命题，你都必须产出一个明确的逻辑立场作为后续精炼的起点。请使用中文。";
    const architectOutput = await generateWithThinking(architectPrompt, architectSystem);
    sendEvent({ stage: "architect", content: architectOutput });
    collectedStages.push({ name: "architect", title: "逻辑解构 (Architect)", content: architectOutput });

    let currentLogic = architectOutput;
    let lastRefinement = "";

    // --- ITERATION LOOP ---
    for (let c = 1; c <= cycles; c++) {
      sendEvent({ log: `第 ${c}/${cycles} 轮迭代：红方部队正在寻找逻辑死角...`, cycle: c });
      
      // STEP 2: Red Team
      const redTeamPrompt = `基于此逻辑结构：
      原始观点： "${input}"
      当前逻辑： ${currentLogic}
      ${lastRefinement ? `上一轮修正要点： ${lastRefinement}` : ""}

      请按以下步骤进行：

      第一步：理解确认
      用你自己的话，简要复述当前逻辑的核心论点和关键变量关系（2-3 句话）。
      这一步的目的是确认你真正理解了对方在说什么，而不是攻击一个你误解的版本。

      第二步：精准反驳
      基于你的理解，列出 3-5 个有力的反例或边界情况。每个反例必须：
      1. 针对当前逻辑的实际论点，而非你复述时可能引入的简化
      2. 在当前逻辑的讨论层级内有效（如逻辑在讨论认知现象，就不得用量子物理等不同层级的场景来反驳）
      3. 说明该反例具体击中了当前逻辑的哪个环节（前提、推理链条、隐含假设）`;
      const redTeamSystem = "你是 'The Red Team'。你是一个精准的逻辑批评者。你的任务是深入理解当前逻辑后，找出其在现实世界中无法闭环的关键弱点。你的反驳必须建立在对原逻辑的准确理解之上，攻击实际的逻辑缺陷，而非曲解后的稻草人。请使用中文。";
      const redTeamOutput = await generateWithThinking(redTeamPrompt, redTeamSystem);
      sendEvent({ stage: "redteam", content: redTeamOutput, cycle: c });
      collectedStages.push({ name: "redteam", title: `红方压力测试 #${c} (Red Team)`, content: redTeamOutput });

      sendEvent({ log: `第 ${c}/${cycles} 轮迭代：合成器正在重塑逻辑...`, cycle: c });
      
      // STEP 3: Synthesizer
      const synthesizerPrompt = `原始观点： "${input}"
      当前逻辑： ${currentLogic}
      红方反例： ${redTeamOutput}
      ${lastRefinement ? `上一轮修正要点： ${lastRefinement}` : ""}

      请按以下步骤进行：

      第一步：反例质量评估
      逐个审视红方的反例，判断其有效性：
      - 对于成立的反例：说明它击中了当前逻辑的哪个具体弱点
      - 对于不成立的反例：说明为什么不成立（如：曲解了原逻辑、范畴错位、与当前逻辑已处理的问题重复）
      - 对于重复的反例（当前逻辑已覆盖或上一轮修正要点已处理）：标注为已覆盖

      第二步：逻辑精炼
      仅基于你判定为有效的反例，对逻辑进行"非线性"提炼。
      1. 剥离表面陈词滥调和鸡汤噪音。
      2. 引入更本质的隐性变量（如认知边界、环境熵增、非线性反馈）来融合红方的质疑。
      3. 产出一个更深刻、更具包容性的哲学与理性底层逻辑关系（不要生搬硬套物理或代数方程式，关注概念融合与逻辑深度）。
      4. 【核心约束】你产出的逻辑必须与原始观点"${input}"相关，是对该观点的深化或修正，而非脱离主题的新创造。
      5. 【证伪约束】新逻辑应比当前逻辑更难找到反例。如果无法做到，需明确说明当前逻辑已是最佳状态。
      6. 【简洁原则】尽可能简洁（奥卡姆剃刀原则），不要引入不必要的变量或条件，准确描述变量之间的因果关系，不多不少。`;
      const synthesizerSystem = "你是 'The Synthesizer'。你合成对抗性的意见并重塑更强壮的真理体系。请使用中文。";
      const synthesizerOutput = await generateWithThinking(synthesizerPrompt, synthesizerSystem);
      currentLogic = synthesizerOutput;
      lastRefinement = synthesizerOutput;
      sendEvent({ stage: "synthesizer", content: synthesizerOutput, cycle: c });
      collectedStages.push({ name: "synthesizer", title: `合成与剥离 #${c} (Synthesizer)`, content: synthesizerOutput });
    }

    // --- STEP 4: The Boundary Definer ---
    sendEvent({ log: "终态分析组正在划定真立场域..." });
    const boundaryPrompt = `原始观点： "${input}"
    最终迭代后的精炼逻辑： ${currentLogic}

    1. 定义该逻辑有效的"场域"（适用空间与适用限度）。
    2. 评估该逻辑在复杂系统下的稳定性和局限性。
    3. 提供一个关于此真理在现实世界中成立的概率或贝叶斯认知建议。
    4. 【核心约束】你的分析必须与原始观点"${input}"相关，明确说明精炼后的逻辑如何回应了原始观点。`;
    const boundarySystem = "你是 'The Boundary Definer'。你确定人类认知的边界。请使用中文。";
    const boundaryOutput = await generateWithThinking(boundaryPrompt, boundarySystem);
    sendEvent({ stage: "boundary", content: boundaryOutput });
    collectedStages.push({ name: "boundary", title: "边界判定 (Boundary Definer)", content: boundaryOutput });

    // --- STEP 5: Final Crystallization ---
    sendEvent({ log: "正在提炼最终结论..." });
    const crystallizationPrompt = `请基于以下所有分析过程，产出一个经过证伪检验的、简洁的、难以反驳的逻辑表述。

    分析过程：
    - 初始架构：${architectOutput}
    - 最终演化逻辑：${currentLogic}
    - 边界分析：${boundaryOutput}
    - 原始命题： "${input}"

    【核心标准 - 极其重要】：
    1. 难以证伪：在目前已知的认知范围内，找不到轻易推翻它的反例
    2. 奥卡姆剃刀：表述尽可能简洁，不引入不必要的变量或条件——真理往往是简单的
    3. 准确描述因果关系：不多不少，恰好说清楚变量之间的本质关系
    4. 与原始命题相关：必须是对原始命题"${input}"的精炼，而非脱离主题的新创造
    5. 具备系统性视角：揭示命题在更大系统中的位置、边界和相互作用

    【禁止事项】：
    - 绝对不要产出"形而上""震撼""充满张力"等形式化表述
    - 绝对不要将抽象概念强行塞进数学或物理公式

    【期望结果】：
    一个简洁、准确、难以反驳的逻辑表述，例如：
    "努力是成功的必要非充分条件，其有效性受方向选择、环境结构和随机因素共同调节。"

    仅输出这句精炼结论，绝不要带有任何前言、引言、多余说明。`;
    const crystallizationSystem = "你是 'The Crystallizer'。你负责产出经过证伪检验的、简洁的、难以反驳的逻辑表述。实事求是、准确描述因果关系，符合奥卡姆剃刀原则，具备系统性视角。请使用中文，直接给出结论，无需废话。";
    const finalLogic = await generateWithThinking(crystallizationPrompt, crystallizationSystem);
    sendEvent({ stage: "finalLogic", content: finalLogic, actualCycles: cycles });

    // --- STEP 6: The Explainer ---
    sendEvent({ log: "解读者正在解读最终结论..." });
    const explainerPrompt = `请对以下经过证伪检验的逻辑表述进行通俗易懂的解读：
    最终结论：${finalLogic}
    
    1. 用通俗、生动但绝不廉价的语言，解读该结论的核心含义与逻辑关系。
    2. 提供 2 个生活或工作中的实际对照/应用例子，帮助用户透彻理解这一结论。`;
    const explainerSystem = "你是 'The Explainer'。你用通俗易懂的方式解读经过证伪检验的逻辑表述，帮助用户理解结论背后的因果关系和实际应用。请使用中文。";
    const explanation = await generateWithThinking(explainerPrompt, explainerSystem);
    sendEvent({ stage: "explanation", content: explanation });

    // Update or create refinement record in database
    if (recordId) {
      console.log(`[GET /api/refine] Updating existing record id=${recordId}`);
      updateRefinement(db, recordId, {
        finalLogic,
        explanation,
        stages: collectedStages,
      });
      sendEvent({ refinementId: recordId });
    } else {
      // Fallback: create new record (for backward compatibility)
      console.log(`[GET /api/refine] No recordId provided, creating new record`);
      const refinementId = saveRefinement(db, {
        input,
        finalLogic,
        explanation,
        stages: collectedStages,
        cycles,
      });
      console.log(`[GET /api/refine] Created new record with id=${refinementId}`);
      sendEvent({ refinementId });
    }

    sendEvent({ done: true });
    res.end();

  } catch (error: any) {
    console.error("Error in refinement:", error);
    try {
      sendEvent({
        stage: "error",
        message: error.message?.includes("429") || error.message?.includes("QUOTA")
          ? "API 配额已耗尽。请稍后再试或降低演化深度。"
          : (error.message || "演化引擎发生未预期的核心崩溃。")
      });
      res.end();
    } catch (e) {
      console.error("Failed to send error event:", e);
    }
  }
});

// API: Get refinement history
app.get("/api/refinements", (req, res) => {
  // const limit = parseInt(req.query.limit as string) || 20;
  const refinements = getRefinements(db);
  res.json(refinements);
});

// API: Get single refinement by id
app.get("/api/refinements/:id", (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    return res.status(400).json({ error: "Invalid id" });
  }
  const refinement = getRefinementById(db, id);
  if (!refinement) {
    return res.status(404).json({ error: "Not found" });
  }
  res.json(refinement);
});

// API: Create refinement (empty record)
app.post("/api/refinements", (req, res) => {
  const { input, cycles } = req.body;
  if (!input || typeof input !== 'string') {
    return res.status(400).json({ error: "Missing or invalid input" });
  }
  const cyclesNum = parseInt(cycles) || 1;
  console.log(`[POST /api/refinements] Creating new record: input="${input}", cycles=${cyclesNum}`);
  const id = createRefinement(db, input, cyclesNum);
  console.log(`[POST /api/refinements] Created record with id=${id}`);
  res.json({ id });
});

// API: Update refinement by id
app.put("/api/refinements/:id", (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    return res.status(400).json({ error: "Invalid id" });
  }
  const { finalLogic, explanation, stages } = req.body;
  const updated = updateRefinement(db, id, { finalLogic, explanation, stages });
  if (!updated) {
    return res.status(404).json({ error: "Not found" });
  }
  res.json({ success: true });
});

// API: Rename refinement input
app.put("/api/refinements/:id/input", (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    return res.status(400).json({ error: "Invalid id" });
  }
  const { input } = req.body;
  if (typeof input !== 'string' || !input.trim()) {
    return res.status(400).json({ error: "Missing or invalid input" });
  }
  const updated = updateRefinementInput(db, id, input.trim());
  if (!updated) {
    return res.status(404).json({ error: "Not found" });
  }
  res.json({ success: true });
});

// API: Delete refinement by id
app.delete("/api/refinements/:id", (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    return res.status(400).json({ error: "Invalid id" });
  }
  const deleted = deleteRefinement(db, id);
  if (!deleted) {
    return res.status(404).json({ error: "Not found" });
  }
  res.json({ success: true });
});

async function startServer() {
  // Initialize database
  db = await initDb();
  console.log("Database initialized.");

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`LogicRefiner running on http://localhost:${PORT}`);
  });
}

startServer();
