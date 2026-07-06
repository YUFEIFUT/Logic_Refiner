import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import App from './App';

// Mock fetch for API calls
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock for fetchHistory on mount
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    });
  });

  it('should render main content', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('LogicRefiner')).toBeInTheDocument();
      expect(screen.getByText('等待信号输入')).toBeInTheDocument();
    });
  });

  it('should have sidebar toggle button', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByLabelText('Toggle sidebar')).toBeInTheDocument();
    });
  });
});
