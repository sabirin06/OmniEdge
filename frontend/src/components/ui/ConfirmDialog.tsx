import React, { useEffect } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { Button } from './Button';

interface ConfirmDialogProps {
  open: boolean;
  title?: string;
  message: string;
  confirmLabel?: string;
  confirmVariant?: 'primary' | 'danger';
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open, title = 'Confirm', message, confirmLabel = 'Confirm',
  confirmVariant = 'danger', loading, onConfirm, onCancel,
}: ConfirmDialogProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    if (open) document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div className="dialog-overlay" onClick={e => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="dialog" style={{ maxWidth: 420 }}>
        <div className="dialog-header">
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertTriangle size={18} color="var(--color-warning)" />
            <span className="dialog-title">{title}</span>
          </span>
          <button className="btn btn-ghost btn-icon" onClick={onCancel}><X size={16} /></button>
        </div>
        <div className="dialog-body">
          <p style={{ color: 'var(--color-text-secondary)', fontSize: 14 }}>{message}</p>
        </div>
        <div className="dialog-footer">
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button variant={confirmVariant} loading={loading} onClick={onConfirm}>{confirmLabel}</Button>
        </div>
      </div>
    </div>
  );
}
