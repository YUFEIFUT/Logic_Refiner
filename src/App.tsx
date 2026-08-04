/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from "react";
import {
  Zap,
  ShieldAlert,
  Cpu,
  MapPin,
  ArrowRight,
  Loader2,
  CheckCircle2,
  History,
  Terminal,
  ChevronRight,
  Copy,
  Check,
  Lock,
  X,
  Eye,
  EyeOff
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import remarkGfm from "remark-gfm";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import Sidebar from "./components/Sidebar";
import HistoryList, { type HistoryRecord } from "./components/HistoryList";
import { apiFetch, getSessionId, getAdminToken, setAdminToken, clearAdminToken, isAdminMode } from "./utils/api";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface RefinementStage {
  name: string;
  title: string;
  content: string;
  /** 思考链（agnes 等开启思考时逐字流出并落库；无则为空/未定义） */
  thinking?: string;
}

interface RefinementResult {
  input: string;
  finalLogic: string;
  stages: RefinementStage[];
}

type StageCardConfig = {
  icon: React.ComponentType<any>;
  color: string;
  border: string;
  bg: string;
};

// 单阶段卡：渲染内容，并提供「思考过程」可折叠面板（agnes 等开启思考时逐字流出并落库）
function StageCard({ stage, idx, config, onCopy, copiedId }: {
  stage: RefinementStage;
  idx: number;
  config: StageCardConfig;
  onCopy: (text: string, id: string) => void;
  copiedId: string | null;
}) {
  const [showThinking, setShowThinking] = useState(false);
  const Icon = config.icon;
  const num = (idx + 1).toString().padStart(2, "0");
  const copyKey = `${stage.name}-${idx}`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: idx * 0.05 }}
      className={cn("relative border flex flex-col p-5 min-h-[300px]", config.border, config.bg)}
    >
      <div className={cn("absolute right-2 top-0 text-[60px] font-bold leading-none select-none pointer-events-none opacity-5 disabled:opacity-0")}>
        {num}
      </div>
      <header className="relative mb-6">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <Icon className={cn("w-3 h-3", config.color)} />
            <span className={cn("text-[9px] font-bold uppercase tracking-widest", config.color)}>
              {stage.name}
            </span>
          </div>
          <button
            onClick={() => onCopy(stage.content, copyKey)}
            className="text-zinc-500 hover:text-white transition-colors cursor-pointer flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider"
            title="复制此推演日志"
          >
            {copiedId === copyKey ? (
              <>
                <Check className="w-2.5 h-2.5 text-green-500" />
                <span className="text-green-500">已复制</span>
              </>
            ) : (
              <>
                <Copy className="w-2.5 h-2.5" />
                <span>复制</span>
              </>
            )}
          </button>
        </div>
        <h3 className="text-xs font-bold uppercase leading-tight pr-4">{stage.title}</h3>
      </header>
      <div className="flex-1 text-[11px] leading-relaxed text-zinc-400 font-mono overflow-y-auto custom-scrollbar">
        <div className="prose prose-sm prose-invert prose-zinc max-w-none prose-p:my-2 prose-p:text-[11px] prose-li:text-[11px] prose-strong:text-white prose-ul:pl-4 prose-li:my-1 prose-headings:text-[10px] prose-headings:uppercase prose-headings:font-bold prose-headings:mb-2 text-[11px]">
          <ReactMarkdown remarkPlugins={[remarkMath, remarkGfm]} rehypePlugins={[rehypeKatex]}>{stage.content}</ReactMarkdown>
        </div>
      </div>
      {stage.thinking ? (
        <div className="mt-3 border-t border-white/10 pt-3">
          <button
            onClick={() => setShowThinking(v => !v)}
            className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-widest text-zinc-500 hover:text-white transition-colors"
          >
            {showThinking ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
            {showThinking ? "隐藏思考过程" : "查看思考过程"}
          </button>
          {showThinking && (
            <div className="mt-2 text-[10px] leading-relaxed text-zinc-500 font-mono whitespace-pre-wrap max-h-72 overflow-y-auto custom-scrollbar opacity-90 border-l border-white/10 pl-3">
              {stage.thinking}
            </div>
          )}
        </div>
      ) : null}
    </motion.div>
  );
}

