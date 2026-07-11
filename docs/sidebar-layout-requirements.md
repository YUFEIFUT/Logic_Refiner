# 侧边栏布局改造 — 需求文档

## 背景

### 问题描述

当前 LogicRefiner 的侧边栏仅作为历史记录的容器存在，视觉与交互都较为简陋：

- 顶部仅有一个“新建对话”按钮和一个收起图标，缺少品牌标识
- 使用 `lucide-react` 的通用图标（Menu / Plus / ChevronsLeft），与项目定制的 SVG 图标风格不一致
- 顶部功能区没有清晰区分“品牌区”与“操作区”，与 ChatGPT 等主流对话产品的侧边栏认知差距较大
- 收起状态下的悬浮按钮位置、尺寸和动效未经过仔细打磨

本次改造聚焦侧边栏的**顶部品牌区与操作区**，以及**展开/收起动画与响应式适配**。历史记录列表本身已有按时间分组能力，本次不对其内部样式做额外改动。

### 目标

将侧边栏改造成类似 ChatGPT 的侧边栏布局：顶部展示品牌 Logo + 新建聊天按钮，中部展示历史记录，底部预留扩展区域；同时全面使用项目提供的 SVG 图标（logic\_refiner.svg / new\_chat.svg / close\_side.svg），提升视觉一致性与品牌感。

### 设计原则

| 原则         | 含义                         |
| ---------- | -------------------------- |
| **品牌一致**   | 使用项目自有 SVG 图标，保持黑白高对比风格    |
| **认知对齐**   | 布局贴近 ChatGPT 侧边栏，降低用户学习成本  |
| **响应式优先**  | 桌面端可固定/收起，移动端以抽屉形式呈现       |
| **最小侵入**   | 只改 Sidebar 组件与主布局配合，不动业务逻辑 |
| **TDD 流程** | 每个任务先写测试，再写实现，测试驱动开发       |

***

## 总体设计

### 目标布局（ChatGPT 风格）

```
┌─────────────────────────────────────────────────────────────┐
│  [Sidebar]                         │  [Main Content]        │
│  ┌─────────────────────────────┐   │                        │
│  │ [Logo] LogicRefiner      [X]│   │  LogicRefiner v1.2.5  │
│  ├─────────────────────────────┤   │                        │
│  │ [+] 新建对话                 │   │  ...                   │
│  ├─────────────────────────────┤   │                        │
│  │ 今天                         │   │                        │
│  │  - 历史记录 1                │   │                        │
│  │  - 历史记录 2                │   │                        │
│  │ 昨天                         │   │                        │
│  │  - 历史记录 3                │   │                        │
│  ├─────────────────────────────┤   │                        │
│  │ （底部预留区域）             │   │                        │
│  └─────────────────────────────┘   │                        │
└─────────────────────────────────────────────────────────────┘
```

### 图标使用清单

三个 SVG 图标从 `public/` 迁移到 `src/assets/`，改为内联 React 组件方式引入，使用 `currentColor` 控制颜色，以便通过 CSS `text-*` 类实现 hover/active 变色。

| 用途      | 原始文件                       | 迁移后路径                          | 组件名             | 尺寸（建议）   | 说明                  |
| ------- | -------------------------- | ------------------------------ | --------------- | -------- | ------------------- |
| 品牌 Logo | `public/logic_refiner.svg` | `src/assets/LogoIcon.tsx`      | `LogoIcon`      | 24×24 px | 侧边栏顶部品牌标识           |
| 新建聊天    | `public/new_chat.svg`      | `src/assets/NewChatIcon.tsx`   | `NewChatIcon`   | 18×18 px | Header 下方“新建对话”按钮图标 |
| 关闭边栏    | `public/close_side.svg`    | `src/assets/CloseSideIcon.tsx` | `CloseSideIcon` | 18×18 px | 侧边栏顶部右侧收起按钮         |

**迁移要点**：

- SVG 中的 `fill="#ffffff"` / `stroke="#ffffff"` 全部替换为 `fill="currentColor"` / `stroke="currentColor"`
- 每个 SVG 封装为接收 `className` 的函数组件，便于控制尺寸和颜色
- 迁移后删除 `public/` 下对应的三个 SVG 文件（`favicon.png` 保留在 `public/`）

**组件示例**：

```tsx
// src/assets/LogoIcon.tsx
export function LogoIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 800 800"
      fill="none"
      stroke="currentColor"
      strokeWidth="15"
      strokeLinejoin="round"
      strokeLinecap="round"
    >
      <path d="..." />
    </svg>
  );
}
```

