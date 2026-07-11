# 用户隔离与管理员模式 — 需求文档

## 背景

### 问题描述

当前 LogicRefiner 系统没有用户隔离机制，所有访问者共享同一份历史记录数据：

- 任何人都能看到所有人的精炼历史
- 任何人都能删除/修改他人的记录
- 数据无隐私保护，比赛场景下评委体验不佳

### 目标

在不引入完整用户注册登录系统的前提下，实现基于会话的用户数据隔离，并提供管理员入口让开发者查看全部数据。

### 设计原则

| 原则         | 含义                    |
| ---------- | --------------------- |
| **零摩擦**    | 访客无需注册登录，打开即用         |
| **数据隔离**   | 每个访客只能看到和操作自己产生的数据    |
| **最小改动**   | 数据库仅新增一个字段，API 新增过滤逻辑 |
| **管理员兜底**  | 开发者可通过管理员模式查看和管理全部数据  |
| **TDD 流程** | 每个任务先写测试，再写实现，测试驱动开发  |

***

## 总体架构

```
访客模式 (默认)                          管理员模式
┌─────────────────────┐                ┌─────────────────────┐
│ 前端生成 session_id  │                │ 输入管理员密码       │
│ 存 localStorage      │                │ 获取 admin_token    │
└──────────┬──────────┘                └──────────┬──────────┘
           │                                      │
           ▼                                      ▼
┌─────────────────────────────────────────────────────────┐
│                    后端 API 层                           │
│  - 检查 Authorization header                             │
│  - 管理员模式：不过滤 session_id，返回全部数据           │
│  - 访客模式：按 session_id 过滤数据                      │
└──────────────────────────────┬──────────────────────────┘
                               │
                               ▼
                    ┌────────────────────┐
                    │ SQLite 数据库      │
                    │ refinements 表      │
                    │ + session_id 字段  │
                    └────────────────────┘
```

***

## 实施顺序与 TDD 流程

### 总体流程

每个子任务严格遵循 TDD 循环：

1. **Red**：先写测试（预期失败）
2. **Green**：写实现代码让测试通过
3. **Refactor**：重构优化（如有必要）
4. **Review**：确认验收标准全部满足

### 任务依赖关系

```
任务0: 环境配置 (.env 更新、类型定义)
  ↓
任务1: 数据库层改造 (session_id 字段 + 迁移)
  ↓
任务2: 后端 API 层 (session_id 过滤 + 管理员鉴权)
  ↓
任务3: 前端访客模式 (session_id 生成 + 请求封装)
  ↓
任务4: 前端管理员模式 (密码入口 + 状态标识)
  ↓
任务5: 端到端集成测试
```

***

## 任务 0：环境配置与类型定义

**目标**：完成环境变量、类型定义等前置准备工作。

### 设计

#### 0.1 环境变量更新

更新 `.env.example`，新增 `ADMIN_TOKEN` 说明：

```
# ADMIN_TOKEN: 管理员模式访问令牌，用于查看和管理全部数据。
# 建议使用足够复杂的随机字符串。
ADMIN_TOKEN="your_secure_admin_token_here"
```

#### 0.2 类型定义更新

`src/db.ts` 中的 `RefinementRecord` 接口新增 `session_id` 字段（可选）：

```ts
export interface RefinementRecord {
  id: number;
  input: string;
  finalLogic: string;
  explanation: string | null;
  stages: string;
  cycles: number;
  session_id: string | null;  // 新增
  created_at: string;
}
```

前端 `HistoryList.tsx` 中的 `HistoryRecord` 接口同步新增。

#### 0.3 前端 API 工具函数封装

新建文件：`src/utils/api.ts`

封装统一的 API 请求工具：

