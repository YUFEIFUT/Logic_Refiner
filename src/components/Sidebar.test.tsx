import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Sidebar from './Sidebar';

describe('Sidebar', () => {
  it('should render toggle button', () => {
    render(<Sidebar isOpen={false} onToggle={() => {}} />);
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('should call onToggle when toggle button is clicked', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(<Sidebar isOpen={false} onToggle={onToggle} />);

    await user.click(screen.getByRole('button'));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('should have correct width when open', () => {
    render(<Sidebar isOpen={true} onToggle={() => {}} />);
    const sidebar = screen.getByRole('complementary');
    expect(sidebar).toHaveStyle({ width: '20vw' });
  });

  it('should have zero width when closed', () => {
    render(<Sidebar isOpen={false} onToggle={() => {}} />);
    const sidebar = screen.getByRole('complementary');
    expect(sidebar).toHaveStyle({ width: '0px' });
  });

  it('should have transition animation', () => {
    render(<Sidebar isOpen={false} onToggle={() => {}} />);
    const sidebar = screen.getByRole('complementary');
    expect(sidebar).toHaveStyle({ transition: 'width 200ms ease' });
  });

  it('should be fixed position on left side', () => {
    render(<Sidebar isOpen={false} onToggle={() => {}} />);
    const sidebar = screen.getByRole('complementary');
    expect(sidebar.className).toContain('fixed');
    expect(sidebar.className).toContain('left-0');
    expect(sidebar.className).toContain('top-0');
  });

  it('should have dark background', () => {
    render(<Sidebar isOpen={false} onToggle={() => {}} />);
    const sidebar = screen.getByRole('complementary');
    expect(sidebar.className).toContain('bg-zinc-900');
  });
});
