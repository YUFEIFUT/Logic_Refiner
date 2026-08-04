// LLM Provider 抽象层 - 类型定义与配置加载（第二代：登记表驱动）

/**
 * 推理请求侧能力声明
 *
 * 两种 kind：
 *  - "effort"：支持多档强度（如 Mistral 的 reasoning_effort）
 *  - "toggle"：仅开/关（如 MiMo 的 thinking）
 */
export interface ReasoningRequestSpec {
  /** effort: 支持多档强度；toggle: 仅开/关 */
  kind: "effort" | "toggle";
  /** wire 字段名，如 "reasoning_effort" 或 "thinking" */
  field: string;
  /** effort 型：支持的档位列表（如 ["none","minimal","low","medium","high","xhigh"]） */
  levels?: string[];
  /** effort 型：调用方只传 true（不指定档）时的兜底档；可被 LLM_REASONING_DEFAULT 覆盖 */
  default?: string;
  /** toggle 型：开启时的值，如 { type: "enabled" }（unknown = 各模型自填开关值，类型随厂商） */
  on?: unknown;
  /** toggle 型：关闭时的值，如 { type: "disabled" } */
  off?: unknown;
  /**
   * 思考模式下的温度约束（仅 forcedTemperature / avoidZeroFallback 在对应 temperatureMode 下生效）：
   *  - "passthrough"（默认）：不特殊处理
   *  - "force"：思考模式下温度固定为 forcedTemperature（MiMo 静默覆盖）
   *  - "avoid-zero"：思考模式下若温度 <= 0，则改为 avoidZeroFallback（防 Mistral 400）
   */
  temperatureMode?: "passthrough" | "force" | "avoid-zero";
  forcedTemperature?: number;
  avoidZeroFallback?: number;
}

/**
 * 推理响应侧结构声明（仅描述非流式响应；流式处理见 §1.4 非目标）
 */
export interface ReasoningResponseSpec {
  /** "string"（默认）：content 即最终答案；"chunk-array"：content 是 chunk 数组，需抽 type:"text" */
  format: "string" | "chunk-array";
}

export interface ReasoningSpec {
  request: ReasoningRequestSpec;
  response: ReasoningResponseSpec;
}

/**
 * 单个 provider 的能力声明（登记表的一行）
 */
export interface ProviderSpec {
  /** 鉴权方式 */
  auth: "bearer" | "api-key";
  /** 推理能力；不声明 = 不支持推理（忽略 reasoning 意图） */
  reasoning?: ReasoningSpec;
  /**
   * 最大生成 token 数的 wire 字段名。
   * 默认 "max_completion_tokens"（OpenAI / MiMo 兼容）；
   * Mistral 规范使用 "max_tokens"，故在此显式声明以适配。
   */
  maxTokensField?: string;
  /**
   * 是否支持流式（SSE）调用。
   * true：streamGenerate 走真流式（读 response.body 流、按 OpenAI SSE 帧解析）；
   * 未声明/false：streamGenerate 退化为一次性 generate，仅发单条 delta（保证调用方统一）。
   * 默认 false，后续按 provider 逐个点亮。
   */
  streaming?: boolean;
}

/** 登记表：provider 名 → 能力声明 */
export type ProviderRegistry = Record<string, ProviderSpec>;

/**
 * 调用级参数：每次 generate 调用可传入，覆盖启动默认值
 */
export interface GenerateOptions {
  /**
   * 推理意图（厂商中立）：
   *  - true：开启推理（用模型默认档，可被 LLM_REASONING_DEFAULT 覆盖）
   *  - 档位字符串："none"|"minimal"|"low"|"medium"|"high"|"xhigh"
   *  - false：显式关闭
   *  - undefined：不表达（不注入任何推理字段）
   * 模型不支持推理时自动忽略。
   */
  reasoning?: boolean | "none" | "minimal" | "low" | "medium" | "high" | "xhigh";
  /** 采样温度，不传则用启动配置值 */
  temperature?: number;
  /** 最大生成 token 数，不传则用启动配置值 */
  maxTokens?: number;
}

/**
 * 启动级配置：从环境变量读取，provider 构造时固定
 */