```ts
const SESSION_KEY = 'logicrefiner_session_id';
const ADMIN_TOKEN_KEY = 'logicrefiner_admin_token';

export function getSessionId(): string {
  let sessionId = localStorage.getItem(SESSION_KEY);
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    localStorage.setItem(SESSION_KEY, sessionId);
  }
  return sessionId;
}

export function getAdminToken(): string | null {
  return localStorage.getItem(ADMIN_TOKEN_KEY);
}

export function setAdminToken(token: string): void {
  localStorage.setItem(ADMIN_TOKEN_KEY, token);
}

export function clearAdminToken(): void {
  localStorage.removeItem(ADMIN_TOKEN_KEY);
}

export function isAdminMode(): boolean {
  return getAdminToken() !== null;
}

export async function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const headers = new Headers(options.headers);
  headers.set('X-Session-Id', getSessionId());
  const adminToken = getAdminToken();
  if (adminToken) {
    headers.set('Authorization', `Bearer ${adminToken}`);
  }
  return fetch(url, { ...options, headers });
}
```

### TDD 测试用例

**测试文件**：新建 `src/utils/api.test.ts`

#### 测试 0.1：getSessionId 首次调用生成 UUID

- 清空 localStorage
- 调用 getSessionId()
- 返回值应为有效 UUID 格式
- localStorage 中应存储了该值

#### 测试 0.2：getSessionId 二次调用复用

- 先写入一个固定值
- 调用 getSessionId()
- 应返回该固定值，不生成新的

#### 测试 0.3：apiFetch 自动携带 session\_id header

- Mock fetch
- 调用 apiFetch('/test')
- 验证 fetch 调用的 headers 包含 X-Session-Id

#### 测试 0.4：apiFetch 在管理员模式下携带 Authorization

- 设置 admin token
- Mock fetch
- 调用 apiFetch('/test')
- 验证 headers 包含 Authorization: Bearer <token>

#### 测试 0.5：管理员 token 的设置和清除

- setAdminToken → isAdminMode() 为 true
- clearAdminToken → isAdminMode() 为 false

### 验收标准

- [x] `.env.example` 包含 ADMIN\_TOKEN 说明
- [x] `RefinementRecord` 接口包含 session\_id 字段
- [x] `HistoryRecord` 接口包含 session\_id 字段
- [x] `src/utils/api.ts` 工具函数创建完成
- [x] 所有新增测试用例通过

***

## 任务 1：数据库层改造 — session\_id 字段

**目标**：为 `refinements` 表新增 `session_id` 字段，支持数据按会话隔离。

### 设计

#### 1.1 数据库表结构变更

**修改位置**：`src/db.ts` 第 52-62 行（`CREATE TABLE` 语句）

**表结构变更**：

