import React from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { LogoIcon, NewChatIcon, CloseSideIcon } from '../assets/icons';

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
          aria-label="展开侧边栏"
          aria-expanded={isOpen}
        >
          <LogoIcon className="w-5 h-5" />
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
          "fixed left-0 top-0 h-full bg-black border-r border-white/10 z-40 transition-transform duration-200 ease-in-out",
          "w-[85vw] max-w-[320px] md:w-[260px] md:max-w-none",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="w-[85vw] max-w-[320px] md:w-[260px] md:max-w-none h-full flex flex-col">
          {/* Header - Brand + Close */}
          <header className="flex items-center justify-between px-3 h-[72px] border-b border-white/10">
            <div className="flex items-center gap-2 text-white">
              <button
                onClick={onNewChat}
                aria-label="LogicRefiner"
                className="w-9 h-9 flex items-center justify-center rounded-md hover:bg-white/10 transition-colors active:scale-95"
              >
                <LogoIcon className="w-6 h-6" />
              </button>
              <span className="text-sm font-medium">LogicRefiner</span>
            </div>
            <button
              onClick={onToggle}
              aria-label="关闭边栏"
              className="w-9 h-9 flex items-center justify-center rounded-md text-zinc-400 hover:text-white hover:bg-white/10 transition-colors active:scale-95"
            >
              <CloseSideIcon className="w-[18px] h-[18px]" />
            </button>
          </header>

          {/* New Chat Button */}
          <div className="px-3 py-2 border-b border-white/10">
            <button
              onClick={onNewChat}
              aria-label="新建对话"
              className="w-full h-10 flex items-center gap-3 px-3 rounded-md text-sm text-white hover:bg-white/10 transition-colors"
            >
              <NewChatIcon className="w-[18px] h-[18px]" />
              <span>新建对话</span>
            </button>
          </div>

          {/* Content Area - scrollable */}
          <div className="flex-1 overflow-y-auto scrollbar-hover">
            {children}
          </div>

          {/* Footer - reserved for future use */}
          <footer className="h-12 border-t border-white/10" />
        </div>
      </aside>
    </>
  );
}
