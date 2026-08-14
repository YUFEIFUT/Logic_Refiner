import { useState } from "react";
import { motion } from "motion/react";
import { Copy, Check, X, Terminal, AlertTriangle } from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import {
  buildSteps,
  buildStepPrompt,
  applyStepResult,
  type ManualContext,
  type ManualStage,
} from "../utils/manualFlow";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface ManualCompleteResult {
  input: string;
  cycles: number;
  finalLogic: string;
  explanation: string;
  stages: ManualStage[];
}

interface Props {
  input: string;
  cycles: number;
  onClose: () => void;
  onComplete: (result: ManualCompleteResult) => void;
}

// 手动执行模式的阻塞式模态框：展示当前步骤的系统 + 用户提示词，等待用户粘贴外部平台结果。
// 全部状态由本组件（前端）持有，走完最后一步后通过 onComplete 交由父组件保存。
export default function ManualExecutionModal({ input, cycles, onClose, onComplete }: Props) {
  const [steps] = useState(() => buildSteps(cycles));
  const [index, setIndex] = useState(0);
  const [ctx, setCtx] = useState<ManualContext>(() => ({
    input,
    cycles,
    architectOutput: "",
    currentLogic: "",
    redTeamOutput: "",
    boundaryOutput: "",
    finalLogic: "",
    explanation: "",
  }));
  const [stages, setStages] = useState<ManualStage[]>([]);
  // 每完成一步前保存快照，支持"上一步"重跑当前步骤
  const [history, setHistory] = useState<{ ctx: ManualContext; stages: ManualStage[] }[]>([]);
  const [content, setContent] = useState("");
  const [thinking, setThinking] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<"system" | "user" | null>(null);

  const step = steps[index];
  const prompt = step ? buildStepPrompt(step, ctx) : null;
  const isLast = index >= steps.length - 1;

  const copy = async (text: string, which: "system" | "user") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      setTimeout(() => setCopied(null), 1500);
    } catch (err) {
      console.error("复制失败", err);
    }
  };

  const handleSubmit = () => {
    if (!step || !prompt) return;
    if (!content.trim()) {
      setError("正文不能为空，请粘贴外部平台返回的结果。");
      return;
    }
    const { ctx: nextCtx, stage } = applyStepResult(ctx, step, content, thinking.trim() || undefined);
    const nextStages = stage ? [...stages, stage] : stages;
    // 保存当前状态快照，供"上一步"回退重跑
    setHistory(h => [...h, { ctx, stages }]);
    setCtx(nextCtx);
    setStages(nextStages);
    const nextIndex = index + 1;
    if (nextIndex < steps.length) {
      setIndex(nextIndex);
      setContent("");
      setThinking("");
      setError(null);
    } else {
      onComplete({
        input,
        cycles,
        finalLogic: nextCtx.finalLogic,
        explanation: nextCtx.explanation,
        stages: nextStages,
      });
    }
  };

  const handleBack = () => {
    if (history.length === 0) return;
    const snap = history[history.length - 1];
    setHistory(h => h.slice(0, -1));
    setCtx(snap.ctx);
    setStages(snap.stages);
    setIndex(index - 1);
    setContent("");
    setThinking("");
    setError(null);
  };

  const copyBlock = (label: string, text: string, which: "system" | "user") => (
    <div className="flex items-center justify-between mb-1.5">
      <span className="text-[9px] font-bold uppercase tracking-widest text-zinc-500">{label}</span>
      <button
        onClick={() => copy(text, which)}
        className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-zinc-500 hover:text-white transition-colors cursor-pointer"
        title="复制提示词"
      >
        {copied === which ? (
          <>
            <Check className="w-3 h-3 text-green-500" />
            <span className="text-green-500">已复制</span>
          </>
        ) : (
          <>
            <Copy className="w-3 h-3" />
            <span>复制</span>
          </>
        )}
      </button>
    </div>
  );

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.96, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.96, opacity: 0 }}
        className="bg-zinc-950 border border-white/20 rounded-lg w-full max-w-2xl font-mono flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-white/10">
          <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-white">
            <Terminal className="w-3.5 h-3.5" />
            手动执行模式
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[9px] text-zinc-500 uppercase tracking-widest">
              步骤 {index + 1} / {steps.length}
            </span>
            <button
              onClick={onClose}
              className="text-zinc-500 hover:text-white transition-colors"
              title="取消手动流程"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 当前步骤标题 */}
        <div className="px-5 pt-4">
          <h3 className="text-sm font-bold uppercase tracking-widest text-white">{prompt?.title}</h3>
          <p className="text-[10px] text-zinc-500 mt-1">
            请复制下方提示词，到外部平台执行后，将结果粘贴回"正文结果"并提交。
          </p>
        </div>

        {/* 提示词与结果区 */}
        <div className="px-5 py-4 space-y-4 overflow-y-auto custom-scrollbar flex-1">
          {/* 系统提示词 */}
          <div>
            {copyBlock("系统提示词 (System)", prompt?.system || "", "system")}
            <div className="bg-black border border-white/10 p-3 text-[11px] leading-relaxed text-zinc-300 whitespace-pre-wrap max-h-40 overflow-y-auto custom-scrollbar opacity-90">
              {prompt?.system}
            </div>
          </div>

          {/* 用户提示词 */}
          <div>
            {copyBlock("用户提示词 (User)", prompt?.user || "", "user")}
            <div className="bg-black border border-white/10 p-3 text-[11px] leading-relaxed text-zinc-300 whitespace-pre-wrap max-h-48 overflow-y-auto custom-scrollbar">
              {prompt?.user}
            </div>
          </div>

          {/* 正文结果 */}
          <div>
            <label className="block text-[9px] font-bold uppercase tracking-widest text-zinc-500 mb-1.5">
              正文结果 <span className="text-red-400">*</span>
            </label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={5}
              placeholder="粘贴外部平台返回的正文结果..."
              className="w-full bg-black border border-white/20 focus:border-white focus:outline-none p-3 text-xs text-white placeholder:text-zinc-700 resize-y"
            />
          </div>

          {/* 思考过程（可选） */}
          <div>
            <label className="block text-[9px] font-bold uppercase tracking-widest text-zinc-500 mb-1.5">
              思考过程 (可选)
            </label>
            <textarea
              value={thinking}
              onChange={(e) => setThinking(e.target.value)}
              rows={2}
              placeholder="如有思考链可粘贴于此（可选）..."
              className="w-full bg-black border border-white/10 focus:border-white/50 focus:outline-none p-3 text-[11px] text-zinc-400 placeholder:text-zinc-700 resize-y"
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 text-red-400 text-[10px] font-bold uppercase tracking-widest">
              <AlertTriangle className="w-3.5 h-3.5" />
              {error}
            </div>
          )}
        </div>

        {/* 底部操作 */}
        <div className="px-5 py-4 border-t border-white/10 flex items-center justify-between">
          <button
            onClick={handleBack}
            disabled={history.length === 0}
            className={cn(
              "px-3 py-2 border border-white/20 text-[9px] font-bold uppercase tracking-widest transition-colors cursor-pointer",
              history.length === 0
                ? "opacity-30 cursor-not-allowed"
                : "text-zinc-400 hover:text-white hover:border-white/50"
            )}
          >
            ← 上一步
          </button>
          <div className="flex items-center gap-4">
            <span className="text-[9px] text-zinc-600 uppercase tracking-widest italic">
              {isLast ? "最后一步：提交后完成并保存" : "提交后自动进入下一步"}
            </span>
            <button
              onClick={handleSubmit}
              className={cn(
                "px-6 py-2 border border-white font-bold uppercase text-[10px] tracking-widest transition-all active:scale-95",
                "bg-white text-black hover:bg-transparent hover:text-white cursor-pointer"
              )}
            >
              {isLast ? "完成并保存" : "提交下一步"}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}