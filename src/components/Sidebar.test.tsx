import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Sidebar from './Sidebar';

describe('Sidebar Content Layout', () => {
  it('should render new chat button with + icon', () => {
    render(<Sidebar isOpen={true} onToggle={() => {}} />);
    expect(screen.getByText('新建对话')).toBeInTheDocument();
  });

  it('should call onNewChat when new chat button is clicked', async () => {
    const user = userEvent.setup();
    const onNewChat = vi.fn();
    render(<Sidebar isOpen={true} onToggle={() => {}} onNewChat={onNewChat} />);
    
    await user.click(screen.getByText('新建对话'));
    expect(onNewChat).toHaveBeenCalledTimes(1);
  });

  it('should render close button with << icon', () => {
    render(<Sidebar isOpen={true} onToggle={() => {}} />);
    expect(screen.getByLabelText('收起侧边栏')).toBeInTheDocument();
  });

  it('should call onToggle when close button is clicked', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(<Sidebar isOpen={true} onToggle={onToggle} />);
    
    await user.click(screen.getByLabelText('收起侧边栏'));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('should render children in scrollable area', () => {
    render(
      <Sidebar isOpen={true} onToggle={() => {}}>
        <div data-testid="sidebar-content">Content</div>
      </Sidebar>
    );
    expect(screen.getByTestId('sidebar-content')).toBeInTheDocument();
  });

  it('should have dark background', () => {
    render(<Sidebar isOpen={false} onToggle={() => {}} />);
    const sidebar = screen.getByRole('complementary');
    expect(sidebar.className).toContain('bg-zinc-900');
  });
});
