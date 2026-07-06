import React from 'react';
import { Menu, Plus, ChevronsLeft } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  onNewChat?: () => void;
  children?: React.ReactNode;
}

export default function Sidebar({ isOpen, onToggle, onNewChat, children }: SidebarProps) {
  return (
    <>
      {/* Toggle Button - only show when sidebar is closed */}
      {!isOpen && (
        <button
          onClick={onToggle}
          className="fixed top-4 left-4 z-50 p-2 text-zinc-400 hover:text-white transition-colors"
          aria-label="Toggle sidebar"
          aria-expanded={isOpen}
        >
          <Menu className="w-5 h-5" />
        </button>
      )}

      {/* Backdrop overlay - only on mobile when open */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 md:hidden"
          onClick={onToggle}
          aria-hidden="true"
        />
      )}

      {/* Sidebar Panel */}
      <aside
        role="complementary"
        className={cn(
          "fixed left-0 top-0 h-full bg-zinc-900/30 md:bg-zinc-900 border-r border-white/10 overflow-hidden z-40 transition-all duration-200 backdrop-blur-sm md:backdrop-blur-none",
          isOpen ? "w-[85vw] md:w-[20vw]" : "w-0"
        )}
      >
        <div className="w-[85vw] md:w-[20vw] h-full flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-3 border-b border-white/10">
            <button
              onClick={onNewChat}
              className="flex items-center gap-2 px-3 py-2 text-xs text-zinc-400 hover:text-white hover:bg-white/10 rounded transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>新建对话</span>
            </button>
            <button
              onClick={onToggle}
              className="p-2 text-zinc-400 hover:text-white hover:bg-white/10 rounded transition-colors"
              aria-label="收起侧边栏"
            >
              <ChevronsLeft className="w-4 h-4" />
            </button>
          </div>

          {/* Content Area - scrollable */}
          <div className="flex-1 overflow-y-auto scrollbar-hover">
            {children}
          </div>
        </div>
      </aside>
    </>
  );
}