export interface ProviderConfig {
  /** 供应商标识（mimo / openai / deepseek / mistral 等） */
  provider: string;
  /** API Key */
  apiKey: string;
  /** API 基础地址（不含 /chat/completions 后缀） */
  baseUrl: string;
  /** 模型名称 */
  model: string;
  /** 采样温度（默认 0.8） */
  temperature: number;
  /** 最大生成 token 数（未配则为 undefined，不传该字段让 API 自决） */
  maxTokens?: number;
  /**
   * effort 型 provider 的默认推理档覆盖（来自 LLM_REASONING_DEFAULT）。
   * 仅在调用方传 reasoning===true（未指定档）时生效；toggle 型（MiMo）无意义。
   */
  reasoningDefault?: string;
}

/**
 * LLM Provider 接口契约
 */
export interface StreamHandlers {
  /** 收到答案增量（逐 token / 逐 chunk）时回调 */
  onDelta?: (delta: string) => void;
  /** 收到思考链增量（reasoning_content / thinking chunk）时回调；未开启思考则不会触发 */
  onThinking?: (delta: string) => void;
}

export interface LLMProvider {
  /**
   * 生成文本
   * @param prompt 用户输入
   * @param system 系统指令（已含 LaTeX 格式提示）
   * @param opts 调用级参数，覆盖启动默认值
   * @returns 模型生成的文本（最终答案；思考内容不对外暴露）
   */
  generate(prompt: string, system: string, opts?: GenerateOptions): Promise<string>;

  /**
   * 流式生成文本：边收边通过 handlers 回调增量，并最终返回完整文本（供调用方作为下游阶段输入）。
   * 非流式 provider（spec.streaming=false）退化为一次性 generate + 单条 onDelta。
   * @param prompt 用户输入
   * @param system 系统指令
   * @param opts 调用级参数
   * @param handlers 增量回调（onDelta / onThinking）
   * @returns 完整文本
   */
  streamGenerate(
    prompt: string,
    system: string,
    opts: GenerateOptions | undefined,
    handlers: StreamHandlers
  ): Promise<string>;
}

/** LLM_REASONING_DEFAULT 合法档位集合 */
const REASONING_LEVELS = ["none", "minimal", "low", "medium", "high", "xhigh"] as const;

/**
 * 从环境变量读取 provider 配置
 * 缺必填项时抛出明确错误；LLM_REASONING_DEFAULT 非法值时抛错
 */
export function loadProviderConfig(env: Record<string, string | undefined>): ProviderConfig {
  const provider = env.LLM_PROVIDER;
  if (!provider) {
    throw new Error('LLM_PROVIDER is not configured. Please set it in .env file.');
  }

  const apiKey = env.LLM_API_KEY;
  if (!apiKey) {
    throw new Error('LLM_API_KEY is not configured. Please set it in .env file.');
  }

  const baseUrl = env.LLM_BASE_URL;
  if (!baseUrl) {
    throw new Error('LLM_BASE_URL is not configured. Please set it in .env file.');
  }

  const model = env.LLM_MODEL;
  if (!model) {
    throw new Error('LLM_MODEL is not configured. Please set it in .env file.');
  }

  // LLM_REASONING_DEFAULT（可选）：必须是 6 档之一，否则启动即报错
  let reasoningDefault: string | undefined;
  if (env.LLM_REASONING_DEFAULT) {
    if (!(REASONING_LEVELS as readonly string[]).includes(env.LLM_REASONING_DEFAULT)) {
      throw new Error(
        `LLM_REASONING_DEFAULT must be one of: ${REASONING_LEVELS.join(", ")}, got "${env.LLM_REASONING_DEFAULT}".`
      );
    }
    reasoningDefault = env.LLM_REASONING_DEFAULT;
  }

  return {
    provider,
    apiKey,
    baseUrl,
    model,
    temperature: env.LLM_TEMPERATURE ? parseFloat(env.LLM_TEMPERATURE) : 0.8,
    maxTokens: env.LLM_MAX_TOKENS ? parseInt(env.LLM_MAX_TOKENS, 10) : undefined,
    reasoningDefault,
  };
}