```sql
CREATE TABLE IF NOT EXISTS refinements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  input TEXT NOT NULL,
  final_logic TEXT NOT NULL,
  explanation TEXT,
  stages TEXT NOT NULL,
  cycles INTEGER NOT NULL DEFAULT 1,
  session_id TEXT,          -- 新增：会话标识，NULL 表示未分类的历史数据
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

#### 1.2 已有数据迁移

**策略**：应用启动时检测并迁移已有数据

- 如果 `refinements` 表已存在且无 `session_id` 列，则添加列
- 将所有已有记录的 `session_id` 设为 `'legacy'`（遗留数据）
- 迁移逻辑放在 `initDb` 函数中，CREATE TABLE 之后执行

**迁移 SQL**：

```sql
-- 先检查列是否存在（PRAGMA table_info(refinements)）
-- 如果 session_id 列不存在，执行：
ALTER TABLE refinements ADD COLUMN session_id TEXT;
UPDATE refinements SET session_id = 'legacy' WHERE session_id IS NULL;
```

**幂等性保证**：

- 使用 `PRAGMA table_info(refinements)` 查询表结构，判断 `session_id` 列是否存在
- 只有不存在时才执行 ALTER TABLE
- 多次启动不会重复执行迁移

#### 1.3 DB 函数改造

所有 CRUD 函数新增 `sessionId` 参数（可选，不传则不过滤）：

| 函数                                                 | 修改内容                               |
| -------------------------------------------------- | ---------------------------------- |
| `saveRefinement(db, data, sessionId?)`             | INSERT 时带上 session\_id             |
| `createRefinement(db, input, cycles, sessionId?)`  | INSERT 时带上 session\_id             |
| `getRefinements(db, sessionId?)`                   | 有 sessionId 时加 WHERE 过滤            |
| `getRefinementById(db, id, sessionId?)`            | 有 sessionId 时加 AND session\_id = ? |
| `updateRefinement(db, id, data, sessionId?)`       | 有 sessionId 时加 AND session\_id = ? |
| `updateRefinementInput(db, id, input, sessionId?)` | 有 sessionId 时加 AND session\_id = ? |
| `deleteRefinement(db, id, sessionId?)`             | 有 sessionId 时加 AND session\_id = ? |

**设计说明**：

- `sessionId` 参数为可选，不传则行为与改造前一致（全量操作），方便管理员模式
- `getRefinements` 传 `sessionId` 时返回该会话的所有记录，不传返回全部
- 更新/删除操作传 `sessionId` 时，只有匹配的记录才能被修改/删除，防止越权
- 管理员模式下创建记录时，仍然带上管理员自己的 `session_id`，这样管理员切换回普通模式也能看到自己创建的记录

### TDD 测试用例

**测试文件**：`src/db.test.ts`（已有，需扩充）

#### 测试 1.1：新建数据库包含 session\_id 列

- 初始化内存数据库
- 查询表结构，验证 session\_id 列存在

#### 测试 1.2：createRefinement 支持传入 sessionId

- 调用 createRefinement 传入 sessionId = 'test-session-1'
- 查询该记录，验证 session\_id 字段为 'test-session-1'

#### 测试 1.3：getRefinements 按 sessionId 过滤

- 创建 3 条记录：2 条 session A，1 条 session B
- getRefinements 传 session A 的 id，应只返回 2 条
- getRefinements 不传 sessionId，应返回全部 3 条

#### 测试 1.4：getRefinementById 按 sessionId 过滤

- 创建一条 session A 的记录
- 用正确 sessionId 查询，应返回记录
- 用错误 sessionId 查询，应返回 null
- 不传 sessionId 查询，应返回记录

#### 测试 1.5：updateRefinement 按 sessionId 权限控制

- 创建一条 session A 的记录
- 用错误的 sessionId 更新，应返回 false，记录不变
- 用正确的 sessionId 更新，应返回 true，记录已更新
- 不传 sessionId 更新，应返回 true，记录已更新

#### 测试 1.6：deleteRefinement 按 sessionId 权限控制

- 创建一条 session A 的记录
- 用错误的 sessionId 删除，应返回 false，记录仍存在
- 用正确的 sessionId 删除，应返回 true，记录已删除
- 不传 sessionId 删除，应返回 true

#### 测试 1.7：已有数据迁移

- 创建无 session\_id 列的旧表结构，插入测试数据
- 调用 initDb 初始化
- 验证 session\_id 列已添加，且所有记录的 session\_id 为 'legacy'

### 验收标准

- [x] 新建数据库的 refinements 表包含 session_id 列
- [x] 旧数据库启动时自动迁移，已有记录 session_id 为 'legacy'
- [x] 所有 CRUD 函数支持 sessionId 参数，过滤逻辑正确
- [x] 不传 sessionId 时行为与改造前一致（向后兼容）
- [x] 所有新增测试用例通过
- [x] 原有测试用例全部通过（无回归）

***

## 任务 2：后端 API 层 — 会话过滤与管理员鉴权

**目标**：后端 API 支持按 session\_id 过滤数据，实现管理员鉴权机制。

### 设计

#### 2.1 Session ID 传递方式

前端通过 HTTP Header 传递 session\_id：

```
X-Session-Id: <session_id_string>
```

选择 Header 而非 Query 参数的原因：

- 不污染 URL
- 所有请求类型（GET/POST/PUT/DELETE）统一方式
- 与管理员 Token 的传递风格一致

#### 2.2 管理员鉴权方式

前端通过 `Authorization` header 传递管理员 token：

```
Authorization: Bearer <admin_token>
```

后端校验逻辑：

- 如果 Authorization header 匹配 `.env` 中的 `ADMIN_TOKEN`，则判定为管理员模式
- 管理员模式下，所有 API 不过滤 session\_id，返回/操作全部数据
- 非管理员模式下，使用 `X-Session-Id` header 中的 session\_id 进行过滤
- 非管理员模式下如果没有提供 session\_id（直接调 API 的情况），返回空列表（GET）或 400 错误（写入操作）

**管理员创建记录的行为**：

- 管理员模式下创建的记录仍然带上管理员自己的 `session_id`
- 这样管理员切换回普通模式时，仍能看到自己创建的记录
- 管理员可以看到和操作全部记录，不限于自己的

#### 2.3 新增环境变量

`.env` 新增：

```
ADMIN_TOKEN=your_secure_admin_token_here
```

`server.ts` 中读取：

```ts
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;
```

#### 2.4 中间件设计

新增一个简单的鉴权中间件（或在每个路由开始处检查）：

```ts
function getAuthContext(req: express.Request): { isAdmin: boolean; sessionId: string | null } {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const isAdmin = token === ADMIN_TOKEN;
  const sessionId = (req.headers['x-session-id'] as string) || null;
  return { isAdmin, sessionId };
}
```

在每个 API 路由中：

1. 调用 `getAuthContext` 获取鉴权信息
2. 如果是管理员，调用 DB 函数时不传 sessionId
3. 如果不是管理员，将 sessionId 传给 DB 函数

#### 2.5 新增 API：管理员登录验证

```
POST /api/admin/verify
Request Body: { token: string }
Response: { valid: boolean }
```

用途：前端输入密码后，验证是否正确，正确则存储 token。

#### 2.6 各 API 端点改造清单

| 端点                               | 修改内容                    |
| -------------------------------- | ----------------------- |
| `GET /api/refine`                | SSE 创建记录时使用 session\_id |
| `GET /api/refinements`           | 按 session\_id 过滤返回列表    |
| `GET /api/refinements/:id`       | 按 session\_id 过滤单条查询    |
| `POST /api/refinements`          | 创建记录时带上 session\_id     |
| `PUT /api/refinements/:id`       | 按 session\_id 鉴权更新      |
| `PUT /api/refinements/:id/input` | 按 session\_id 鉴权重命名     |
| `DELETE /api/refinements/:id`    | 按 session\_id 鉴权删除      |
| `POST /api/admin/verify`         | 新增：验证管理员 token          |

### TDD 测试用例

**测试策略**：

- 鉴权逻辑抽成工具函数 `getAuthContext`，单独单元测试
- DB 层的 session 过滤在任务 1 中已测
- API 集成测试通过手动验证完成

**测试文件**：新建 `src/utils/auth.test.ts`（后端工具函数测试）

#### 测试 2.1：getAuthContext 识别管理员模式

- 传入正确的 Authorization: Bearer \<admin\_token>
- isAdmin 应为 true

#### 测试 2.2：getAuthContext 识别访客模式

- 传入 X-Session-Id: session-a
- isAdmin 应为 false，sessionId 为 'session-a'

#### 测试 2.3：getAuthContext 处理无 session 的情况

- 不传 Authorization，也不传 X-Session-Id
- isAdmin 应为 false，sessionId 为 null

#### 测试 2.4：错误的管理员 token 不判定为管理员

- 传入错误的 Authorization: Bearer wrong-token
- isAdmin 应为 false

#### 测试 2.5：管理员验证接口（集成测试，手动验证）

- POST /api/admin/verify 传正确 token → { valid: true }
- POST /api/admin/verify 传错误 token → { valid: false }

### 验收标准

- [x] 访客模式下，所有 API 按 session_id 正确过滤数据
- [x] 访客不能查看、修改、删除他人的记录
- [x] 管理员模式下，所有 API 返回/操作全部数据
- [x] 管理员验证接口工作正常
- [x] 非管理员无 session_id 时，GET 返回空列表，写入操作返回 400
- [x] 管理员模式下创建的记录仍带有管理员自己的 session_id
- [x] getAuthContext 工具函数的单元测试全部通过
- [x] 原有功能无回归（精炼流程、历史列表等正常工作）

***

## 任务 3：前端访客模式 — 会话 ID 管理

**目标**：前端自动生成并管理访客 session\_id，所有 API 请求自动携带。

### 设计

#### 3.1 Session ID 生成与存储

**生成时机**：应用首次加载时（`App.tsx` 的 `useEffect` 初始化阶段）

**生成方式**：使用 `crypto.randomUUID()` 生成标准 UUID（现代浏览器原生支持）

**存储位置**：`localStorage`，key 为 `logicrefiner_session_id`

**逻辑流程**：

1. 应用初始化时，从 localStorage 读取 session\_id
2. 如果不存在，生成新的 UUID 并写入 localStorage
3. 后续所有 API 请求都带上这个 session\_id

#### 3.2 API 请求封装

方案一：封装 fetch 函数（推荐）

- 创建一个工具函数 `apiFetch(url, options)`
- 自动添加 X-Session-Id header
- 如果有管理员 token，自动添加 Authorization header
- 所有 API 调用改用这个工具函数

方案二：每个请求手动加 header

- 改动点分散，容易遗漏

选择方案一，集中管理，不易出错。

#### 3.3 需要修改的前端请求点

| 位置                | 请求类型                           | 用途     |
| ----------------- | ------------------------------ | ------ |
| `App.tsx` 第 138 行 | POST /api/refinements          | 创建精炼记录 |
| `App.tsx` 第 149 行 | GET /api/refine (SSE)          | 启动精炼   |
| `App.tsx` 第 165 行 | DELETE /api/refinements/:id    | 删除失败记录 |
| `App.tsx` 第 225 行 | DELETE /api/refinements/:id    | 删除错误记录 |
| `HistoryList.tsx` | GET /api/refinements           | 获取历史列表 |
| `HistoryList.tsx` | DELETE /api/refinements/:id    | 删除历史记录 |
| `HistoryList.tsx` | PUT /api/refinements/:id/input | 重命名记录  |

**注意**：SSE (EventSource) 不能自定义 header，需要用 query 参数传递 session\_id。

#### 3.4 SSE 特殊处理

`EventSource` API 不支持自定义 HTTP headers，所以 `/api/refine` 的 session\_id 需要通过 query 参数传递：

```
/api/refine?input=xxx&cycles=2&id=123&session_id=xxx
```

后端 `/api/refine` 端点同时支持 header 和 query 两种方式，优先取 header，没有则取 query。

### TDD 测试用例

**测试文件**：`src/App.test.tsx`、`src/components/HistoryList.test.tsx`

#### 测试 3.1：首次访问生成 session\_id

- 清空 localStorage
- 渲染 App
- 验证 localStorage 中存在 session\_id
- 验证 session\_id 是有效的 UUID 格式

#### 测试 3.2：再次访问复用 session\_id

- 先写入一个固定的 session\_id 到 localStorage
- 渲染 App
- 验证 API 请求使用的是这个固定 session\_id

#### 测试 3.3：API 请求携带 session\_id header

- Mock fetch
- 触发创建精炼请求
- 验证 fetch 调用的 headers 包含 X-Session-Id

#### 测试 3.4：SSE 请求携带 session\_id query 参数

- Mock EventSource
- 触发精炼流程
- 验证 EventSource 的 URL 包含 session\_id 参数

#### 测试 3.5：历史列表只显示当前 session 的记录

- Mock API 返回不同 session 的多条记录
- 验证只渲染当前 session 的记录

### 验收标准

- [x] 首次访问自动生成 session_id 并存入 localStorage
- [x] 再次访问复用已有 session_id
- [x] 所有普通 API 请求自动携带 X-Session-Id header
- [x] SSE 请求通过 query 参数传递 session_id
- [x] 历史列表只显示当前 session 的记录
- [x] 删除、重命名等操作只对当前 session 的记录生效
- [x] 所有新增测试用例通过
- [x] 原有测试用例全部通过（无回归）

***

## 任务 4：前端管理员模式 — 入口与状态标识

**目标**：实现隐蔽的管理员入口，支持输入密码切换管理员模式，并提供明显的状态标识。

### 设计

#### 4.1 管理员入口

**触发方式**：点击页面右上角的版本号 `v1.2.5` 文字

**交互流程**：

普通模式下点击版本号：

1. 弹出模态框，显示"管理员登录"标题
2. 密码输入框 + 确认按钮 + 取消按钮
3. 输入密码点击确认：
   - 验证成功：关闭模态框，显示 Toast "管理员模式已开启"，刷新历史列表
   - 验证失败：输入框下方显示红色错误文字"密码错误"

管理员模式下点击版本号：

1. 弹出模态框，显示"管理员模式"标题
2. 显示当前状态："当前处于管理员模式，可查看和管理全部数据"
3. 提供"退出管理员模式"按钮
4. 点击退出：清除 localStorage 中的 admin\_token，关闭模态框，刷新历史列表，显示 Toast "已退出管理员模式"

**模态框设计**：

- 居中显示，黑色半透明遮罩
- 黑底白字，细白色边框
- 等宽字体，与整体风格一致
- 密码输入框：黑底、细白边、等宽字体
- 按钮：白色边框 + 白色文字，悬停反色

#### 4.2 管理员状态标识

**显示位置**：页面右上角"系统状态"区域

**显示方式**：

- 普通模式：显示 "系统状态"（保持不变）
- 管理员模式：显示 "系统状态(ADMIN)"
- ADMIN 文字使用亮白色，与主标题 LogicRefiner 同色（纯白，非灰色）

#### 4.3 管理员模式的持久化

- 管理员 token 存入 localStorage
- 页面刷新时，从 localStorage 读取 token，自动进入管理员模式
- 退出管理员模式：再次点击版本号，在弹出框中选择"退出管理员模式"

#### 4.4 UI 组件

- 密码输入框：使用现有设计语言（黑底白字、细边框、等宽字体）
- 模态框：简单居中的对话框，带遮罩层
- 复用现有 Toast 组件显示成功/失败提示

### TDD 测试用例

**测试文件**：需新建或扩充 App.test.tsx

#### 测试 4.1：点击版本号显示密码输入框

- 渲染 App
- 点击版本号元素
- 验证密码输入框出现

#### 测试 4.2：输入正确密码进入管理员模式

- Mock /api/admin/verify 返回 { valid: true }
- 输入正确密码，点击确认
- 验证 localStorage 中有 admin\_token
- 验证"系统状态(ADMIN)"标识显示

#### 测试 4.3：输入错误密码提示错误

- Mock /api/admin/verify 返回 { valid: false }
- 输入错误密码，点击确认
- 验证错误提示显示
- 验证仍为普通模式

#### 4.4：管理员模式下历史列表显示全部数据

- 设置管理员 token
- Mock API 返回全部数据（含 legacy 和各 session）
- 验证全部记录都被渲染

#### 4.5：刷新后保持管理员模式

- localStorage 中预设 admin\_token
- 渲染 App
- 验证自动进入管理员模式

#### 测试 4.6：退出管理员模式

- 处于管理员模式
- 点击版本号，选择退出
- 验证 localStorage 中 admin\_token 被清除
- 验证恢复为普通模式

### 验收标准

- [x] 点击版本号可弹出密码输入框
- [x] 输入正确密码进入管理员模式，token 存入 localStorage
- [x] 输入错误密码显示错误提示，不切换模式
- [x] 管理员模式下"系统状态"变为"系统状态(ADMIN)"，ADMIN 为亮白色
- [x] 管理员模式下历史列表显示全部数据
- [x] 管理员模式下可删除/修改任何记录
- [x] 刷新页面后管理员状态保持
- [x] 可退出管理员模式
- [x] 所有新增测试用例通过
- [x] 原有测试用例全部通过（无回归）

***

## 任务 5：端到端集成测试

**目标**：验证整个用户隔离流程的端到端正确性。

### 测试场景

#### 场景 5.1：两个访客数据互不干扰

- 访客 A 访问，产生一条精炼记录
- 访客 B 访问（不同 session\_id），只能看到自己的记录
- 访客 A 刷新，能看到自己的记录，看不到 B 的

#### 场景 5.2：访客无法操作他人记录

- 访客 A 创建记录
- 访客 B 尝试删除 A 的记录（通过直接构造请求）
- 应失败，记录仍存在

#### 场景 5.3：管理员可查看和操作全部数据

- 管理员登录
- 能看到所有 session 的记录（包括 legacy）
- 可删除任何记录

#### 场景 5.4：历史数据迁移验证

- 使用旧版数据库文件启动
- 验证历史记录的 session\_id 为 'legacy'
- 普通访客看不到 legacy 数据
- 管理员可以看到 legacy 数据

#### 场景 5.5：精炼流程完整闭环

- 访客模式下发起一次精炼
- 精炼成功后，记录出现在该访客的历史列表中
- 其他访客看不到该记录
- 管理员可以看到该记录

### 验收标准

- [x] 两个不同 session 的访客数据完全隔离
- [x] 越权操作（查看/修改/删除他人记录）被正确拦截
- [x] 管理员模式可正常查看和管理全部数据
- [x] 旧数据库迁移正常，legacy 数据处理正确
- [x] 完整精炼流程在访客模式下正常工作
- [x] 完整精炼流程在管理员模式下正常工作

***

### 技术注意事项

### 安全考虑

- ADMIN\_TOKEN 应足够复杂且随机，不要使用简单密码
- 管理员 token 不硬编码在前端代码中
- session\_id 使用 UUID，足够随机，难以被猜测
- 虽然是比赛场景，但基本的安全边界要有

### 向后兼容

- 所有 DB 函数的 sessionId 参数为可选，不传则行为不变
- 数据库迁移是幂等的，多次启动不会重复执行
- 前端 apiFetch 封装向后兼容，调用方式与 fetch 一致

### 性能影响

- 当前数据量小，session\_id 字段无需加索引
- 如果数据量增大，可考虑加 `CREATE INDEX idx_session_id ON refinements(session_id)`

### 测试策略

- 单元测试：DB 层（已有测试框架，直接扩充）
- 单元测试：前端 API 工具函数（`src/utils/api.test.ts`）
- 单元测试：后端鉴权工具函数（`src/utils/auth.test.ts`）
- 组件测试：前端组件（已有 Vitest + React Testing Library）
- 手动测试：API 集成测试 + 端到端场景

### 文件变更清单

| 文件                                    | 变更类型 | 说明                                        |
| ------------------------------------- | ---- | ----------------------------------------- |
| `.env.example`                        | 修改   | 新增 ADMIN\_TOKEN 说明                        |
| `src/db.ts`                           | 修改   | 新增 session\_id 字段、迁移逻辑、各函数新增 sessionId 参数 |
| `src/db.test.ts`                      | 修改   | 扩充 session\_id 相关测试                       |
| `server.ts`                           | 修改   | 新增 getAuthContext、管理员验证接口、各 API 端点接入鉴权    |
| `src/utils/api.ts`                    | 新增   | 前端 API 请求封装工具                             |
| `src/utils/api.test.ts`               | 新增   | 前端 API 工具测试                               |
| `src/utils/auth.ts`                   | 新增   | 后端鉴权工具函数（可选，可直接放 server.ts）               |
| `src/utils/auth.test.ts`              | 新增   | 后端鉴权工具测试                                  |
| `src/App.tsx`                         | 修改   | 接入 apiFetch、管理员入口、状态标识、模态框                |
| `src/components/HistoryList.tsx`      | 修改   | 接入 apiFetch、类型更新                          |
| `src/components/HistoryList.test.tsx` | 修改   | 适配新的 fetch 方式                             |

---

## 追加需求：管理员入口交互优化

### 背景

当前管理员入口为点击版本号 `v1.2.5` 一次即弹出登录框，存在以下问题：
- 评委在浏览页面时可能无意点击版本号，弹出不必要的登录框
- 密码输入框缺少可见性切换，用户体验不够友好

### 设计

#### 1. 连续点击 5 次触发管理员入口

**普通模式**：
- 点击版本号 5 次后才弹出管理员登录框
- 每次点击间隔不超过 2 秒，超过 2 秒未点击则重置计数器
- 点击计数对用户不可见（无 UI 提示）

**管理员模式**：
- 点击版本号 1 次即弹出退出框（现有逻辑不变）
- 不需要连续点击 5 次

**交互逻辑**：
```
普通模式：
  点击 v1.2.5
    → 计数器 +1
    → 如果 2 秒内没有下一次点击，重置计数器为 0
    → 计数器达到 5 → 弹出管理员登录框，重置计数器