**使用方式**：

```tsx
<LogoIcon className="w-6 h-6 text-white" />
<NewChatIcon className="w-[18px] h-[18px] text-zinc-400 hover:text-white" />
<CloseSideIcon className="w-[18px] h-[18px] text-zinc-400 hover:text-white" />
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
任务0: SVG 图标组件化（public/ → src/assets/ React 组件）
  ↓
任务1: Sidebar 组件布局改造（图标替换 + 结构调整）
  ↓
任务2: App.tsx 主布局适配（Header / Main 与侧边栏协作）
  ↓
任务3: 响应式与动画交互打磨
  ↓
任务4: TDD 测试覆盖与回归验证
```

***

## 任务 0：SVG 图标组件化

**目标**：将 `public/` 下的三个 SVG 文件迁移到 `src/assets/`，封装为使用 `currentColor` 的 React 组件。

### 设计

#### 0.1 迁移与封装

对每个 SVG 文件执行以下步骤：

1. 将 SVG 内容从 `public/*.svg` 移入 `src/assets/` 下的 `.tsx` 文件
2. 将硬编码的 `fill="#ffffff"` / `stroke="#ffffff"` 替换为 `fill="currentColor"` / `stroke="currentColor"`
3. 封装为接收 `className` 的函数组件

| 原始文件                   | 新文件                            | 组件名          |
| -------------------------- | --------------------------------- | --------------- |
| `public/logic_refiner.svg` | `src/assets/LogoIcon.tsx`         | `LogoIcon`      |
| `public/new_chat.svg`      | `src/assets/NewChatIcon.tsx`     | `NewChatIcon`   |
| `public/close_side.svg`    | `src/assets/CloseSideIcon.tsx`   | `CloseSideIcon` |

#### 0.2 清理旧文件

- 迁移完成后删除 `public/logic_refiner.svg`、`public/new_chat.svg`、`public/close_side.svg`
- `public/favicon.png` 保留不动

### TDD 测试用例

**测试文件**：`src/assets/icons.test.tsx`

#### 测试 0.1：LogoIcon 渲染为 SVG 元素

- 渲染 `<LogoIcon />`
- 验证返回一个 `<svg>` 元素
- 验证使用 `currentColor`（fill 或 stroke 属性值为 `currentColor`）

#### 测试 0.2：NewChatIcon 渲染为 SVG 元素

- 渲染 `<NewChatIcon />`
- 验证返回一个 `<svg>` 元素
- 验证 fill 属性值为 `currentColor`

#### 测试 0.3：CloseSideIcon 渲染为 SVG 元素

- 渲染 `<CloseSideIcon />`
- 验证返回一个 `<svg>` 元素
- 验证 fill 属性值为 `currentColor`

#### 测试 0.4：className 可透传

- 渲染 `<LogoIcon className="w-6 h-6" />`
- 验证 svg 元素包含 `w-6 h-6` class

### 验收标准

- [x] `src/assets/` 下存在 `LogoIcon.tsx`、`NewChatIcon.tsx`、`CloseSideIcon.tsx`
- [x] 三个组件均使用 `currentColor` 控制颜色
- [x] 三个组件均支持透传 `className`
- [x] `public/` 下不再存在 `logic_refiner.svg`、`new_chat.svg`、`close_side.svg`
- [x] `public/favicon.png` 保留不动
- [x] 所有新增测试用例通过

***

## 任务 1：Sidebar 组件布局改造

**目标**：使用指定 SVG 图标重构 `Sidebar.tsx`，形成类似 ChatGPT 的侧边栏布局。

### 设计

#### 1.1 图标替换

**修改位置**：`src/components/Sidebar.tsx`

- 移除 `lucide-react` 中的 `Menu`、`Plus`、`ChevronsLeft`
- 从 `src/assets/` 引入 `LogoIcon`、`NewChatIcon`、`CloseSideIcon` 组件
- 通过 `className` 控制图标尺寸，通过 `text-*` 类控制颜色（hover 变色由 `currentColor` 实现）

#### 1.2 顶部 Header 重构

顶部区域拆分为左右两部分，与 ChatGPT 侧边栏顶部一致：

- **左侧**：品牌区
  - `LogoIcon` 组件（`w-6 h-6`），点击行为与“新建对话”一致
  - “LogicRefiner” 文字标识，仅作为品牌展示
