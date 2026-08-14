import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ManualExecutionModal, { type ManualCompleteResult } from "./ManualExecutionModal";

// 剪贴板在 jsdom 中未实现，mock 以规避复制报错
Object.assign(navigator, {
  clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
});

describe("ManualExecutionModal", () => {
  it("渲染第 1 步（architect）的系统与用户提示词，并显示步骤计数", () => {
    render(<ManualExecutionModal input="努力就会成功" cycles={1} onClose={vi.fn()} onComplete={vi.fn()} />);
    expect(screen.getByText("步骤 1 / 6")).toBeTruthy();
    expect(screen.getByText("逻辑解构 (Architect)")).toBeTruthy();
    expect(screen.getByText("系统提示词 (System)")).toBeTruthy();
    expect(screen.getByText("用户提示词 (User)")).toBeTruthy();
    // 用户提示词包含输入
    expect(screen.getByText(/努力就会成功/)).toBeTruthy();
  });

  it("正文为空时提交被拦截并提示，不进入下一步", async () => {
    const onComplete = vi.fn();
    render(<ManualExecutionModal input="x" cycles={1} onClose={vi.fn()} onComplete={onComplete} />);
    await userEvent.click(screen.getByRole("button", { name: "提交下一步" }));
    expect(screen.getByText(/正文不能为空/)).toBeTruthy();
    expect(screen.getByText("步骤 1 / 6")).toBeTruthy();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("提交正文后推进到下一步（redteam）并清空输入", async () => {
    render(<ManualExecutionModal input="x" cycles={1} onClose={vi.fn()} onComplete={vi.fn()} />);
    const textarea = screen.getByPlaceholderText(/粘贴外部平台返回的正文结果/);
    await userEvent.type(textarea, "架构结果");
    await userEvent.click(screen.getByRole("button", { name: "提交下一步" }));
    expect(screen.getByText("步骤 2 / 6")).toBeTruthy();
    expect(screen.getByText("红方压力测试 #1 (Red Team)")).toBeTruthy();
    expect((screen.getByPlaceholderText(/粘贴外部平台返回的正文结果/) as HTMLTextAreaElement).value).toBe("");
  });

  it("思考过程会被写入阶段卡并随流程保存", async () => {
    const onComplete = vi.fn();
    render(<ManualExecutionModal input="x" cycles={1} onClose={vi.fn()} onComplete={onComplete} />);

    // 第 1 步：architect（产出阶段卡）
    await userEvent.type(screen.getByPlaceholderText(/正文结果/), "架构");
    await userEvent.type(screen.getByPlaceholderText(/思考链可粘贴于此/), "架构思考");
    await userEvent.click(screen.getByRole("button", { name: "提交下一步" }));

    // 逐步填完剩余 5 步（redteam/synth/boundary 产阶段卡，crystallization/explainer 写结论）
    const steps = ["红", "合", "边", "结", "解"];
    for (const s of steps) {
      await userEvent.type(screen.getByPlaceholderText(/正文结果/), s);
      const btn = screen.getByRole("button", { name: /提交下一步|完成并保存/ });
      await userEvent.click(btn);
    }

    expect(onComplete).toHaveBeenCalledTimes(1);
    const result = onComplete.mock.calls[0][0] as ManualCompleteResult;
    expect(result.finalLogic).toBe("结");
    expect(result.explanation).toBe("解");
    // 4 个阶段卡（architect/redteam/synthesizer/boundary），思考写入 architect
    expect(result.stages).toHaveLength(4);
    expect(result.stages[0].thinking).toBe("架构思考");
  });

  it("完整流程走完后调用 onComplete", async () => {
    const onComplete = vi.fn();
    render(<ManualExecutionModal input="x" cycles={1} onClose={vi.fn()} onComplete={onComplete} />);
    for (let i = 0; i < 6; i++) {
      await userEvent.type(screen.getByPlaceholderText(/正文结果/), `r${i}`);
      const btn = screen.getByRole("button", { name: /提交下一步|完成并保存/ });
      await userEvent.click(btn);
    }
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    const result = onComplete.mock.calls[0][0] as ManualCompleteResult;
    expect(result.cycles).toBe(1);
    expect(result.input).toBe("x");
  });

  it("点击关闭可取消手动流程（onClose 被调用）", async () => {
    const onClose = vi.fn();
    render(<ManualExecutionModal input="x" cycles={1} onClose={onClose} onComplete={vi.fn()} />);
    // 用标题提示匹配关闭按钮
    const closeBtn = screen.getByTitle("取消手动流程");
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("上一步可回退并重跑当前步骤", async () => {
    render(<ManualExecutionModal input="x" cycles={1} onClose={vi.fn()} onComplete={vi.fn()} />);
    // 第 1 步提交
    await userEvent.type(screen.getByPlaceholderText(/正文结果/), "架构结果");
    await userEvent.click(screen.getByRole("button", { name: "提交下一步" }));
    expect(screen.getByText("步骤 2 / 6")).toBeTruthy();

    // 回退到第 1 步
    const backBtn = screen.getByRole("button", { name: "← 上一步" });
    await userEvent.click(backBtn);
    expect(screen.getByText("步骤 1 / 6")).toBeTruthy();
    expect(screen.getByText("逻辑解构 (Architect)")).toBeTruthy();
    // 输入被清空，可重新粘贴
    expect((screen.getByPlaceholderText(/正文结果/) as HTMLTextAreaElement).value).toBe("");
  });
});