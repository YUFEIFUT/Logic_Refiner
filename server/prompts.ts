// 提示词唯一来源已迁移到 shared/prompts.ts（前后端共享单一文件，避免漂移）。
// 本文件仅作 re-export，保持原有 import 路径（server/index.ts、scripts、tests）不变。
export * from "../shared/prompts";