- **右侧**：关闭边栏按钮
  - `CloseSideIcon` 组件（`w-[18px] h-[18px]`）
  - 点击触发 `onToggle`
- **行高**：Header 高度约为 72px，约为下方“新建对话”按钮区高度（约 40px）的 1.8 倍

```tsx
<header className="flex items-center justify-between px-3 h-[72px] border-b border-white/10">
  <div className="flex items-center gap-2 text-white">
    <button
      onClick={onNewChat}
      aria-label="LogicRefiner"
      className="w-9 h-9 flex items-center justify-center rounded-md hover:bg-white/10 transition-colors active:scale-95"
    >
      <LogoIcon className="w-6 h-6" />
    </button>
    <span className="text-sm font-medium">LogicRefiner</span>
  </div>
  <button
    onClick={onToggle}
    aria-label="关闭边栏"
    className="w-9 h-9 flex items-center justify-center rounded-md text-zinc-400 hover:text-white hover:bg-white/10 transition-colors active:scale-95"
  >
    <CloseSideIcon className="w-[18px] h-[18px]" />
  </button>
</header>
```

#### 1.3 新建对话按钮区

在 Header 下方新增一个独立的新建对话按钮区：

- 使用 `NewChatIcon` 组件 + “新建对话” 文字
- 按钮占满宽度，高度约 40px（`h-10`），左侧对齐
- hover 背景 `hover:bg-white/10`
- 点击触发 `onNewChat`
- 与 ChatGPT 的 “New chat” 按钮位置和样式对齐

```tsx
<div className="px-3 py-2 border-b border-white/10">
  <button
    onClick={onNewChat}
    aria-label="新建对话"
    className="w-full h-10 flex items-center gap-3 px-3 rounded-md text-sm text-white hover:bg-white/10 transition-colors"
  >
    <NewChatIcon className="w-[18px] h-[18px]" />
    <span>新建对话</span>
  </button>
</div>
```

#### 1.4 内容区与底部分隔

- 内容区保持 `flex-1 overflow-y-auto`，用于渲染 `HistoryList`
- 底部新增一个预留区域（footer），高度约 48px，带顶部边框
- 该区域当前可为空，为后续“设置 / 关于 / 退出管理员”等功能预留位置

#### 1.5 收起状态按钮

- 保留左上角的悬浮切换按钮
- 使用 `LogoIcon` 组件作为按钮图标，与侧边栏顶部品牌标识保持一致
- 按钮尺寸 36×36，hover 背景 `bg-white/10`，圆角 `rounded-md`
- aria-label 设置为“展开侧边栏”

### TDD 测试用例

**测试文件**：`src/components/Sidebar.test.tsx`

#### 测试 1.1：侧边栏展开时显示品牌标识

- 渲染 `<Sidebar isOpen={true} ... />`
- 验证 `LogicRefiner` 文本存在
- 验证存在 aria-label="LogicRefiner" 的按钮（品牌图标按钮）

#### 测试 1.2：点击品牌图标触发新建聊天

- 渲染并传入 mock 的 `onNewChat`
- 点击品牌图标（`logic_refiner.svg`）
- 验证 `onNewChat` 被调用 1 次

#### 测试 1.3：点击新建对话按钮触发新建聊天

- 渲染并传入 mock 的 `onNewChat`
- 点击“新建对话”按钮区
- 验证 `onNewChat` 被调用 1 次

#### 测试 1.4：点击关闭边栏图标触发收起

- 渲染并传入 mock 的 `onToggle`
- 点击 `close_side.svg` 按钮
- 验证 `onToggle` 被调用 1 次

#### 测试 1.5：侧边栏收起时显示悬浮切换按钮

- 渲染 `<Sidebar isOpen={false} ... />`
- 验证存在用于打开侧边栏的按钮

### 验收标准

- [x] `Sidebar.tsx` 不再使用 `Plus`、`ChevronsLeft`、`Menu` 等 lucide 图标
- [x] `Sidebar.tsx` 从 `src/assets/` 引入 `LogoIcon`、`NewChatIcon`、`CloseSideIcon` 组件
- [x] 侧边栏顶部同时展示品牌 Logo / `LogicRefiner` 文字、关闭边栏按钮
- [x] 品牌图标（`LogoIcon`）点击行为与“新建对话”一致
- [x] 顶部 Header 高度约为下方“新建对话”按钮区高度的 1.8 倍
- [x] 顶部 Header 下方存在“新建对话”按钮区，使用 `NewChatIcon` 组件
- [x] 点击“新建对话”按钮触发 `onNewChat`
- [x] 点击关闭边栏按钮触发 `onToggle`
- [x] 侧边栏收起时存在可点击的展开按钮（使用 `LogoIcon`）
- [x] 所有新增测试用例通过