export default function App() {
  const [input, setInput] = useState("");
  const [cycles, setCycles] = useState(2);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<RefinementResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showLogs, setShowLogs] = useState(false);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [actualCycles, setActualCycles] = useState(0);
  const [currentLog, setCurrentLog] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [currentRecordId, setCurrentRecordId] = useState<number | null>(null);
  const [resumeCycles, setResumeCycles] = useState(2);
  const [selectedRecord, setSelectedRecord] = useState<HistoryRecord | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const [adminMode, setAdminMode] = useState(isAdminMode());
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [adminPassword, setAdminPassword] = useState("");
  const [adminError, setAdminError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const versionClickCountRef = useRef(0);
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const stagesRef = useRef<RefinementStage[]>([]);
  const finalLogicRef = useRef<string>('');
  const explanationRef = useRef<string | null>(null);
  /** 流式期间按 "stage#cycle" 定位当前阶段卡在 result.stages 中的下标，供 delta/thinking 增量 append */
  const stageIndexRef = useRef<Map<string, number>>(new Map());

  const clearDetailState = () => {
    setSelectedRecord(null);
  };

  const isMobile = () => window.innerWidth <= 768;

  const smoothScrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSelectHistory = (record: HistoryRecord) => {
    if (selectedRecord?.id === record.id) {
      setSelectedRecord(null);
      setResult(null);
      setExplanation(null);
      setActualCycles(0);
      setCurrentRecordId(null);
      if (isMobile()) setSidebarOpen(false);
      return;
    }
    setSelectedRecord(record);
    setCurrentRecordId(record.id);
    let stages: RefinementStage[] = [];
    try {
      stages = JSON.parse(record.stages);
    } catch (e) {
      console.error('Failed to parse stages:', e);
    }
    setResult({
      input: record.input,
      finalLogic: record.finalLogic,
      stages,
    });
    setExplanation(record.explanation);
    setActualCycles(record.cycles);
    setShowLogs(true);
    if (isMobile()) setSidebarOpen(false);
  };

  const copyToClipboard = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch (err) {
      console.error("Failed to copy!", err);
    }
  };

  // 共享：把后端 SSE 事件应用到组件状态。run / resume 两条链路共用。
  // 支持流式（open/delta/thinking/complete）与非流式兜底（content）。
  function applyRefineData(data: any, ctx: { isResume: boolean; newRecordId: number | null }) {
    if (data.log) setCurrentLog(data.log);
    if (data.stage === "finalLogic" && data.actualCycles) setActualCycles(data.actualCycles);

    // 开卡事件：建空卡（阶段）或清空结论/解读字段
    if (data.open) {
      if (data.stage === "finalLogic") {
        setResult(prev => prev ? { ...prev, finalLogic: "" } : null);
        finalLogicRef.current = "";
      } else if (data.stage === "explanation") {
        setExplanation("");
        explanationRef.current = "";
      } else if (data.stage) {
        const key = data.cycle ? `${data.stage}#${data.cycle}` : data.stage;
        setResult(prev => {
          if (!prev) return null;
          const newStages = [...prev.stages, { name: data.name, title: data.title, content: "" }];
          stageIndexRef.current.set(key, newStages.length - 1);
          stagesRef.current = newStages;
          return { ...prev, stages: newStages };
        });
      }
      return;
    }

    // 答案增量
    if (data.delta !== undefined) {
      const key = data.cycle ? `${data.stage}#${data.cycle}` : data.stage;
      if (data.stage === "finalLogic") {
        setResult(prev => prev ? { ...prev, finalLogic: (prev.finalLogic || "") + data.delta } : null);
        finalLogicRef.current = (finalLogicRef.current || "") + data.delta;
      } else if (data.stage === "explanation") {
        setExplanation(prev => (prev || "") + data.delta);
        explanationRef.current = (explanationRef.current || "") + data.delta;
      } else {
        setResult(prev => {
          if (!prev) return null;
          const idx = stageIndexRef.current.get(key);
          if (idx === undefined) return prev;
          const newStages = [...prev.stages];
          newStages[idx] = { ...newStages[idx], content: (newStages[idx].content || "") + data.delta };
          stagesRef.current = newStages;
          return { ...prev, stages: newStages };
        });
      }
      return;
    }

    // 思考增量（仅思考开启时）
    if (data.thinking !== undefined) {
      const key = data.cycle ? `${data.stage}#${data.cycle}` : data.stage;
      setResult(prev => {
        if (!prev) return null;
        const idx = stageIndexRef.current.get(key);
        if (idx === undefined) return prev;
        const newStages = [...prev.stages];
        newStages[idx] = { ...newStages[idx], thinking: (newStages[idx].thinking || "") + data.thinking };
        stagesRef.current = newStages;
        return { ...prev, stages: newStages };
      });
      return;
    }

    // 非流式兜底（兼容旧后端）：整体 content
    if (data.content !== undefined) {
      if (data.stage === "finalLogic") {
        setResult(prev => prev ? { ...prev, finalLogic: data.content } : null);
        finalLogicRef.current = data.content;
      } else if (data.stage === "explanation") {
        setExplanation(data.content);
        explanationRef.current = data.content;
      } else {
        const stageMap: Record<string, { name: string; title: string }> = {
          architect: { name: "初始架构", title: "逻辑解构 (Architect)" },
          redteam: { name: `迭代对抗 #${data.cycle || 1}`, title: "红方压力测试 (Red Team)" },
          synthesizer: { name: `迭代精炼 #${data.cycle || 1}`, title: "合成与剥离 (Synthesizer)" },
          boundary: { name: "终局场域", title: "边界判定 (Boundary Definer)" },
        };
        const config = stageMap[data.stage];
        if (config) {
          setResult(prev => {
            if (!prev) return null;
            const newStages = [...prev.stages];
            newStages.push({ ...config, content: data.content });
            stagesRef.current = newStages;
            return { ...prev, stages: newStages };
          });
        }
      }
      return;
    }

    // 错误
    if (data.stage === "error") {
      setError(data.message);
      setIsLoading(false);
      if (!ctx.isResume && ctx.newRecordId) {
        apiFetch(`/api/refinements/${ctx.newRecordId}`, { method: 'DELETE' });
        setCurrentRecordId(null);
        setHistoryRefreshKey(prev => prev + 1);
      }
    }
  }

  const handleRefine = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!input.trim()) return;

    setSelectedRecord(null);
    setIsLoading(true);
    setResult({
      input,
      finalLogic: "",
      stages: []
    });
    setExplanation(null);
    setError(null);
    setShowLogs(true);
    setActualCycles(0);
    setCurrentLog("初始化引擎中...");

    let newRecordId: number | null = null;
    setCurrentRecordId(null);
    stagesRef.current = [];
    stageIndexRef.current.clear();

    try {
      // Create empty record in database
      const createRes = await apiFetch('/api/refinements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input, cycles }),
      });
      if (createRes.ok) {
        const { id } = await createRes.json();
        newRecordId = id;
        setCurrentRecordId(id);
        setHistoryRefreshKey(prev => prev + 1);
      }

      const sessionId = getSessionId();
      const adminToken = getAdminToken();
      const sseParams = new URLSearchParams({
        input,
        cycles: String(cycles),
        session_id: sessionId,
      });
      if (newRecordId) sseParams.set('id', String(newRecordId));
      const eventSource = new EventSource(`/api/refine?${sseParams.toString()}${adminToken ? `&admin_token=${encodeURIComponent(adminToken)}` : ''}`);

      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);
        applyRefineData(data, { isResume: false, newRecordId });
        if (data.done) {
          eventSource.close();
          setIsLoading(false);
          setCurrentLog("演化完成。");
          // Backend now handles database update via id parameter
          setHistoryRefreshKey(prev => prev + 1);
        }
        if (data.stage === "error") {
          eventSource.close();
        }
      };

      eventSource.onerror = (err) => {
        setError("演化过程因意外中断。可能是API限流。");
        eventSource.close();
        setIsLoading(false);
        // Delete incomplete record on error
        if (newRecordId) {
          apiFetch(`/api/refinements/${newRecordId}`, { method: 'DELETE' });
          setCurrentRecordId(null);
          setHistoryRefreshKey(prev => prev + 1);
        }
      };

    } catch (err: any) {
      setError(err.message);
      setIsLoading(false);
    }
  };

  const handleResume = async () => {
    if (!currentRecordId || !result) return;

    setIsLoading(true);
    setError(null);
    setShowLogs(true);
    setCurrentLog("续跑初始化中...");

    // Convert old finalLogic and explanation into stages for comparison
    const oldStages = [...result.stages];
    if (result.finalLogic) {
      oldStages.push({
        name: `结晶结论 #${actualCycles}`,
        title: `结晶结论 #${actualCycles} (Crystallizer)`,
        content: result.finalLogic
      });
    }
    if (explanation) {
      oldStages.push({
        name: `深度解读 #${actualCycles}`,
        title: `深度解读 #${actualCycles} (Explainer)`,
        content: explanation
      });
    }

    // Keep old stages, clear finalLogic/explanation for new ones
    setResult(prev => prev ? {
      ...prev,
      finalLogic: "",
      stages: oldStages
    } : null);
    setExplanation(null);
    setActualCycles(0);
    stagesRef.current = oldStages;
    stageIndexRef.current.clear();

    try {
      const sessionId = getSessionId();
      const adminToken = getAdminToken();
      const sseParams = new URLSearchParams({
        input: result.input,
        cycles: String(resumeCycles),
        session_id: sessionId,
        resume_id: String(currentRecordId),
      });
      sseParams.set('id', String(currentRecordId));
      const eventSource = new EventSource(`/api/refine?${sseParams.toString()}${adminToken ? `&admin_token=${encodeURIComponent(adminToken)}` : ''}`);

      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);
        applyRefineData(data, { isResume: true, newRecordId: currentRecordId });
        if (data.done) {
          eventSource.close();
          setIsLoading(false);
          setCurrentLog("续跑完成。");
          setHistoryRefreshKey(prev => prev + 1);
        }
        if (data.stage === "error") {
          eventSource.close();
        }
      };

      eventSource.onerror = (err) => {
        setError("续跑过程因意外中断。可能是API限流。");
        eventSource.close();
        setIsLoading(false);
        // Don't delete record on resume error
        setHistoryRefreshKey(prev => prev + 1);
      };

    } catch (err: any) {
      setError(err.message);
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (result?.finalLogic && scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [result?.finalLogic]);

  // Scroll to top on mount
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  // 版本号点击处理：普通模式连续点击5次触发，管理员模式点击1次直接弹出
  const handleVersionClick = () => {
    if (adminMode) {
      setShowAdminModal(true);
      setAdminError(null);
      setAdminPassword("");
      return;
    }

    versionClickCountRef.current += 1;

    if (clickTimerRef.current) {
      clearTimeout(clickTimerRef.current);
    }
    clickTimerRef.current = setTimeout(() => {
      versionClickCountRef.current = 0;
    }, 2000);

    if (versionClickCountRef.current >= 5) {
      setShowAdminModal(true);
      setAdminError(null);
      setAdminPassword("");
      versionClickCountRef.current = 0;
      if (clickTimerRef.current) {
        clearTimeout(clickTimerRef.current);
        clickTimerRef.current = null;
      }
    }
  };

  // 管理员登录
  const handleAdminLogin = async () => {
    try {
      const res = await apiFetch('/api/admin/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: adminPassword }),
      });
      const data = await res.json();
      if (data.valid) {
        setAdminToken(adminPassword);
        setAdminMode(true);
        setShowAdminModal(false);
        setAdminPassword("");
        setAdminError(null);
        setShowPassword(false);
        setHistoryRefreshKey(prev => prev + 1);
      } else {
        setAdminError("密码错误");
      }
    } catch (err) {
      setAdminError("验证失败，请重试");
    }
  };

  // 退出管理员模式
  const handleAdminLogout = () => {
    clearAdminToken();
    setAdminMode(false);
    setShowAdminModal(false);
    setShowPassword(false);
    setHistoryRefreshKey(prev => prev + 1);
  };

  // Dynamic configuration for stages
  const getStageConfig = (name: string) => {
    if (name.includes("对抗") || name.includes("redteam")) return { icon: ShieldAlert, color: "text-red-400", border: "border-red-500/20", bg: "bg-red-500/5" };
    if (name.includes("精炼") || name.includes("synthesizer")) return { icon: Zap, color: "text-blue-400", border: "border-blue-500/20", bg: "bg-blue-500/5" };
    if (name.includes("架构") || name.includes("architect")) return { icon: Cpu, color: "text-zinc-400", border: "border-white/20", bg: "bg-white/5" };
    if (name.includes("结晶") || name.includes("crystallizer")) return { icon: Zap, color: "text-amber-400", border: "border-amber-500/20", bg: "bg-amber-500/5" };
    if (name.includes("解读") || name.includes("explainer")) return { icon: CheckCircle2, color: "text-cyan-400", border: "border-cyan-500/20", bg: "bg-cyan-500/5" };
    return { icon: MapPin, color: "text-green-400", border: "border-green-500/20", bg: "bg-green-500/5" };
  };

  return (
    <div className="min-h-screen bg-black text-white font-mono selection:bg-white selection:text-black">
      {/* Background Grid - subtle and sharp */}
      <div className="fixed inset-0 bg-[linear-gradient(to_right,#ffffff08_1px,transparent_1px),linear-gradient(to_bottom,#ffffff08_1px,transparent_1px)] bg-[size:2rem_2rem] pointer-events-none" />

      <Sidebar
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
        onNewChat={() => {
          setSelectedRecord(null);
          setResult(null);
          setExplanation(null);
          setActualCycles(0);
          setCurrentRecordId(null);
          setInput('');
          smoothScrollToTop();
          if (isMobile()) setSidebarOpen(false);
          setTimeout(() => inputRef.current?.focus(), 300);
        }}
      >
        <HistoryList
          onSelect={handleSelectHistory}
          selectedId={selectedRecord?.id}
          refreshKey={historyRefreshKey}
          onDelete={(id) => {
            if (selectedRecord?.id === id) {
              setSelectedRecord(null);
              setResult(null);
              setExplanation(null);
              setActualCycles(0);
              setCurrentRecordId(null);
              smoothScrollToTop();
            }
          }}
        />
      </Sidebar>

      <main
        className={cn(
          "relative px-6 py-12 transition-[margin-left,width] duration-200",
          sidebarOpen ? "md:ml-[260px] md:w-[calc(100%-260px)]" : "w-full"
        )}
      >
        {/* Header - Artistic Flair style */}
        <header className={cn(
          "flex flex-col md:flex-row justify-between items-end border-b border-white/30 pb-4 mb-12 transition-all",
          !sidebarOpen && "pl-12 md:pl-0"
        )}>
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
          >
            <h1 className="text-4xl md:text-5xl font-bold tracking-tighter uppercase mb-1">
              LogicRefiner <button onClick={handleVersionClick} className="text-[10px] font-normal align-top opacity-50 font-mono tracking-normal hover:opacity-100 transition-opacity cursor-pointer">v1.2.5</button>
            </h1>
            <p className="text-[10px] opacity-60 uppercase tracking-[0.2em]">认知自动机 // 递归演化引擎</p>
          </motion.div>
          
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="text-right hidden md:block"
          >
            <div className="text-[10px] opacity-40 uppercase mb-1">系统状态{adminMode && <span className="text-white font-bold">(ADMIN)</span>}</div>
            <div className="flex items-center gap-2 text-xs font-bold text-green-400">
              <span className="animate-pulse">●</span> 循环递归模块就绪
            </div>
          </motion.div>
        </header>

        {/* Search Bar - Sharp & Minimalist */}
        <section className="mb-16">
          <form onSubmit={handleRefine} className="space-y-4">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1 relative group">
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="输入一个问题或逻辑命题 (如 '努力就会成功' / '黑暗的本质是什么')..."
                  className="w-full bg-zinc-900/50 border border-white/20 focus:border-white focus:outline-none px-6 py-4 text-sm tracking-wide placeholder:text-zinc-700 transition-colors"
                  disabled={isLoading}
                />
                <div className="absolute top-0 right-0 p-4 opacity-20 pointer-events-none">
                  <Terminal className="w-4 h-4" />
                </div>
              </div>
              <button
                type="submit"
                disabled={isLoading || !input.trim()}
                className={cn(
                  "px-8 py-4 border border-white font-bold uppercase text-xs tracking-widest transition-all active:scale-95 disabled:opacity-30 disabled:active:scale-100",
                  isLoading ? "bg-white/10 text-white/50" : "bg-white text-black hover:bg-transparent hover:text-white"
                )}
              >
                {isLoading ? (
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>迭代中...</span>
                  </div>
                ) : (
                  "启动多轮演化"
                )}
              </button>
            </div>
            
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-3">
                <span className="text-[9px] font-bold text-zinc-500 uppercase">演化深度:</span>
                <input 
                  type="range" 
                  min="1" 
                  max="5" 
                  value={cycles} 
                  onChange={(e) => setCycles(parseInt(e.target.value))}
                  className="w-32 accent-white"
                />
                <span className="text-xs font-bold text-white w-4">{cycles}</span>
              </div>
              <div className="text-[9px] text-zinc-600 uppercase italic">
                {isLoading ? `[ ${currentLog} ]` : `[ 增加演化深度将提高结论精确度，但消耗更多算力 ]`}
              </div>
            </div>
          </form>
        </section>

        {/* Error State */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="mb-8 p-4 border border-red-500/30 bg-red-950/10 flex items-center gap-3 text-red-500 text-[10px] font-bold uppercase tracking-widest"
            >
              <ShieldAlert className="w-4 h-4 flex-shrink-0" />
              <p>{error}</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Results Flow */}
        <div className="min-h-[400px]">
          {result ? (
            <div ref={scrollRef} className="space-y-12">
              
              {/* Highlight Result: The Final Logic */}
              <motion.div
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                className="relative overflow-hidden border-2 border-white bg-white text-black p-10 md:p-14 shadow-[20px_20px_0px_0px_rgba(255,255,255,0.1)]"
              >
                <div className="absolute top-0 right-0 p-4 opacity-10">
                   {isLoading ? <Loader2 className="w-24 h-24 animate-spin" /> : <Zap className="w-24 h-24 rotate-12" />}
                </div>
                <div className="space-y-6 relative">
                  <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-4">
                      <div className="h-0.5 w-12 bg-black/20" />
                      <span className="text-[10px] font-bold uppercase tracking-[0.4em]">
                        {actualCycles > 0 ? `第 ${actualCycles} 轮演化终态结论` : `演化处理中...`}
                      </span>
                    </div>
                    {result?.finalLogic && (
                      <button
                        onClick={() => copyToClipboard(result.finalLogic, "finalLogic")}
                        className="flex items-center gap-1.5 px-3 py-1 border border-black/20 hover:border-black hover:bg-black hover:text-white transition-all text-[9px] font-bold uppercase tracking-wider cursor-pointer"
                        title="复制最终真理结论"
                      >
                        {copiedId === "finalLogic" ? (
                          <>
                            <Check className="w-3 h-3 text-green-600" />
                            <span>已复制结论</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            <span>复制结论</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                  
                  {result.finalLogic ? (
                    <>
                      <h2 className="text-3xl md:text-5xl font-bold tracking-tighter leading-[1.1] mb-8 font-serif italic text-balance">
                        "{result.finalLogic}"
                      </h2>
                      
                      {explanation && (
                        <motion.div 
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="mt-10 pt-8 border-t border-black/10 space-y-4"
                        >
                          <div className="flex items-center justify-between border-b border-black/10 pb-2">
                            <div className="text-[9px] font-bold bg-black text-white inline-block px-2 py-1 uppercase tracking-widest">
                              深度解读与应用 / CRYSTALLIZATION
                            </div>
                            <button
                              onClick={() => copyToClipboard(explanation, "explanation")}
                              className="flex items-center gap-1.5 px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-zinc-600 hover:text-black transition-colors cursor-pointer"
                              title="复制深度解读文本"
                            >
                              {copiedId === "explanation" ? (
                                <>
                                  <Check className="w-3 h-3 text-green-600" />
                                  <span>已复制</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3 h-3" />
                                  <span>复制解读</span>
                                </>
                              )}
                            </button>
                          </div>
                          <div className="text-sm font-mono leading-relaxed text-zinc-800 prose prose-sm max-w-none prose-p:my-2 prose-strong:text-black">
                            <ReactMarkdown remarkPlugins={[remarkMath, remarkGfm]} rehypePlugins={[rehypeKatex]}>{explanation}</ReactMarkdown>
                          </div>
                        </motion.div>
                      )}

                      <div className="flex flex-wrap items-center gap-6 text-[10px] font-bold uppercase tracking-widest pt-4">
                        <div className="flex items-center gap-2">
                           <CheckCircle2 className="w-3 h-3 text-green-600" />
                           <span>已完成 {actualCycles} 次对抗迭代</span>
                        </div>
                        <div className="flex items-center gap-2">
                           <CheckCircle2 className="w-3 h-3 text-green-600" />
                           <span>非线性熵减完成</span>
                        </div>
                        {!isLoading && (
                          <div className="flex items-center gap-2">
                             <CheckCircle2 className="w-3 h-3 text-green-600" />
                             <span>全局真理一致性检查通过</span>
                          </div>
                        )}
                      </div>

                      {/* Resume controls */}
                      {!isLoading && currentRecordId && (
                        <div className="flex items-center gap-4 mt-6 pt-4 border-t border-black/10">
                          <span className="text-[9px] font-bold text-zinc-500 uppercase">继续演化:</span>
                          <input
                            type="range"
                            min="1"
                            max="5"
                            value={resumeCycles}
                            onChange={(e) => setResumeCycles(parseInt(e.target.value))}
                            className="w-24 accent-black"
                          />
                          <span className="text-xs font-bold text-black w-4">{resumeCycles}</span>
                          <button
                            onClick={handleResume}
                            className="px-4 py-2 border border-black/20 hover:border-black hover:bg-black hover:text-white transition-all text-[9px] font-bold uppercase tracking-wider cursor-pointer"
                          >
                            继续演化 {resumeCycles} 轮
                          </button>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="py-12 flex flex-col items-center justify-center space-y-4">
                       <Loader2 className="w-8 h-8 animate-spin opacity-20" />
                       <span className="text-[10px] uppercase font-bold tracking-[0.2em] opacity-40 italic">
                         {currentLog || "正在进行逻辑演化..."}
                       </span>
                    </div>
                  )}
                </div>
              </motion.div>

              {/* Collapsible Operational Logs */}
              <div className="space-y-6">
                <button 
                  onClick={() => setShowLogs(!showLogs)}
                  className="flex items-center gap-3 group"
                >
                   <div className="h-px w-8 bg-zinc-800 group-hover:bg-white transition-colors" />
                   <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 group-hover:text-white transition-colors">
                     {showLogs ? "[ 隐藏推演日志 ]" : "[ 查看完整推演链条 ]"}
                   </span>
                </button>

                <AnimatePresence>
                  {showLogs && (
                    <motion.div 
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
                        {result.stages.map((stage, idx) => (
                          <StageCard
                            key={`${stage.name}-${idx}`}
                            stage={stage}
                            idx={idx}
                            config={getStageConfig(stage.name)}
                            onCopy={copyToClipboard}
                            copiedId={copiedId}
                          />
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          ) : (
            !isLoading && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.3 }}
                className="h-[400px] flex flex-col items-center justify-center border border-white/5 bg-zinc-900/10 border-dashed"
              >
                <div className="w-16 h-16 border border-white/20 flex items-center justify-center mb-6">
                  <div className="w-8 h-8 border border-white animate-pulse" />
                </div>
                <p className="text-[10px] font-bold uppercase tracking-[0.5em] text-zinc-500">等待信号输入</p>
                <div className="mt-4 text-[8px] text-zinc-700 animate-pulse">SYSTEM_IDLE // 准备迎接逻辑风暴</div>
              </motion.div>
            )
          )}
        </div>
      </main>

      {/* Interface Footer Bar */}
      <footer
        className={cn(
          "mt-12 px-6 py-8 border-t border-white/10 flex flex-col md:flex-row justify-between items-center gap-6 transition-[margin-left,width] duration-200",
          sidebarOpen ? "md:ml-[260px] md:w-[calc(100%-260px)]" : "w-full"
        )}
      >
        <div className="flex items-center gap-6">
          <div className="text-[9px] uppercase tracking-widest opacity-40 leading-tight">
            注：所有真理结论均为<br/>基于当前数据的贝叶斯最大似然估计。
          </div>
          <div className="h-8 w-[1px] bg-white/10" />
          <div className="text-[9px] uppercase tracking-widest opacity-40">
            Logic_Refiner v1.2.5<br/>非偏见中立递归演化引擎
          </div>
        </div>

        <div className="flex gap-4">
           {["认识论", "贝叶斯推断", "熵增对抗"].map((label) => (
             <span key={label} className="text-[9px] font-bold uppercase tracking-widest text-zinc-600 hover:text-white cursor-help transition-colors border-b border-transparent hover:border-white">
               {label}
             </span>
           ))}
        </div>
      </footer>

      {/* 管理员模态框 */}
      <AnimatePresence>
        {showAdminModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
            onClick={() => setShowAdminModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-zinc-950 border border-white/20 rounded-lg p-6 w-80 font-mono"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-white">
                  <Lock className="w-3.5 h-3.5" />
                  {adminMode ? "管理员模式" : "管理员登录"}
                </div>
                <button
                  onClick={() => setShowAdminModal(false)}
                  className="text-zinc-500 hover:text-white transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {adminMode ? (
                <div className="space-y-4">
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    当前处于管理员模式，可查看和管理全部数据。
                  </p>
                  <button
                    onClick={handleAdminLogout}
                    className="w-full px-3 py-2 text-xs uppercase tracking-widest border border-white/20 text-white hover:bg-white hover:text-black transition-colors"
                  >
                    退出管理员模式
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={adminPassword}
                      onChange={(e) => setAdminPassword(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleAdminLogin(); }}
                      placeholder="输入管理员密码"
                      autoFocus
                      className="w-full px-3 py-2 pr-9 bg-black border border-white/20 text-white text-xs placeholder-zinc-600 focus:outline-none focus:border-white/50 transition-colors"
                    />
                    <button
                      type="button"
                      aria-label="切换密码可见"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white transition-colors"
                    >
                      {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  {adminError && (
                    <p className="text-xs text-red-400">{adminError}</p>
                  )}
                  <button
                    onClick={handleAdminLogin}
                    className="w-full px-3 py-2 text-xs uppercase tracking-widest border border-white/20 text-white hover:bg-white hover:text-black transition-colors"
                  >
                    确认
                  </button>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

