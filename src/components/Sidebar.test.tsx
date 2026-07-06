import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Sidebar from './Sidebar';

describe('Sidebar Responsive', () => {
  it('should render toggle button when closed', () => {
    render(<Sidebar isOpen={false} onToggle={() => {}} />);
    expect(screen.getByLabelText('Toggle sidebar')).toBeInTheDocument();
  });

  it('should render close button when open', () => {
    render(<Sidebar isOpen={true} onToggle={() => {}} />);
    expect(screen.getByLabelText('收起侧边栏')).toBeInTheDocument();
  });

  it('should have overlay backdrop when open', () => {
    render(<Sidebar isOpen={true} onToggle={() => {}} />);
    const backdrop = screen.getByRole('complementary').previousElementSibling;
    expect(backdrop).toHaveClass('bg-black/50');
  });

  it('should call onToggle when backdrop is clicked', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(<Sidebar isOpen={true} onToggle={onToggle} />);

    const backdrop = screen.getByRole('complementary').previousElementSibling as HTMLElement;
    await user.click(backdrop);

    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});
