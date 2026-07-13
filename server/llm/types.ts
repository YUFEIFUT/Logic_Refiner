// LLM Provider 抽象层 - 类型定义与配置加载

/**
 * 调用级参数：每次 generate 调用可传入，覆盖启动默认值
 */
export interface GenerateOptions {
  /** 是否启用推理模式（仅 MiMo 等支持的 provider 生效） */
  thinking?: boolean;
  /** 采样温度，不传则用启动配置值 */
  temperature?: number;
  /** 最大生成 token 数，不传则用启动配置值 */
  maxTokens?: number;
}

/**
 * 启动级配置：从环境变量读取，provider 构造时固定
 */
export interface ProviderConfig {
  /** 供应商标识（mimo / openai / deepseek 等） */
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
}

/**
 * LLM Provider 接口契约
 */
export interface LLMProvider {
  /**
   * 生成文本
   * @param prompt 用户输入
   * @param system 系统指令（已含 LaTeX 格式提示）
   * @param opts 调用级参数，覆盖启动默认值
   * @returns 模型生成的文本
   */
  generate(prompt: string, system: string, opts?: GenerateOptions): Promise<string>;
}

/**
 * 从环境变量读取 provider 配置
 * 缺必填项时抛出明确错误
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

  return {
    provider,
    apiKey,
    baseUrl,
    model,
    temperature: env.LLM_TEMPERATURE ? parseFloat(env.LLM_TEMPERATURE) : 0.8,
    maxTokens: env.LLM_MAX_TOKENS ? parseInt(env.LLM_MAX_TOKENS, 10) : undefined,
  };
}
