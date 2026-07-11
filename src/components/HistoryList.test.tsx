import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import HistoryList from './HistoryList';

const mockHistory = [
  {
    id: 1,
    input: '努力就会成功',
    finalLogic: '成功是多变量函数',
    explanation: '解读内容',
    stages: '[]',
    cycles: 2,
    session_id: 'test-session',
    created_at: '2024-01-01T00:00:00.000Z',
  },
];

describe('HistoryList Delete Feature', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockHistory),
    });
  });

  it('should show delete button on hover', async () => {
    const user = userEvent.setup();
    render(<HistoryList onSelect={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText('努力就会成功')).toBeInTheDocument();
    });

    const recordItem = screen.getByText('努力就会成功').closest('button')!;
    await user.hover(recordItem);

    expect(screen.getByLabelText('删除记录')).toBeInTheDocument();
  });

  it('should show confirmation dialog when delete is clicked', async () => {
    const user = userEvent.setup();
    render(<HistoryList onSelect={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText('努力就会成功')).toBeInTheDocument();
    });

    const recordItem = screen.getByText('努力就会成功').closest('button')!;
    await user.hover(recordItem);
    await user.click(screen.getByLabelText('删除记录'));

    expect(screen.getByText('删除历史记录')).toBeInTheDocument();
    expect(screen.getByText('取消')).toBeInTheDocument();
  });

  it('should cancel delete when cancel is clicked', async () => {
    const user = userEvent.setup();
    render(<HistoryList onSelect={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText('努力就会成功')).toBeInTheDocument();
    });

    const recordItem = screen.getByText('努力就会成功').closest('button')!;
    await user.hover(recordItem);
    await user.click(screen.getByLabelText('删除记录'));
    await user.click(screen.getByText('取消'));

    expect(screen.queryByText('删除历史记录')).not.toBeInTheDocument();
  });

  it('should delete record when confirm is clicked', async () => {
    const user = userEvent.setup();
    global.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockHistory),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([]),
      });

    render(<HistoryList onSelect={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText('努力就会成功')).toBeInTheDocument();
    });

    const recordItem = screen.getByText('努力就会成功').closest('button')!;
    await user.hover(recordItem);
    await user.click(screen.getByLabelText('删除记录'));
    await user.click(screen.getByText('删除'));

    await waitFor(() => {
      expect(screen.queryByText('努力就会成功')).not.toBeInTheDocument();
    });
  });
});
