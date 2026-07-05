import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// Initialize Xiaomi MiMo configuration
const MIMO_API_KEY = process.env.MIMO_API_KEY || "sk-crb3qt4kn2ysmq4zpt3c7tqibhzinliytc48wgwonaxs34au";
const MODEL_NAME = "mimo-v2.5-pro";
const ENDPOINT = "https://api.xiaomimimo.com/v1/chat/completions";

// Helper function with retry for API quota / transient errors
async function generate(prompt: string, systemInstruction: string, retries = 5) {
  const enhancedSystemInstruction = systemInstruction + 
    "\n重要格式提示：当你输出任何必须的数学公式、定量变量或严密的逻辑代数式时，请使用标准的 LaTeX 语法。行内公式使用单个美元符号 $...$，块级/段落公式使用双美元符号 $$...$$。但请极力避免将非数量化的现实抽象概念生搬硬套进一个生硬造作的伪物理或数学公式中。";

  for (let i = 0; i < retries; i++) {
    try {
      // Add a small artificial delay to avoid hitting rate limits too fast
      await new Promise(resolve => setTimeout(resolve, 800));
      
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
          max_completion_tokens: 2048
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
        await new Promise(resolve => setTimeout(resolve, waitTime));
        continue;
      }
      if (i === retries - 1) {
        throw error;
      }
      // Wait a bit on normal error before retry
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  throw new Error("Maximum retries reached for API generation.");
}

app.get("/api/refine", async (req, res) => {
  const { input, cycles: cyclesQuery } = req.query;
  const cycles = parseInt(cyclesQuery as string) || 1;
  
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

    // --- STEP 1: The Architect ---
    sendEvent({ log: "架构组正在解析原始逻辑空间..." });
    const architectPrompt = `将以下观点转化为基本的核心因果逻辑结构，识别观点背后的变量关系与隐含假设。
    【注意】：请避免使用生硬、造作的物理/数学公式形式。关注于核心概念之间的因果推导与哲学结构。
    观点： "${input}"`;
    const architectSystem = "你是 'The Architect'（架构师）。你的任务是剖析表面观点的因果链条，发现隐藏的底层变量，输出清晰的逻辑演绎和核心假设。请使用中文。";
    const architectOutput = await generate(architectPrompt, architectSystem);
    sendEvent({ stage: "architect", content: architectOutput });

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
      
      请列出 3-5 个有力的反例、特殊边界情况或导致该逻辑失效的现实场景。
      特别针对当前的逻辑表达寻找矛盾与死角。`;
      const redTeamSystem = "你是 'The Red Team'。你是一个极致的怀疑论者。你的任务是找出当前逻辑在现实世界中无法闭环的证据。请使用中文。";
      const redTeamOutput = await generate(redTeamPrompt, redTeamSystem);
      sendEvent({ stage: "redteam", content: redTeamOutput, cycle: c });

      sendEvent({ log: `第 ${c}/${cycles} 轮迭代：合成器正在重塑逻辑...`, cycle: c });
      
      // STEP 3: Synthesizer
      const synthesizerPrompt = `当前的逻辑体系遭遇了质疑。
      当前逻辑： ${currentLogic}
      红方反例： ${redTeamOutput}
      
      请基于反例对逻辑进行“非线性”提炼。
      1. 剥离表面陈词滥调和鸡汤噪音。
      2. 引入更本质的隐性变量（如认知边界、环境熵增、非线性反馈）来融合红方的质疑。
      3. 产出一个更深刻、更具包容性的哲学与理性底层逻辑关系（不要生搬硬套物理或代数方程式，关注概念融合与逻辑深度）。`;
      const synthesizerSystem = "你是 'The Synthesizer'。你合成对抗性的意见并重塑更强壮的真理体系。请使用中文。";
      const synthesizerOutput = await generate(synthesizerPrompt, synthesizerSystem);
      currentLogic = synthesizerOutput;
      lastRefinement = synthesizerOutput;
      sendEvent({ stage: "synthesizer", content: synthesizerOutput, cycle: c });
    }

    // --- STEP 4: The Boundary Definer ---
    sendEvent({ log: "终态分析组正在划定真立场域..." });
    const boundaryPrompt = `分析最终迭代后的精炼逻辑： ${currentLogic}
    
    1. 定义该逻辑有效的“场域”（适用空间与适用限度）。
    2. 评估该逻辑在复杂系统下的稳定性和局限性。
    3. 提供一个关于此真理在现实世界中成立的概率或贝叶斯认知建议。`;
    const boundarySystem = "你是 'The Boundary Definer'。你确定人类认知的边界。请使用中文。";
    const boundaryOutput = await generate(boundaryPrompt, boundarySystem);
    sendEvent({ stage: "boundary", content: boundaryOutput });

    // --- STEP 5: Final Crystallization ---
    sendEvent({ log: "正在提炼真理晶体..." });
    const crystallizationPrompt = `请基于以下所有分析过程，总结出一个最精炼、最震撼、最具洞察力的“形而上逻辑结论”或“真理律则”。
    分析过程：
    - 初始架构：${architectOutput}
    - 最终演化逻辑：${currentLogic}
    - 边界分析：${boundaryOutput}
    
    【核心禁令 - 极其重要】：
    绝对【不要】将现实的抽象概念强行塞进数学或物理公式里边（例如，绝对不要写类似 $Success = \\int (Effort \\times Luck) dt$ 或 $A = B + C$ 这种拼凑硬套、令人感到违和的别扭公式。这种强行将文字拼凑成伪科学公式的做法非常低幼和造作，应绝对禁止。）。
    
    【期望结果】：
    1. 产出一个在哲学、形而上、逻辑层面极具深度且表意优美的精炼结论或普适规律。例如：“局部秩序的过度追求，往往是以系统更大全局的主动失序（熵增）为代价付出的代偿。”
    2. 它应该是一个深刻的哲学命题或理性的底层因果律陈述句（中文），充满张力与克制的美感，绝非生搬硬套的伪物理或伪代数公式。
    3. 仅输出这句极度精炼的进化真理结论，绝不要带有任何前言、引言、多余说明，也不需要任何 Markdown 格式标题。`;
    const crystallizationSystem = "你负责产出最终的、高度提炼的“真理结晶”。请直接给出那句形而上、极具深度的结论，绝对拒绝任何强行拼凑的公式算式。请使用中文，直接给出该极简真理，无需废话。";
    const finalLogic = await generate(crystallizationPrompt, crystallizationSystem);
    sendEvent({ stage: "finalLogic", content: finalLogic, actualCycles: cycles });

    // --- STEP 6: The Explainer ---
    sendEvent({ log: "布道者正在翻译深奥结论..." });
    const explainerPrompt = `请对以下极具深度、形而上、充满张力的哲学结论进行充满智慧的解读：
    最终结论：${finalLogic}
    
    1. 用通俗、生动但绝不廉价的语言，深度解读该结论背后的运行真谛。
    2. 提供 2 个生活或工作中的实际对照/应用例子，帮助用户透彻理解这一真理。`;
    const explainerSystem = "你是 'The Explainer'。你致力于消除深奥知识的鸿沟，用人类能感同身受的生活艺术来解读形而上真理。请使用中文。";
    const explanation = await generate(explainerPrompt, explainerSystem);
    sendEvent({ stage: "explanation", content: explanation });

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

async function startServer() {
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