***

## 任务 2：App.tsx 主布局适配

**目标**：调整 `App.tsx` 中 Header 和 Main 区域与新版侧边栏的协作关系，避免视觉冲突。

### 设计

#### 2.1 Header 左侧留白调整

当前 Header 左上角有一个 `Menu` 按钮用于打开侧边栏。改造后：

- 侧边栏收起时，悬浮按钮位于 `top-4 left-4`
- 为避免 Header 标题与按钮重叠，当侧边栏收起时，Header 左侧需要留出约 48px 的 padding 或让标题整体右移
- 当侧边栏展开时（桌面端），主内容区域已经通过 `marginLeft` 右移，无需额外处理

具体实现：

```tsx
<header className={cn(
  "flex flex-col md:flex-row justify-between items-end border-b border-white/30 pb-4 mb-12 transition-all",
  !sidebarOpen && "pl-12 md:pl-0"
)}>
```

#### 2.2 主内容区过渡保持

保持现有 `transition-[margin-left] duration-200`，并将展开时的偏移量与固定宽度的侧边栏对齐（260px）：

```tsx
<main
  className="relative max-w-[1200px] mx-auto px-6 py-12 transition-[margin-left] duration-200"
  style={{ marginLeft: sidebarOpen ? '260px' : '0px' }}
>
```

#### 2.3 移动端抽屉交互

- 移动端侧边栏宽度保持 `w-[85vw]`
- 打开时显示黑色半透明遮罩，点击遮罩关闭
- 收起时隐藏侧边栏，仅显示左上角悬浮按钮

### TDD 测试用例

**测试文件**：`src/App.test.tsx`（追加）

#### 测试 2.1：侧边栏收起时显示展开按钮

- 渲染 `<App />`
- 默认侧边栏为关闭状态
- 验证存在 aria-label="展开侧边栏" 的按钮

#### 测试 2.2：点击悬浮按钮展开侧边栏

- 渲染 `<App />`
- 点击左上角展开按钮
- 验证侧边栏进入展开状态（可通过 `aria-expanded` 或特定 class 判断）

#### 测试 2.3：点击遮罩关闭侧边栏（移动端）

- 渲染 `<App />`
- 先展开侧边栏
- 点击遮罩层
- 验证侧边栏关闭

### 验收标准

- [x] 侧边栏收起时，左上角显示可点击的展开按钮
- [x] 侧边栏收起时，主标题不与悬浮按钮重叠
- [x] 主内容区在展开/收起时平滑过渡
- [x] 移动端抽屉交互正常（遮罩点击关闭）
- [x] 原有"新建聊天"逻辑（清空输入、滚动顶部、聚焦输入框）无回归
- [x] 所有新增测试用例通过

***

## 任务 3：响应式与动画交互打磨

**目标**：确保新版侧边栏在桌面端和移动端都有一致的视觉体验与流畅动画。

### 设计

#### 3.1 侧边栏宽度策略

- 桌面端：固定 `260px`（不再使用 `20vw`，避免不同屏幕下历史记录宽度差异过大）
- 移动端：抽屉宽度 `85vw`，最大 `320px`
- 主内容区 margin-left 同步改为 `260px`

#### 3.2 图标 hover 与 active 状态

- 所有图标按钮统一为 `w-9 h-9 flex items-center justify-center rounded-md text-zinc-400 hover:text-white hover:bg-white/10 transition-colors`
- active 状态 `scale-95`

#### 3.3 展开/收起动画

当前实现通过改变 `width`（`w-[85vw] md:w-[20vw]` 与 `w-0`）控制显示/隐藏，在部分浏览器中宽度动画不够流畅。改造后：

- 侧边栏容器保持固定宽度（桌面 260px / 移动端 85vw）
- 使用 `transform: translateX(-100%)` 将其移出视口，展开时 `translate-x-0`
- 保留 `duration-200 ease-in-out`
- 主内容区 margin-left 动画同步

```tsx
<aside
  className={cn(
    "fixed left-0 top-0 h-full bg-zinc-900 border-r border-white/10 z-40 transition-transform duration-200 ease-in-out",
    isOpen ? "translate-x-0" : "-translate-x-full",
    "w-[85vw] max-w-[320px] md:w-[260px] md:max-w-none"
  )}
>
```

