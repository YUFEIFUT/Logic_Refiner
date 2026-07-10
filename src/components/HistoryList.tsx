import React, { useEffect, useState, useRef } from 'react';
import { History, Trash2, MoreHorizontal, Pencil, Check, X } from 'lucide-react';
import Toast from './Toast';

export interface HistoryRecord {
  id: number;
  input: string;
  finalLogic: string;
  explanation: string | null;
  stages: string;
  cycles: number;
  created_at: string;
}

interface HistoryListProps {
  onSelect: (record: HistoryRecord) => void;
  selectedId?: number;
  refreshKey?: number;
  onRefresh?: () => void;
  onDelete?: (id: number) => void;
}

export default function HistoryList({ onSelect, selectedId, refreshKey, onRefresh, onDelete }: HistoryListProps) {
  const [records, setRecords] = useState<HistoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
  const truncatedIds = useRef<Set<number>>(new Set());
  const [truncatedTick, setTruncatedTick] = useState(0);
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const fetchRecords = () => {
    setLoading(true);
    fetch('/api/refinements')
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(data => {
        setRecords(data);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to fetch history:', err);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchRecords();
  }, [refreshKey]);

  useEffect(() => {
    if (menuOpenId === null) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpenId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpenId]);

  const handleStartRename = (record: HistoryRecord) => {
    setEditingId(record.id);
    setEditingValue(record.input);
    setMenuOpenId(null);
    setTimeout(() => {
      editInputRef.current?.focus();
      editInputRef.current?.select();
    }, 0);
  };

  const handleSaveRename = async (id: number) => {
    const trimmed = editingValue.trim();
    if (!trimmed) return;
    try {
      const res = await fetch(`/api/refinements/${id}/input`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: trimmed }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setEditingId(null);
      setToast({ message: '重命名成功', type: 'success' });
      // Re-fetch and sync parent if this record is selected
      const listRes = await fetch('/api/refinements');
      if (listRes.ok) {
        const data = await listRes.json();
        setRecords(data);
        if (selectedId === id) {
          const updated = data.find((r: HistoryRecord) => r.id === id);
          if (updated) onSelect(updated);
        }
      }
    } catch (err) {
      console.error('Failed to rename:', err);
      setToast({ message: '重命名失败', type: 'error' });
    }
  };

  const handleCancelRename = () => {
    setEditingId(null);
    setEditingValue('');
  };

  const handleDelete = async (id: number) => {
    try {
      const res = await fetch(`/api/refinements/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setDeleteConfirmId(null);
      fetchRecords();
      onRefresh?.();
      onDelete?.(id);
      setToast({ message: '删除成功', type: 'success' });
    } catch (err) {
      console.error('Failed to delete record:', err);
      setToast({ message: '删除失败', type: 'error' });
    }
  };

  if (loading) {
    return (
      <div className="p-4 text-center">
        <p className="text-[10px] text-zinc-600 uppercase">加载中...</p>
      </div>
    );
  }

  if (records.length === 0) {
    return (
      <div className="p-4 text-center">
        <History className="w-6 h-6 text-zinc-700 mx-auto mb-2" />
        <p className="text-[10px] text-zinc-600 uppercase">暂无历史记录</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {records.map((record) => (
        <div key={record.id} className="relative group">
          <button
            onClick={() => editingId !== record.id && onSelect(record)}
            className={`w-full text-left px-3 py-3 border-b border-white/5 transition-all duration-150 hover:bg-white/5 ${
              selectedId === record.id ? 'bg-white/10 border-l-2 border-l-white' : ''
            }`}
          >
            {editingId === record.id ? (
              <div className="flex items-center gap-1 mb-1">
                <input
                  ref={editInputRef}
                  type="text"
                  value={editingValue}
                  onChange={(e) => setEditingValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveRename(record.id);
                    if (e.key === 'Escape') handleCancelRename();
                  }}
                  className="flex-1 min-w-0 text-xs text-white bg-zinc-800 border border-white/20 rounded px-2 py-1 outline-none focus:border-white/40"
                  onClick={(e) => e.stopPropagation()}
                />
                <button
                  onClick={(e) => { e.stopPropagation(); handleSaveRename(record.id); }}
                  disabled={!editingValue.trim()}
                  className="p-1 text-green-400 hover:text-green-300 disabled:text-zinc-600 disabled:cursor-not-allowed"
                  aria-label="保存"
                >
                  <Check className="w-3 h-3" />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); handleCancelRename(); }}
                  className="p-1 text-zinc-400 hover:text-white"
                  aria-label="取消"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <div className="relative mb-1 pr-6">
                <div
                  className="text-xs text-white truncate"
                  ref={(el) => {
                    if (el) {
                      const isTruncated = el.scrollWidth > el.clientWidth;
                      const wasTruncated = truncatedIds.current.has(record.id);
                      if (isTruncated !== wasTruncated) {
                        if (isTruncated) truncatedIds.current.add(record.id);
                        else truncatedIds.current.delete(record.id);
                        setTruncatedTick(t => t + 1);
                      }
                    }
                  }}
                  onMouseEnter={(e) => {
                    if (!truncatedIds.current.has(record.id)) return;
                    const rect = e.currentTarget.getBoundingClientRect();
                    setHoveredId(record.id);
                    setHoverPos({ x: rect.left, y: rect.top });
                  }}
                  onMouseLeave={() => setHoveredId(null)}
                >
                  {record.input}
                </div>
              </div>
            )}
            <div className="flex items-center gap-2 text-[9px] text-zinc-500">
              <span>{new Date(record.created_at).toLocaleDateString('zh-CN')}</span>
              <span>·</span>
              <span>{record.cycles} 轮</span>
            </div>
          </button>
          {editingId !== record.id && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpenId(menuOpenId === record.id ? null : record.id);
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-zinc-600 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity"
              aria-label="更多操作"
            >
              <MoreHorizontal className="w-3.5 h-3.5" />
            </button>
          )}
          {menuOpenId === record.id && (
            <div
              ref={menuRef}
              className="absolute right-2 top-full mt-1 z-40 bg-zinc-800 border border-white/10 rounded-lg shadow-xl py-1 min-w-[120px]"
            >
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleStartRename(record);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-zinc-300 hover:bg-white/10 transition-colors"
              >
                <Pencil className="w-3 h-3" />
                重命名
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpenId(null);
                  setDeleteConfirmId(record.id);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-400 hover:bg-white/10 transition-colors"
              >
                <Trash2 className="w-3 h-3" />
                删除
              </button>
            </div>
          )}
        </div>
      ))}

      {/* Delete Confirmation Dialog */}
      {deleteConfirmId !== null && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
          onClick={() => setDeleteConfirmId(null)}
        >
          <div
            className="bg-zinc-900 border border-white/10 p-6 max-w-sm mx-4 shadow-2xl rounded-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center">
                <Trash2 className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <h3 className="text-sm font-medium text-white">删除历史记录</h3>
                <p className="text-xs text-zinc-400 mt-0.5">此操作不可撤销</p>
              </div>
            </div>
            <p className="text-xs text-zinc-300 mb-6 pl-[52px]">
              确定要删除「{records.find(r => r.id === deleteConfirmId)?.input.slice(0, 20)}...」吗？
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="px-4 py-2 text-xs text-zinc-400 hover:text-white border border-white/10 hover:border-white/30 rounded-lg transition-colors"
              >
                取消
              </button>
              <button
                onClick={() => handleDelete(deleteConfirmId)}
                className="px-4 py-2 text-xs bg-red-600 text-white hover:bg-red-500 rounded-lg transition-colors"
              >
                删除
              </button>
            </div>
          </div>
        </div>
      )}

      <Toast
        message={toast?.message || ''}
        visible={toast !== null}
        type={toast?.type}
        onClose={() => setToast(null)}
      />

      {hoveredId !== null && (() => {
        const record = records.find(r => r.id === hoveredId);
        if (!record) return null;
        return (
          <div
            className="fixed z-[100] px-3 py-1.5 bg-zinc-800 border border-white/10 text-xs text-white rounded-lg shadow-xl pointer-events-none max-w-xs"
            style={{ left: hoverPos.x, top: hoverPos.y - 8, transform: 'translateY(-100%)' }}
          >
            {record.input}
          </div>
        );
      })()}
    </div>
  );
}
