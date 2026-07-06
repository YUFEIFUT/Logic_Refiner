import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import Toast from './Toast';

describe('Toast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should render message when visible', () => {
    render(<Toast message="删除成功" visible={true} />);
    expect(screen.getByText('删除成功')).toBeInTheDocument();
  });

  it('should not render when not visible', () => {
    render(<Toast message="删除成功" visible={false} />);
    expect(screen.queryByText('删除成功')).not.toBeInTheDocument();
  });

  it('should auto-hide after duration', () => {
    const onClose = vi.fn();
    render(<Toast message="删除成功" visible={true} onClose={onClose} duration={2000} />);

    expect(screen.getByText('删除成功')).toBeInTheDocument();

    vi.advanceTimersByTime(2000);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('should have success style by default', () => {
    render(<Toast message="删除成功" visible={true} />);
    const toast = screen.getByText('删除成功').closest('div')!;
    expect(toast.className).toContain('bg-green-600');
  });

  it('should have error style when type is error', () => {
    render(<Toast message="删除失败" visible={true} type="error" />);
    const toast = screen.getByText('删除失败').closest('div')!;
    expect(toast.className).toContain('bg-red-600');
  });
});
