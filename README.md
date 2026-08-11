# Logic Refiner

基于多角色对抗迭代的逻辑精炼引擎。输入一个观点或问题，经过架构师解构、红方压力测试、合成器重塑等多轮对抗，产出经过证伪检验的、简洁的、难以反驳的逻辑表述。

## 功能

- **多角色对抗**：架构师、红方、合成器、边界定义者、结晶者等角色协作精炼
- **可配置迭代轮次**：支持 1-5 轮对抗迭代
- **问题与命题兼容**：支持输入观点命题或问题，自动适配处理
- **多 LLM 供应商**：支持 MiMo、Mistral、Agnes 三家供应商，通过 `LLM_PROVIDER` 切换，统一 API Key + Base URL 配置即可接入
- **推理模式**：支持 Effort 型（Mistral，分 high/none 档位）和 Toggle 型（MiMo/Agnes，开/关）两种推理能力，提升推理质量
- **用户隔离**：Session 级数据隔离，每位用户只能查看自己的精炼记录
- **管理员模式**：连续点击侧边栏底部 Logo 区域 **5 次**，输入 `ADMIN_TOKEN` 环境变量设定的密码即可进入管理员模式，查看和管理全部用户数据
- **ChatGPT 风格侧边栏**：按时间分组展示历史记录，支持重命名和删除操作

## Run Locally

**Prerequisites:** Node.js

1. Install dependencies:
   `npm install`
2. Copy `.env.example` to `.env` and fill in your configuration:

   ```env
   # 供应商选择：mimo / mistral / agnes
   LLM_PROVIDER="mimo"

   # API Key（必填）
   LLM_API_KEY="your_llm_api_key_here"

   # API 基础地址（必填，不含 /chat/completions 后缀）
   LLM_BASE_URL="https://api.xiaomimimo.com/v1"

   # 模型名称（必填）
   LLM_MODEL="mimo-v2.5-pro"

   # 管理员访问令牌（建议使用复杂随机字符串）
   ADMIN_TOKEN="your_secure_admin_token_here"
   ```

   各供应商参考值：

   | 供应商 | LLM_PROVIDER | LLM_BASE_URL | 推荐模型 |
   |--------|-------------|--------------|----------|
   | MiMo | `mimo` | `https://api.xiaomimimo.com/v1` | `mimo-v2.5-pro` |
   | Mistral | `mistral` | `https://api.mistral.ai/v1` | `mistral-medium-3-5` |
   | Agnes | `agnes` | `https://apihub.agnes-ai.com/v1` | `agnes-2.0-flash` |

   Mistral 额外支持 `LLM_REASONING_DEFAULT` 配置推理档位（`high` 或 `none`）。

3. Run the app:
   `npm run dev`

## Scripts

| 命令 | 说明 |
|------|------|
| `npm run dev` | 本地启动（tsx 跑 `server/index.ts`，前端 Vite 热更） |
| `npm run build` | 构建前端 + 打包服务端为 `dist/server.cjs` |
| `npm run eval:formula` | 量化评估节点"伪数学/公式化"：默认静态读 `refinements.db` 历史基线；加 `--live` 实跑固定语料验证新提示词产出。详见 `docs/requirement2design/reduce-formula-expression.md` |
| `npm run lint:prompts` | 提示词反公式约束的"红/绿门禁"（纯 tsx，绕开预存的 vitest 环境崩溃）：逐节点 system / prompt / 全局提示断言是否含强硬反公式约束，全过 exit 0 |

> 注：本仓库 `vitest` 在当前运行环境存在预存的加载期崩溃（与业务代码无关），故 TDD 门禁以 `npm run lint:prompts` 承载。
