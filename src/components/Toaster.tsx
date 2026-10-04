'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { NOTIFY_EVENT, type NotifyDetail } from '@/lib/notify';

interface Toast extends NotifyDetail {
  id: number;
}

const TONE_STYLES = {
  error: { icon: AlertCircle, className: 'border-red-200 text-[#D14343]' },
  info: { icon: Info, className: 'border-slate-200 text-slate-700' },
  success: { icon: CheckCircle2, className: 'border-emerald-200 text-[#1F8A4C]' },
} as const;

export default function Toaster() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    let nextId = 0;
    const onNotify = (e: Event) => {
      const { message, tone } = (e as CustomEvent<NotifyDetail>).detail;
      const id = ++nextId;
      setToasts((prev) => [...prev.slice(-2), { id, message, tone }]);
      setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 5000);
    };
    window.addEventListener(NOTIFY_EVENT, onNotify);
    return () => window.removeEventListener(NOTIFY_EVENT, onNotify);
  }, []);

  return (
    <div
      aria-live="polite"
      className="fixed z-[100] bottom-4 right-4 left-4 sm:left-auto sm:w-96 flex flex-col gap-2 pointer-events-none"
    >
      {toasts.map((t) => {
        const { icon: Icon, className } = TONE_STYLES[t.tone];
        return (
          <div
            key={t.id}
            role={t.tone === 'error' ? 'alert' : 'status'}
            className={`pointer-events-auto flex items-start gap-3 bg-white border rounded-xl shadow-saas-modal px-4 py-3 text-sm ${className}`}
          >
            <Icon className="w-4 h-4 shrink-0 mt-0.5" />
            <span className="flex-1 text-slate-700">{t.message}</span>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
              className="text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