#### 3.4 悬浮展开按钮动画

- 按钮出现/消失时使用 `opacity` 和 `scale` 微动画
- 使用 `transition-all duration-150` 实现 opacity 与 transform 的过渡
- 进入时 opacity 0 → 1，scale 0.95 → 1
- 离开时 opacity 1 → 0，scale 1 → 0.95
- 不依赖 `tailwindcss-animate`，保持项目依赖最小化

### TDD 测试用例

**测试文件**：`src/components/Sidebar.test.tsx`

#### 测试 3.1：桌面端侧边栏宽度固定为 260px

- 渲染 `<Sidebar isOpen={true} ... />`
- 验证 aside 元素包含 `md:w-[260px]` 类（或对应稳定标识）

#### 测试 3.2：移动端侧边栏最大宽度为 320px

- 验证 aside 元素包含 `max-w-[320px]` 类（或对应稳定标识）

#### 测试 3.3：展开/收起状态通过 transform 实现

- 渲染 `<Sidebar isOpen={true} ... />`，验证包含 `translate-x-0`
- 渲染 `<Sidebar isOpen={false} ... />`，验证包含 `-translate-x-full`

### 验收标准

- [x] 桌面端侧边栏宽度固定 260px，不再随视口变化
- [x] 移动端侧边栏宽度 85vw 且最大 320px
- [x] 展开/收起动画流畅，使用 transform 而非 width
- [x] 所有图标按钮 hover/active 状态一致
- [x] 所有新增测试用例通过

***

## 任务 4：TDD 测试覆盖与回归验证

**目标**：为侧边栏改造编写完整测试，并确保不破坏现有功能。

### 设计

#### 4.1 测试范围

- `Sidebar.test.tsx`：单元测试 Sidebar 组件的渲染、事件、状态
- `App.test.tsx`：集成测试主布局与侧边栏的交互

#### 4.2 回归测试清单

- 历史记录列表仍可正常渲染
- 选择历史记录后主内容区更新
- 管理员登录弹窗不受侧边栏改造影响
- 版本号连续点击 5 次仍可触发管理员登录

### TDD 测试用例

#### 测试 4.1：侧边栏改造后历史记录列表仍正常渲染

- 渲染 `<App />`
- 展开侧边栏
- 等待历史记录列表渲染（mock API）
- 验证列表项存在

#### 测试 4.2：选择历史记录后主内容区展示详情

- 渲染 `<App />` 并 mock 历史记录数据
- 展开侧边栏并点击某条记录
- 验证主内容区出现该记录的输入文本

#### 测试 4.3：管理员入口不受改造影响

- 渲染 `<App />`
- 连续点击版本号 5 次
- 验证管理员登录弹窗出现

### 验收标准

- [x] `Sidebar.test.tsx` 新增测试全部通过
- [x] `App.test.tsx` 新增与回归测试全部通过
- [x] 历史记录列表渲染与选择逻辑无回归
- [x] 管理员入口交互无回归
- [x] `npm run test` 全量通过（HistoryList 的 4 个失败为改动前已有问题）

***

## 整体验收标准

- [x] 三个 SVG 图标已迁移为 `src/assets/` 下的 React 组件，使用 `currentColor`
- [x] `public/` 下不再存在 `logic_refiner.svg`、`new_chat.svg`、`close_side.svg`
- [x] 侧边栏顶部展示 `LogoIcon` + “LogicRefiner” 品牌标识，右侧为 `CloseSideIcon` 关闭按钮
- [x] 点击品牌图标（`LogoIcon`）与点击“新建对话”按钮效果一致
- [x] 顶部 Header 高度约为下方“新建对话”按钮区高度的 1.8 倍
- [x] 顶部 Header 下方展示“新建对话”按钮，使用 `NewChatIcon` 组件，点击可新建聊天
- [x] 关闭边栏使用 `CloseSideIcon` 组件，点击可收起侧边栏
- [x] 侧边栏收起后存在悬浮按钮（使用 `LogoIcon`）可重新展开
- [x] 桌面端侧边栏宽度固定 260px，移动端抽屉宽度合理
- [x] 展开/收起动画流畅
- [x] 主内容区与侧边栏不重叠、过渡自然
- [x] 历史记录列表、管理员入口等既有功能无回归
- [x] 所有 TDD 测试用例通过
- [x] `npm run lint` 与 `npm run test` 全部通过（HistoryList 的 4 个失败为改动前已有问题）

