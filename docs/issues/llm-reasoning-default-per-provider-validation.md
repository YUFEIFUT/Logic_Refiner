# Issue: LLM_REASONING_DEFAULT 校验应按 provider 实际 levels（启动即报错）

- 状态：待办（本次未实现，先记录方案）
- 关联：`server/llm/types.ts`、`server/llm/registry.ts`、`server/llm/negotiate.ts`
- 触发场景：真实 Mistral key 跑 refinement 时 400（见 2026-07-14 工作日志）

## 背景

`mistral-medium-3-5` 实际只支持 `reasoning_effort: high | none` 两档（API 报错权威：
`supported values: [high, none]`）。而 Mistral SDK 的 `ReasoningEffort` 通用枚举有 6 档
（none/minimal/low/medium/high/xhigh）。两者不是一回事。

## 现状（A+B+D 已落地后）

- `registry.ts`：mistral `levels` 已修正为 `["none","high"]`（A）。
- `negotiate.ts`：`resolveReasoning` 在 `intent===true` 时，若 `defaultOverride` 不在 `r.levels`
  内则回退 `r.default`（B）。即 `LLM_REASONING_DEFAULT=medium` 会在运行时静默回退 `high`，不再 400。
- `.env.example`：mistral 示例已改为 `high` 并注明仅支持 high/none（D）。

## 仍未解决的问题（本 Issue）

`loadProviderConfig`（`types.ts`）对 `LLM_REASONING_DEFAULT` 的校验用的是**全局 6 档常量**
`REASONING_LEVELS`，与 provider 实际 `levels` 无关：

```ts
const REASONING_LEVELS = ["none","minimal","low","medium","high","xhigh"] as const;
// ...
if (!(REASONING_LEVELS as readonly string[]).includes(env.LLM_REASONING_DEFAULT)) {
  throw new Error(`LLM_REASONING_DEFAULT must be one of: ${REASONING_LEVELS.join(", ")}, got "..."`);
}
```

后果：
1. 设 `LLM_REASONING_DEFAULT=medium` 能**过启动校验**（因为 medium 在全局 6 档里）。
2. 运行时被 `resolveReasoning`（B）静默回退到 `high`，**不报错但与用户预期不符**——
   用户以为开了 medium，实际跑的是 high，既不省 token 也无任何提示。
3. 全局常量 `REASONING_LEVELS` 是 SDK 通用枚举，与"某模型实际支持什么"脱钩，
   新增模型时容易再次出现"启动通过、运行不符"的漂移。

## 方案 C

让 `LLM_REASONING_DEFAULT` 的校验**按 provider 实际 `levels`** 进行，启动即报错，
而不是运行时静默回退。

### 改动点

1. `loadProviderConfig` 需要能访问 registry（目前它是纯函数，只读 env）。
   两种接法：
   - (a) 在 `loadProviderConfig` 内 `import { PROVIDERS } from "./registry"`，按
     `env.LLM_PROVIDER` 取 spec，用 `spec.reasoning?.request.levels` 校验。
   - (b) 把校验上移到 `createProvider`（`index.ts`）：`loadProviderConfig` 只解析字符串，
     `createProvider` 拿到 config + spec 后再校验 `reasoningDefault ∈ levels`。
   - 推荐 (b)：保持 `loadProviderConfig` 单一职责（只读 env），校验逻辑集中在
     `createProvider`，且能给出"provider X 仅支持 [a,b]，得到 c"的精确报错。

2. 报错信息示例：
   ```
   LLM_REASONING_DEFAULT="medium" is not supported by provider "mistral"
   (model mistral-medium-3-5 supports: none, high). Set it to one of the supported values
   or remove it to use the default "high".
   ```

3. 校验仅对 effort 型 + 有 `levels` 的 provider 生效；toggle 型（MiMo）无 levels，
   `LLM_REASONING_DEFAULT` 对它本就无意义（现状是静默忽略），可保持现状或也报"对 toggle 型无效"。

4. 全局 `REASONING_LEVELS` 常量可保留作为"配置层接受集合"的文档语义，
   但**校验权威**改为 provider levels。或直接删除全局常量，统一以 registry 为准
   （更彻底，避免两处真相源）。

5. 测试更新：
   - `types.test.ts` T0.8：`LLM_REASONING_DEFAULT=medium` 对 mistral 应改为**启动报错**
     （而非现在的 `reasoningDefault==='medium'`）。
   - 新增：对 mistral 设 `high`/`none` 通过、设 `medium`/`xhigh` 报错的用例。
   - `index.test.ts` 可补 `createProvider` 层面的校验传播用例（若走方案 b）。

### 影响面

- `server/llm/types.ts`（或 `index.ts`）：校验逻辑改动。
- `server/llm/types.test.ts`、`server/llm/index.test.ts`：T0.8 等用例更新。
- `docs/requirement2design/llm-provider-registry-requirements.md`：任务5/§7 关于
  `LLM_REASONING_DEFAULT` 的描述需同步（目前文档假设 6 档，与 mistral 实际 2 档不符，
  本身也需修正——见下"附：文档漂移"）。
- 行为变化：原先"启动通过、运行时静默回退"变为"启动即报错"。对已正确配置
  `high`/`none` 的用户无影响；对误配 `medium` 的用户从"静默错误"升级为"显式错误"，
  是正向改进。

## 取舍：B（静默回退）vs C（启动报错）

- B 已落地：保证不 400，但静默——用户可能不知道自己的配置被忽略。
- C：启动即报错，配置错误立刻可见，符合 fail-fast。
- 两者不冲突：C 落地后，B 作为"防御性兜底"仍可保留（即便校验漏了，运行时也不崩）。

## 附：文档漂移（建议一并修正）

`docs/requirement2design/llm-provider-registry-requirements.md` 中关于 mistral 推理档位的
描述仍按 6 档假设（A 已把代码改为 2 档）。文档与代码已不一致，建议在实现 C 时一并把
需求文档里 mistral 的 levels 描述、相关任务验收标准同步到 `["none","high"]`。

## 待办

- [ ] 选定接法（推荐 b：校验上移到 createProvider）
- [ ] 实现 provider-level levels 校验
- [ ] 更新 T0.8 等测试
- [ ] 同步修正需求文档的 mistral levels 描述
- [ ] 决定全局 `REASONING_LEVELS` 常量去留
