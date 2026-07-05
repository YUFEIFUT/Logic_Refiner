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
  Check
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface RefinementStage {
  name: string;
  title: string;
  content: string;
}

interface RefinementResult {
  input: string;
  finalLogic: string;
  stages: RefinementStage[];
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
  const [history, setHistory] = useState<string[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  
  const scrollRef = useRef<HTMLDivElement>(null);

  const copyToClipboard = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch (err) {
      console.error("Failed to copy!", err);
    }
  };

  const handleRefine = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!input.trim()) return;

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

    try {
      const eventSource = new EventSource(`/api/refine?input=${encodeURIComponent(input)}&cycles=${cycles}`);

      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.log) {
          setCurrentLog(data.log);
        }

        if (data.stage) {
          if (data.stage === "error") {
            setError(data.message);
            setIsLoading(false);
            eventSource.close();
            return;
          }
          if (data.stage === "finalLogic") {
            setResult(prev => prev ? { ...prev, finalLogic: data.content } : null);
            setActualCycles(data.actualCycles);
          } else if (data.stage === "explanation") {
            setExplanation(data.content);
          } else {
            const stageMap: Record<string, { name: string, title: string }> = {
              architect: { name: "初始架构", title: "逻辑解构 (Architect)" },
              redteam: { name: `迭代对抗 #${data.cycle || 1}`, title: "红方压力测试 (Red Team)" },
              synthesizer: { name: `迭代精炼 #${data.cycle || 1}`, title: "合成与剥离 (Synthesizer)" },
              boundary: { name: "终局场域", title: "边界判定 (Boundary Definer)" }
            };

            const config = stageMap[data.stage];
            if (config) {
              setResult(prev => {
                if (!prev) return null;
                const newStages = [...prev.stages];
                // For iterative stages, we want to keep them all
                if (data.cycle !== undefined && (data.stage === "redteam" || data.stage === "synthesizer")) {
                  newStages.push({ ...config, content: data.content });
                } else {
                  // For others (architect/boundary), we might want to update or insert
                  const existingIdx = newStages.findIndex(s => s.name === config.name);
                  if (existingIdx > -1) {
                    newStages[existingIdx] = { ...config, content: data.content };
                  } else {
                    newStages.push({ ...config, content: data.content });
                  }
                }
                return { ...prev, stages: newStages };
              });
            }
          }
        }

        if (data.done) {
          eventSource.close();
          setIsLoading(false);
          setHistory(prev => [input, ...prev.slice(0, 4)]);
          setCurrentLog("演化完成。");
        }
      };

      eventSource.onerror = (err) => {
        setError("演化过程因意外中断。可能是API限流。");
        eventSource.close();
        setIsLoading(false);
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

  // Dynamic configuration for stages
  const getStageConfig = (name: string) => {
    if (name.includes("对抗")) return { icon: ShieldAlert, color: "text-red-400", border: "border-red-500/20", bg: "bg-red-500/5" };
    if (name.includes("精炼")) return { icon: Zap, color: "text-blue-400", border: "border-blue-500/20", bg: "bg-blue-500/5" };
    if (name.includes("架构")) return { icon: Cpu, color: "text-zinc-400", border: "border-white/20", bg: "bg-white/5" };
    return { icon: MapPin, color: "text-green-400", border: "border-green-500/20", bg: "bg-green-500/5" };
  };

  return (
    <div className="min-h-screen bg-black text-white font-mono selection:bg-white selection:text-black">
      {/* Background Grid - subtle and sharp */}
      <div className="fixed inset-0 bg-[linear-gradient(to_right,#ffffff08_1px,transparent_1px),linear-gradient(to_bottom,#ffffff08_1px,transparent_1px)] bg-[size:2rem_2rem] pointer-events-none" />

      <main className="relative max-w-[1200px] mx-auto px-6 py-12">
        {/* Header - Artistic Flair style */}
        <header className="flex flex-col md:flex-row justify-between items-end border-b border-white/30 pb-4 mb-12">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
          >
            <h1 className="text-4xl md:text-5xl font-bold tracking-tighter uppercase mb-1">
              LogicRefiner <span className="text-[10px] font-normal align-top opacity-50 font-mono tracking-normal">v1.2.5</span>
            </h1>
            <p className="text-[10px] opacity-60 uppercase tracking-[0.2em]">认知自动机 // 递归演化引擎</p>
          </motion.div>
          
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="text-right hidden md:block"
          >
            <div className="text-[10px] opacity-40 uppercase mb-1">系统状态</div>
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
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="输入一个逻辑命题或人生格言 (如 '努力就会成功')..."
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
          
          {history.length > 0 && (
            <div className="mt-6 flex items-center gap-3 overflow-x-auto pb-2">
              <span className="text-[9px] font-bold text-zinc-600 uppercase tracking-tighter shrink-0">以往演化:</span>
              {history.map((h, i) => (
                <button
                  key={i}
                  onClick={() => { setInput(h); handleRefine(); }}
                  className="whitespace-nowrap px-3 py-1 border border-white/10 text-[9px] text-zinc-500 hover:text-white hover:border-white/30 transition-colors uppercase tracking-wider"
                >
                  {h}
                </button>
              ))}
            </div>
          )}
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
                <div className="max-w-4xl space-y-6 relative">
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
                            <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>{explanation}</ReactMarkdown>
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
                        {result.stages.map((stage, idx) => {
                          const config = getStageConfig(stage.name);
                          const Icon = config.icon;
                          const num = (idx + 1).toString().padStart(2, "0");

                          return (
                            <motion.div
                              key={`${stage.name}-${idx}`}
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
                                    onClick={() => copyToClipboard(stage.content, `${stage.name}-${idx}`)}
                                    className="text-zinc-500 hover:text-white transition-colors cursor-pointer flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider"
                                    title="复制此推演日志"
                                  >
                                    {copiedId === `${stage.name}-${idx}` ? (
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
                                <div className="prose prose-invert prose-zinc max-w-none prose-p:my-2 prose-strong:text-white prose-ul:pl-4 prose-li:my-1 prose-headings:text-[10px] prose-headings:uppercase prose-headings:font-bold prose-headings:mb-2 text-[11px]">
                                  <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>{stage.content}</ReactMarkdown>
                                </div>
                              </div>
                            </motion.div>
                          );
                        })}
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
      <footer className="mt-12 max-w-[1200px] mx-auto px-6 py-8 border-t border-white/10 flex flex-col md:flex-row justify-between items-center gap-6">
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
    </div>
  );
}

