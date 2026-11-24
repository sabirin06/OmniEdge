import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { Button } from './Button';

interface FormDialogProps {
  open?: boolean;
  isOpen?: boolean;
  title: string;
  onClose: () => void;
  onSubmit?: () => void;
  submitLabel?: string;
  submitLoading?: boolean;
  size?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
}

export function FormDialog({
  open, isOpen, title, onClose, onSubmit, submitLabel = 'Save', submitLoading, children, size = 'md',
}: FormDialogProps) {
  const isVisible = open ?? isOpen ?? false;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    if (isVisible) document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isVisible, onClose]);

  if (!isVisible) return null;

  const maxWidth = size === 'sm' ? 400 : size === 'lg' ? 720 : 560;

  return (
    <div className="dialog-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="dialog" style={{ maxWidth }}>
        <div className="dialog-header">
          <span className="dialog-title">{title}</span>
          <button className="btn btn-ghost btn-icon" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="dialog-body">
          {onSubmit ? (
            <form onSubmit={e => { e.preventDefault(); onSubmit(); }}>
              {children}
            </form>
          ) : (
            children
          )}
        </div>
        {onSubmit && (
          <div className="dialog-footer">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button variant="primary" loading={submitLoading} onClick={onSubmit}>{submitLabel}</Button>
          </div>
        )}
      </div>
    </div>
  );
}
