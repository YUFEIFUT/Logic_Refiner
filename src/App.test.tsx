import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';

// Mock fetch for API calls
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('History Feature', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fetch and display history on mount', async () => {
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
        input: '知识就是力量',
        finalLogic: '知识是认知优势的积累',
        explanation: null,
        stages: '[]',
        cycles: 1,
        created_at: '2024-01-02T00:00:00.000Z',
      },
    ];

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockHistory),
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('努力就会成功')).toBeInTheDocument();
      expect(screen.getByText('知识就是力量')).toBeInTheDocument();
    });
  });

  it('should display empty state when no history', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([]),
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('等待信号输入')).toBeInTheDocument();
    });
  });

  it('should show history section when records exist', async () => {
    const mockHistory = [
      {
        id: 1,
        input: '测试观点',
        finalLogic: '测试结论',
        explanation: null,
        stages: '[]',
        cycles: 1,
        created_at: '2024-01-01T00:00:00.000Z',
      },
    ];

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockHistory),
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('历史记录')).toBeInTheDocument();
    });
  });
});
