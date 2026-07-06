import React, { useEffect } from 'react';
import { CheckCircle2, XCircle, X } from 'lucide-react';

interface ToastProps {
  message: string;
  visible: boolean;
  type?: 'success' | 'error';
  duration?: number;
  onClose?: () => void;
}

export default function Toast({ message, visible, type = 'success', duration = 3000, onClose }: ToastProps) {
  useEffect(() => {
    if (visible && onClose) {
      const timer = setTimeout(onClose, duration);
      return () => clearTimeout(timer);
    }
  }, [visible, duration, onClose]);

  if (!visible) return null;

  const icon = type === 'success' ? (
    <CheckCircle2 className="w-4 h-4" />
  ) : (
    <XCircle className="w-4 h-4" />
  );

  const bgColor = type === 'success' ? 'bg-green-600' : 'bg-red-600';

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
      <div className={`${bgColor} text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 text-sm`}>
        {icon}
        <span>{message}</span>
        {onClose && (
          <button onClick={onClose} className="ml-2 opacity-70 hover:opacity-100">
            <X className="w-3 h-3" />
          </button>
        )}
      </div>
    </div>
  );
}
