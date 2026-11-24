import React, { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Toast { id: number; type: ToastType; message: string; }

interface ToastContextValue { toast: (type: ToastType, message: string) => void; }

const ToastContext = createContext<ToastContextValue | null>(null);

const ICONS: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle size={16} color="var(--color-success)" />,
  error:   <XCircle    size={16} color="var(--color-danger)" />,
  warning: <AlertTriangle size={16} color="var(--color-warning)" />,
  info:    <Info       size={16} color="var(--color-info)" />,
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  let counter = 0;

  const toast = useCallback((type: ToastType, message: string) => {
    const id = ++counter;
    setToasts(ts => [...ts, { id, type, message }]);
    setTimeout(() => setToasts(ts => ts.filter(t => t.id !== id)), 4000);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dismiss = (id: number) => setToasts(ts => ts.filter(t => t.id !== id));

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast toast-${t.type}`}>
            {ICONS[t.type]}
            <span className="toast-message">{t.message}</span>
            <button className="toast-close" onClick={() => dismiss(t.id)}><X size={14} /></button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be inside ToastProvider');
  return ctx.toast;
}
