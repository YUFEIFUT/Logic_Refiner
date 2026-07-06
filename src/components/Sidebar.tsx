import React from 'react';
import { Menu, X } from 'lucide-react';

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  children?: React.ReactNode;
}

export default function Sidebar({ isOpen, onToggle, children }: SidebarProps) {
  return (
    <>
      {/* Toggle Button */}
      <button
        onClick={onToggle}
        className="fixed top-4 left-4 z-50 p-2 text-zinc-400 hover:text-white transition-colors"
        aria-label="Toggle sidebar"
      >
        {isOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>

      {/* Sidebar Panel */}
      <aside
        role="complementary"
        className="fixed left-0 top-0 h-full bg-zinc-900 border-r border-white/10 overflow-hidden z-40"
        style={{
          width: isOpen ? '20vw' : '0px',
          transition: 'width 200ms ease',
        }}
      >
        <div className="w-[20vw] h-full flex flex-col pt-14">
          {children}
        </div>
      </aside>
    </>
  );
}
