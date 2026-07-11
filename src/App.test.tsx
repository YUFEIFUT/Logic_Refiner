import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import App from './App';

// Mock fetch for API calls
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock EventSource
class MockEventSource {
  onmessage: ((event: any) => void) | null = null;
  onerror: ((event: any) => void) | null = null;
  close() {}
  constructor(public url: string) {}
}
(global as any).EventSource = MockEventSource;

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    // Default mock for fetchHistory on mount
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    });
  });

  it('should render main content', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('v1.2.5')).toBeInTheDocument();
      expect(screen.getByText('等待信号输入')).toBeInTheDocument();
    });
  });

  it('should have sidebar toggle button', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByLabelText('展开侧边栏')).toBeInTheDocument();
    });
  });
});

describe('Admin entry - version click', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should not show admin modal on single click in visitor mode', async () => {
    render(<App />);
    await waitFor(() => {
      expect(screen.getByText('v1.2.5')).toBeInTheDocument();
    });

    const versionButton = screen.getByText('v1.2.5');
    fireEvent.click(versionButton);

    expect(screen.queryByText('管理员登录')).not.toBeInTheDocument();
  });

  it('should show admin modal after 5 consecutive clicks in visitor mode', async () => {
    render(<App />);
    await waitFor(() => {
      expect(screen.getByText('v1.2.5')).toBeInTheDocument();
    });

    const versionButton = screen.getByText('v1.2.5');
    for (let i = 0; i < 5; i++) {
      fireEvent.click(versionButton);
    }

    await waitFor(() => {
      expect(screen.getByText('管理员登录')).toBeInTheDocument();
    });
  });

  it('should reset click counter after 2 seconds timeout', () => {
    vi.useFakeTimers();
    render(<App />);

    const versionButton = screen.getByText('v1.2.5');

    // Click 3 times
    for (let i = 0; i < 3; i++) {
      fireEvent.click(versionButton);
    }

    // Advance 2 seconds to trigger timeout reset
    vi.advanceTimersByTime(2001);

    // Click 2 more times (total would be 5 without reset)
    for (let i = 0; i < 2; i++) {
      fireEvent.click(versionButton);
    }

    // Should not show admin modal
    expect(screen.queryByText('管理员登录')).not.toBeInTheDocument();
  });

  it('should show logout modal on single click in admin mode', async () => {
    // Set admin token to enter admin mode
    localStorage.setItem('logicrefiner_admin_token', 'test-admin-token');
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    });

    render(<App />);
    await waitFor(() => {
      expect(screen.getByText('v1.2.5')).toBeInTheDocument();
    });

    const versionButton = screen.getByText('v1.2.5');
    fireEvent.click(versionButton);

    await waitFor(() => {
      expect(screen.getByText('退出管理员模式')).toBeInTheDocument();
    });
  });
});

describe('Admin password visibility toggle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    });
  });

  it('should default password input to hidden', async () => {
    render(<App />);
    await waitFor(() => {
      expect(screen.getByText('v1.2.5')).toBeInTheDocument();
    });

    // Click version 5 times to open admin modal
    const versionButton = screen.getByText('v1.2.5');
    for (let i = 0; i < 5; i++) {
      fireEvent.click(versionButton);
    }

    await waitFor(() => {
      expect(screen.getByText('管理员登录')).toBeInTheDocument();
    });

    const passwordInput = screen.getByPlaceholderText('输入管理员密码');
    expect(passwordInput).toHaveAttribute('type', 'password');
  });

  it('should toggle password visibility when eye icon is clicked', async () => {
    const { Eye, EyeOff } = await import('lucide-react');

    render(<App />);
    await waitFor(() => {
      expect(screen.getByText('v1.2.5')).toBeInTheDocument();
    });

    // Click version 5 times to open admin modal
    const versionButton = screen.getByText('v1.2.5');
    for (let i = 0; i < 5; i++) {
      fireEvent.click(versionButton);
    }

    await waitFor(() => {
      expect(screen.getByText('管理员登录')).toBeInTheDocument();
    });

    const passwordInput = screen.getByPlaceholderText('输入管理员密码');
    expect(passwordInput).toHaveAttribute('type', 'password');

    // Click eye toggle button
    const eyeButton = screen.getByLabelText('切换密码可见');
    fireEvent.click(eyeButton);

    expect(passwordInput).toHaveAttribute('type', 'text');

    // Click again to hide
    fireEvent.click(eyeButton);

    expect(passwordInput).toHaveAttribute('type', 'password');
  });
});
