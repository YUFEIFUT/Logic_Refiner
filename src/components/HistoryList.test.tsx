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
    created_at: '2024-01-01T00:00:00.000Z',
  },
  {
    id: 2,
    input: '知识就是力量，知识改变命运',
    finalLogic: '知识是认知优势的积累',
    explanation: null,
    stages: '[]',
    cycles: 1,
    created_at: '2024-01-02T00:00:00.000Z',
  },
];

describe('HistoryList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fetch and display history records', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockHistory),
    });

    render(<HistoryList onSelect={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText('努力就会成功')).toBeInTheDocument();
      expect(screen.getByText('知识就是力量，知识改变命运')).toBeInTheDocument();
    });
  });

  it('should truncate long input text', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockHistory),
    });

    render(<HistoryList onSelect={() => {}} />);

    await waitFor(() => {
      const longText = screen.getByText('知识就是力量，知识改变命运');
      expect(longText.className).toContain('truncate');
    });
  });

  it('should display date for each record', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockHistory),
    });

    render(<HistoryList onSelect={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText('2024/1/1')).toBeInTheDocument();
      expect(screen.getByText('2024/1/2')).toBeInTheDocument();
    });
  });

  it('should display cycle count for each record', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockHistory),
    });

    render(<HistoryList onSelect={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText('2 轮')).toBeInTheDocument();
      expect(screen.getByText('1 轮')).toBeInTheDocument();
    });
  });

  it('should call onSelect when record is clicked', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockHistory),
    });

    render(<HistoryList onSelect={onSelect} />);

    await waitFor(() => {
      expect(screen.getByText('努力就会成功')).toBeInTheDocument();
    });

    await user.click(screen.getByText('努力就会成功'));
    expect(onSelect).toHaveBeenCalledWith(mockHistory[0]);
  });

  it('should highlight selected record', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockHistory),
    });

    render(<HistoryList onSelect={() => {}} selectedId={1} />);

    await waitFor(() => {
      const items = screen.getAllByRole('button');
      const selectedItem = items.find(item => item.textContent?.includes('努力就会成功'));
      expect(selectedItem?.className).toContain('bg-white/10');
    });
  });

  it('should show empty state when no records', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([]),
    });

    render(<HistoryList onSelect={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText('暂无历史记录')).toBeInTheDocument();
    });
  });

  it('should display records in API order (descending by date)', async () => {
    // API returns records in descending order (newest first)
    const sortedHistory = [...mockHistory].reverse();
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(sortedHistory),
    });

    render(<HistoryList onSelect={() => {}} />);

    await waitFor(() => {
      const items = screen.getAllByRole('button');
      const firstItem = items[0];
      const secondItem = items[1];
      expect(firstItem.textContent).toContain('知识就是力量');
      expect(secondItem.textContent).toContain('努力就会成功');
    });
  });
});
