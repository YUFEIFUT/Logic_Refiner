import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Sidebar from './Sidebar';

describe('Sidebar', () => {
  it('should display brand logo and LogicRefiner text when open', () => {
    render(<Sidebar isOpen={true} onToggle={() => {}} onNewChat={() => {}} />);
    expect(screen.getByText('LogicRefiner')).toBeInTheDocument();
    expect(screen.getByLabelText('LogicRefiner')).toBeInTheDocument();
  });

  it('should call onNewChat when brand logo is clicked', async () => {
    const user = userEvent.setup();
    const onNewChat = vi.fn();
    render(<Sidebar isOpen={true} onToggle={() => {}} onNewChat={onNewChat} />);

    await user.click(screen.getByLabelText('LogicRefiner'));
    expect(onNewChat).toHaveBeenCalledTimes(1);
  });

  it('should call onNewChat when new chat button is clicked', async () => {
    const user = userEvent.setup();
    const onNewChat = vi.fn();
    render(<Sidebar isOpen={true} onToggle={() => {}} onNewChat={onNewChat} />);

    await user.click(screen.getByLabelText('新建对话'));
    expect(onNewChat).toHaveBeenCalledTimes(1);
  });

  it('should call onToggle when close sidebar button is clicked', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(<Sidebar isOpen={true} onToggle={onToggle} onNewChat={() => {}} />);

    await user.click(screen.getByLabelText('关闭边栏'));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('should show expand button when sidebar is closed', () => {
    render(<Sidebar isOpen={false} onToggle={() => {}} onNewChat={() => {}} />);
    expect(screen.getByLabelText('展开侧边栏')).toBeInTheDocument();
  });

  it('should have overlay backdrop when open', () => {
    render(<Sidebar isOpen={true} onToggle={() => {}} onNewChat={() => {}} />);
    const backdrop = screen.getByRole('complementary').previousElementSibling;
    expect(backdrop).toHaveClass('bg-black/50');
  });

  it('should call onToggle when backdrop is clicked', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(<Sidebar isOpen={true} onToggle={onToggle} onNewChat={() => {}} />);

    const backdrop = screen.getByRole('complementary').previousElementSibling as HTMLElement;
    await user.click(backdrop);

    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});

describe('Sidebar Responsive & Animation', () => {
  it('should have fixed 260px width on desktop', () => {
    render(<Sidebar isOpen={true} onToggle={() => {}} onNewChat={() => {}} />);
    const aside = screen.getByRole('complementary');
    expect(aside.className).toContain('md:w-[260px]');
  });

  it('should have max 320px width on mobile', () => {
    render(<Sidebar isOpen={true} onToggle={() => {}} onNewChat={() => {}} />);
    const aside = screen.getByRole('complementary');
    expect(aside.className).toContain('max-w-[320px]');
  });

  it('should use translate-x-0 when open', () => {
    render(<Sidebar isOpen={true} onToggle={() => {}} onNewChat={() => {}} />);
    const aside = screen.getByRole('complementary');
    expect(aside.className).toContain('translate-x-0');
  });

  it('should use -translate-x-full when closed', () => {
    render(<Sidebar isOpen={false} onToggle={() => {}} onNewChat={() => {}} />);
    const aside = screen.getByRole('complementary');
    expect(aside.className).toContain('-translate-x-full');
  });
});
