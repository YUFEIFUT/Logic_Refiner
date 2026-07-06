import React, { useEffect, useState } from 'react';
import { History, Trash2 } from 'lucide-react';
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
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

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
            onClick={() => onSelect(record)}
            className={`w-full text-left px-3 py-3 border-b border-white/5 transition-colors hover:bg-white/5 ${
              selectedId === record.id ? 'bg-white/10 border-l-2 border-l-white' : ''
            }`}
          >
            <div className="text-xs text-white truncate mb-1 pr-6">
              {record.input}
            </div>
            <div className="flex items-center gap-2 text-[9px] text-zinc-500">
              <span>{new Date(record.created_at).toLocaleDateString('zh-CN')}</span>
              <span>·</span>
              <span>{record.cycles} 轮</span>
            </div>
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setDeleteConfirmId(record.id);
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-zinc-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
            aria-label="删除记录"
          >
            <Trash2 className="w-3 h-3" />
          </button>
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
    </div>
  );
}