管理员模式：
  点击 v1.2.5
    → 直接弹出退出框（现有逻辑）
```

#### 2. 密码输入框可见性切换

**位置**：密码输入框内部右侧，使用绝对定位

**图标**：lucide-react 的 `Eye`（隐藏状态）和 `EyeOff`（显示状态）

**交互**：
- 默认隐藏密码（`type="password"`），显示 `Eye` 图标
- 点击图标切换为明文（`type="text"`），图标变为 `EyeOff`
- 再次点击切回隐藏状态
- 图标样式：`text-zinc-500 hover:text-white transition-colors cursor-pointer`，与现有 UI 风格一致

#### 3. 退出机制

不改动，保留现有逻辑：
- 管理员模式下点击版本号 1 次 → 弹出退出框
- 点击"退出管理员模式"按钮 → 清除 localStorage 中的 admin_token，切换回普通模式

### 任务拆分

---

## 任务 6：连续点击触发与密码可见性切换

**目标**：优化管理员入口的触发方式，增加密码输入框的可见性切换功能。

### 设计

#### 6.1 连续点击计数器

**修改位置**：`src/App.tsx`

**新增 state / ref**：
- `versionClickCount`：点击计数器（number，useState）
- `clickTimerRef`：2 秒超时定时器引用（useRef<ReturnType<typeof setTimeout> | null>）

**逻辑**：
- 版本号的 `onClick` 修改为 `handleVersionClick`
- 普通模式下：
  - 每次点击递增计数器
  - 清除上一次的定时器，设置新的 2 秒定时器
  - 定时器触发时重置计数器为 0
  - 计数器达到 5 时，弹出管理员登录框并重置计数器
- 管理员模式下：
  - 点击 1 次直接弹出退出框（现有逻辑）
  - 不影响计数器逻辑

#### 6.2 密码可见性切换

**新增 state**：
- `showPassword`：密码是否可见（boolean，默认 false）

**UI**：
- 密码输入框外层包一个 `relative` 容器
- 图标按钮绝对定位在右侧（`absolute right-3 top-1/2 -translate-y-1/2`）
- 根据状态切换 `type` 和图标

### TDD 测试用例

**测试文件**：扩充 `src/App.test.tsx`

#### 测试 6.1：普通模式下单次点击不弹出管理员登录框
- 渲染 App（普通模式）
- 点击版本号 1 次
- 验证管理员登录框未出现

#### 测试 6.2：连续点击 5 次弹出管理员登录框
- 渲染 App（普通模式）
- 连续点击版本号 5 次
- 验证管理员登录框出现

#### 测试 6.3：点击间隔超过 2 秒后重置计数器
- 渲染 App（普通模式）
- 使用 `vi.useFakeTimers()` 模拟定时器
- 点击版本号 3 次
- `vi.advanceTimersByTime(2001)` 推进 2 秒
- 再点击 2 次
- 验证管理员登录框未出现

#### 测试 6.4：管理员模式下点击 1 次直接弹出退出框
- 设置管理员 token（管理员模式）
- 点击版本号 1 次
- 验证退出框出现（包含"退出管理员模式"按钮）

#### 测试 6.5：密码默认隐藏
- 触发管理员登录框（连续点击 5 次）
- 验证密码输入框 type 为 password

#### 测试 6.6：点击眼睛图标切换密码可见
- 触发管理员登录框
- 点击眼睛图标
- 验证密码输入框 type 变为 text
- 验证图标变为 EyeOff
- 再次点击
- 验证密码输入框 type 变回 password

### 验收标准

- [x] 普通模式下点击版本号 1-4 次不弹出管理员登录框
- [x] 普通模式下连续点击 5 次弹出管理员登录框
- [x] 点击间隔超过 2 秒后计数器重置
- [x] 管理员模式下点击 1 次直接弹出退出框
- [x] 密码输入框默认隐藏密码
- [x] 点击眼睛图标可切换密码可见性
- [x] 图标样式与现有 UI 风格一致
- [x] 所有新增测试用例通过
- [x] 原有测试用例全部通过（无回归）

### 文件变更清单

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `src/App.tsx` | 修改 | 版本号点击计数逻辑、密码可见性切换 |
| `src/App.test.tsx` | 修改 | 新增 6 个测试用例 |
| `docs/user-isolation-requirements.md` | 修改 | 追加任务 6 需求文档 |

