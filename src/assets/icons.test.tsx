import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { LogoIcon, NewChatIcon, CloseSideIcon } from './icons';

describe('LogoIcon', () => {
  it('should render as an svg element', () => {
    const { container } = render(<LogoIcon />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('should use currentColor for stroke', () => {
    const { container } = render(<LogoIcon />);
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('stroke')).toBe('currentColor');
  });

  it('should pass className to svg', () => {
    const { container } = render(<LogoIcon className="w-6 h-6" />);
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('class')).toContain('w-6');
    expect(svg.getAttribute('class')).toContain('h-6');
  });
});

describe('NewChatIcon', () => {
  it('should render as an svg element', () => {
    const { container } = render(<NewChatIcon />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('should use currentColor for fill', () => {
    const { container } = render(<NewChatIcon />);
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('fill')).toBe('currentColor');
  });

  it('should pass className to svg', () => {
    const { container } = render(<NewChatIcon className="w-[18px] h-[18px]" />);
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('class')).toContain('w-[18px]');
    expect(svg.getAttribute('class')).toContain('h-[18px]');
  });
});

describe('CloseSideIcon', () => {
  it('should render as an svg element', () => {
    const { container } = render(<CloseSideIcon />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('should use currentColor for fill', () => {
    const { container } = render(<CloseSideIcon />);
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('fill')).toBe('currentColor');
  });

  it('should pass className to svg', () => {
    const { container } = render(<CloseSideIcon className="w-[18px] h-[18px]" />);
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('class')).toContain('w-[18px]');
    expect(svg.getAttribute('class')).toContain('h-[18px]');
  });
});
