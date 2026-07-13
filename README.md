# Logic Refiner

基于多角色对抗迭代的逻辑精炼引擎。输入一个观点或问题，经过架构师解构、红方压力测试、合成器重塑等多轮对抗，产出经过证伪检验的、简洁的、难以反驳的逻辑表述。

## 功能

- **多角色对抗**：架构师、红方、合成器、边界定义者、结晶者等角色协作精炼
- **可配置迭代轮次**：支持 1-5 轮对抗迭代
- **问题与命题兼容**：支持输入观点命题或问题，自动适配处理
- **历史记录管理**：支持查看、重命名、删除历史精炼记录
- **思考模式**：AI 调用开启思考（reasoning）能力，提升推理质量

## Run Locally

**Prerequisites:** Node.js

1. Install dependencies:
   `npm install`
2. Copy `.env.example` to `.env` and fill in your `LLM_PROVIDER`, `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL` (see `.env.example` for reference values of each provider)
3. Run the app:
   `npm run dev`
