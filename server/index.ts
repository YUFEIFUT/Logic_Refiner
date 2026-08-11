import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { initDb, saveRefinement, getRefinements, getRefinementById, deleteRefinement, createRefinement, updateRefinement, updateRefinementInput } from "../src/db";
import { getAuthContext } from "../src/utils/auth";
import { createProvider } from "./llm";
import {
  architectSystem, redTeamSystem, synthesizerSystem, boundarySystem,
  crystallizationSystem, explainerSystem,
  buildArchitectPrompt, buildRedTeamPrompt, buildSynthesizerPrompt,
  buildBoundaryPrompt, buildCrystallizationPrompt, buildExplainerPrompt,
} from "./prompts";
import type { Database as SqlJsDatabase } from "sql.js";

dotenv.config();

const app = express();
const PORT = 3000;
let db: SqlJsDatabase;

app.use(express.json());

// 启动时创建 LLM provider 实例（若 LLM_PROVIDER / LLM_API_KEY 等必填项未配置，此处会抛错导致 server 启动失败）
const llm = createProvider();

app.get("/api/refine", async (req, res) => {
  const { input: inputQuery, cycles: cyclesQuery, id: idQuery, session_id: sessionIdQuery, admin_token: adminTokenQuery, resume_id: resumeIdQuery } = req.query;
  const input = inputQuery as string;
  const cycles = parseInt(cyclesQuery as string) || 1;
  const recordId = idQuery ? parseInt(idQuery as string) : null;
  const resumeId = resumeIdQuery ? parseInt(resumeIdQuery as string) : null;
  const isResume = !!resumeId;
  const adminToken = process.env.ADMIN_TOKEN;
  const isAdmin = !!adminToken && adminTokenQuery === adminToken;
  const { sessionId: headerSessionId } = getAuthContext(req);
  const sessionId = isAdmin ? headerSessionId : (sessionIdQuery as string || headerSessionId);

  console.log(`[GET /api/refine] Starting refinement: input="${input}", cycles=${cycles}, recordId=${recordId}, resumeId=${resumeId}`);

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

  // 流式阶段执行器：发 open 建空卡 → 增量推送 delta/thinking → 发 complete。
  // 返回完整 {content, thinking} 供落库与下游阶段输入。
  const runStage = async (
    stage: string,
    prompt: string,
    system: string,
    title: string,
    cycle?: number
  ): Promise<{ content: string; thinking: string }> => {
    const acc = { content: "", thinking: "" };
    sendEvent({ stage, cycle, name: stage, title, open: true });
    await llm.streamGenerate(prompt, system, { reasoning: true }, {
      onDelta: (d) => {
        acc.content += d;
        sendEvent({ stage, cycle, delta: d });
      },
      onThinking: (t) => {
        acc.thinking += t;
        sendEvent({ stage, cycle, thinking: t });
      },
    });
    sendEvent({ stage, cycle, complete: true });
    return acc;
  };

  try {
    console.log(`Refining: "${input}" with ${cycles} cycles${isResume ? ` (resume from id=${resumeId})` : ""}.`);

    // Collect stages for database storage
    const collectedStages: { name: string; title: string; content: string; thinking?: string }[] = [];

    // --- Resume: load old record and extract stages ---
    let architectOutput = "";
    let currentLogic = "";
    let cycleOffset = 0;

    if (isResume && resumeId) {
      sendEvent({ log: "正在加载历史演化数据..." });
      const oldRecord = getRefinementById(db, resumeId, isAdmin ? undefined : sessionId);
      if (!oldRecord) {
        sendEvent({ stage: "error", message: "续跑失败：找不到原始记录" });
        return res.end();
      }

      let oldStages: { name: string; title: string; content: string; thinking?: string }[] = [];
      try {
        oldStages = JSON.parse(oldRecord.stages);
      } catch (e) {
        sendEvent({ stage: "error", message: "续跑失败：无法解析历史阶段数据" });
        return res.end();
      }

      const architectStage = oldStages.find(s => s.name === "architect" || s.name.includes("架构"));
      const lastSynthStage = [...oldStages].reverse().find(s => s.name === "synthesizer" || s.name.includes("精炼"));

      if (!architectStage || !lastSynthStage) {
        sendEvent({ stage: "error", message: "续跑失败：找不到必要的阶段数据（架构师或合成器）" });
        return res.end();
      }

      architectOutput = architectStage.content;
      currentLogic = lastSynthStage.content;
      cycleOffset = oldRecord.cycles;

      // Start with old stages
      collectedStages.push(...oldStages);

      // Add old finalLogic and explanation as stages for comparison
      if (oldRecord.finalLogic) {
        collectedStages.push({ name: "crystallizer", title: `结晶结论 #${oldRecord.cycles} (Crystallizer)`, content: oldRecord.finalLogic });
      }
      if (oldRecord.explanation) {
        collectedStages.push({ name: "explainer", title: `深度解读 #${oldRecord.cycles} (Explainer)`, content: oldRecord.explanation });
      }

      sendEvent({ log: `已加载 ${cycleOffset} 轮演化的历史数据，开始续跑 ${cycles} 轮...` });
    }

    // --- STEP 1: The Architect (skip if resume) ---
    if (!isResume) {
      sendEvent({ log: "架构组正在解析原始逻辑空间..." });
      const architect = await runStage("architect", buildArchitectPrompt(input), architectSystem, "逻辑解构 (Architect)");
      architectOutput = architect.content;
      currentLogic = architect.content;
      collectedStages.push({ name: "architect", title: "逻辑解构 (Architect)", content: architect.content, thinking: architect.thinking });
    }

    // --- ITERATION LOOP ---
    for (let c = 1; c <= cycles; c++) {
      const cycleNum = cycleOffset + c;
      sendEvent({ log: `第 ${cycleNum}/${cycleOffset + cycles} 轮迭代：红方部队正在寻找逻辑死角...`, cycle: cycleNum });

      // STEP 2: Red Team
      const redTeam = await runStage("redteam", buildRedTeamPrompt(input, currentLogic), redTeamSystem, `红方压力测试 #${cycleNum} (Red Team)`, cycleNum);
      const redTeamOutput = redTeam.content;
      collectedStages.push({ name: "redteam", title: `红方压力测试 #${cycleNum} (Red Team)`, content: redTeam.content, thinking: redTeam.thinking });

      sendEvent({ log: `第 ${cycleNum}/${cycleOffset + cycles} 轮迭代：合成器正在重塑逻辑...`, cycle: cycleNum });

      // STEP 3: Synthesizer
      const synth = await runStage("synthesizer", buildSynthesizerPrompt(input, currentLogic, redTeamOutput), synthesizerSystem, `合成与剥离 #${cycleNum} (Synthesizer)`, cycleNum);
      currentLogic = synth.content;
      collectedStages.push({ name: "synthesizer", title: `合成与剥离 #${cycleNum} (Synthesizer)`, content: synth.content, thinking: synth.thinking });
    }

    // --- STEP 4: The Boundary Definer ---
    sendEvent({ log: "终态分析组正在划定真立场域..." });
    const boundary = await runStage("boundary", buildBoundaryPrompt(input, currentLogic), boundarySystem, "边界判定 (Boundary Definer)");
    const boundaryOutput = boundary.content;
    collectedStages.push({ name: "boundary", title: "边界判定 (Boundary Definer)", content: boundary.content, thinking: boundary.thinking });

    // --- STEP 5: Final Crystallization ---
    sendEvent({ log: "正在提炼最终结论..." });
    const crystallizationPrompt = buildCrystallizationPrompt({ architectOutput, currentLogic, boundaryOutput, input });
    const totalCycles = cycleOffset + cycles;
    sendEvent({ stage: "finalLogic", open: true });
    let finalLogic = "";
    await llm.streamGenerate(crystallizationPrompt, crystallizationSystem, { reasoning: true }, {
      onDelta: (d) => {
        finalLogic += d;
        sendEvent({ stage: "finalLogic", delta: d });
      },
    });
    sendEvent({ stage: "finalLogic", complete: true, actualCycles: totalCycles });

    // --- STEP 6: The Explainer ---
    sendEvent({ log: "解读者正在解读最终结论..." });
    const explainerPrompt = buildExplainerPrompt(finalLogic);
    sendEvent({ stage: "explanation", open: true });
    let explanation = "";
    await llm.streamGenerate(explainerPrompt, explainerSystem, { reasoning: true }, {
      onDelta: (d) => {
        explanation += d;
        sendEvent({ stage: "explanation", delta: d });
      },
    });
    sendEvent({ stage: "explanation", complete: true });

    // Update or create refinement record in database
    if (recordId) {
      console.log(`[GET /api/refine] Updating existing record id=${recordId}`);
      updateRefinement(db, recordId, {
        finalLogic,
        explanation,
        stages: collectedStages,
        cycles: totalCycles,
      }, isAdmin ? undefined : sessionId);
      sendEvent({ refinementId: recordId });
    } else {
      // Fallback: create new record (for backward compatibility)
      console.log(`[GET /api/refine] No recordId provided, creating new record`);
      const refinementId = saveRefinement(db, {
        input,
        finalLogic,
        explanation,
        stages: collectedStages,
        cycles: totalCycles,
      }, sessionId);
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
  const { isAdmin, sessionId } = getAuthContext(req);
  const filterSessionId = isAdmin ? undefined : sessionId;
  const refinements = getRefinements(db, filterSessionId);
  res.json(refinements);
});

// API: Get single refinement by id
app.get("/api/refinements/:id", (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    return res.status(400).json({ error: "Invalid id" });
  }
  const { isAdmin, sessionId } = getAuthContext(req);
  const filterSessionId = isAdmin ? undefined : sessionId;
  const refinement = getRefinementById(db, id, filterSessionId);
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
  const { isAdmin, sessionId } = getAuthContext(req);
  if (!isAdmin && !sessionId) {
    return res.status(400).json({ error: "Missing session id" });
  }
  const cyclesNum = parseInt(cycles) || 1;
  console.log(`[POST /api/refinements] Creating new record: input="${input}", cycles=${cyclesNum}`);
  const id = createRefinement(db, input, cyclesNum, sessionId);
  console.log(`[POST /api/refinements] Created record with id=${id}`);
  res.json({ id });
});

// API: Update refinement by id
app.put("/api/refinements/:id", (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    return res.status(400).json({ error: "Invalid id" });
  }
  const { isAdmin, sessionId } = getAuthContext(req);
  const filterSessionId = isAdmin ? undefined : sessionId;
  const { finalLogic, explanation, stages } = req.body;
  const updated = updateRefinement(db, id, { finalLogic, explanation, stages }, filterSessionId);
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
  const { isAdmin, sessionId } = getAuthContext(req);
  const filterSessionId = isAdmin ? undefined : sessionId;
  const updated = updateRefinementInput(db, id, input.trim(), filterSessionId);
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
  const { isAdmin, sessionId } = getAuthContext(req);
  const filterSessionId = isAdmin ? undefined : sessionId;
  const deleted = deleteRefinement(db, id, filterSessionId);
  if (!deleted) {
    return res.status(404).json({ error: "Not found" });
  }
  res.json({ success: true });
});

// API: Verify admin token
app.post("/api/admin/verify", (req, res) => {
  const { token } = req.body;
  const adminToken = process.env.ADMIN_TOKEN;
  const valid = !!adminToken && token === adminToken;
  res.json({ valid });
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
