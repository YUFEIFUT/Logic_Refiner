import React, { useEffect, useState } from 'react';
import { History } from 'lucide-react';

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
}

export default function HistoryList({ onSelect, selectedId, refreshKey }: HistoryListProps) {
  const [records, setRecords] = useState<HistoryRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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
  }, [refreshKey]);

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
        <button
          key={record.id}
          onClick={() => onSelect(record)}
          className={`w-full text-left px-3 py-3 border-b border-white/5 transition-colors hover:bg-white/5 ${
            selectedId === record.id ? 'bg-white/10 border-l-2 border-l-white' : ''
          }`}
        >
          <div className="text-xs text-white truncate mb-1">
            {record.input}
          </div>
          <div className="flex items-center gap-2 text-[9px] text-zinc-500">
            <span>{new Date(record.created_at).toLocaleDateString('zh-CN')}</span>
            <span>·</span>
            <span>{record.cycles} 轮</span>
          </div>
        </button>
      ))}
    </div>
  );
}
