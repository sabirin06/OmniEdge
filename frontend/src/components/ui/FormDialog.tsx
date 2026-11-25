import React, { useEffect, useId, useRef } from 'react';
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
  const titleId = useId();
  const formId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const isVisible = open ?? isOpen ?? false;

  useEffect(() => {
    if (!isVisible || !dialogRef.current) return;
    const dialog = dialogRef.current;
    const previous = document.activeElement;
    const focusable = () => [...dialog.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]',
    )].filter(element => element.tabIndex >= 0 && element.getClientRects().length);
    if (!dialog.contains(document.activeElement)) {
      (focusable().find(element => element.matches('input, select, textarea')) ?? focusable()[0] ?? dialog).focus();
    }

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeRef.current();
      }
      if (event.key !== 'Tab') return;
      const controls = focusable();
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (!first || !last) { event.preventDefault(); return; }
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !dialog.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('keydown', handleKey);
      if (previous instanceof HTMLElement && previous.isConnected && !dialog.contains(previous)) previous.focus();
    };
  }, [isVisible]);

  if (!isVisible) return null;

  const maxWidth = size === 'sm' ? 400 : size === 'lg' ? 720 : 560;

  return (
    <div className="dialog-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="dialog" ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={titleId} style={{ maxWidth }}>
        <div className="dialog-header">
          <span className="dialog-title" id={titleId}>{title}</span>
          <button type="button" aria-label="Close dialog" className="btn btn-ghost btn-icon" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="dialog-body">
          {onSubmit ? (
            <form id={formId} onSubmit={e => { e.preventDefault(); onSubmit(); }}>
              {children}
            </form>
          ) : (
            children
          )}
        </div>
        {onSubmit && (
          <div className="dialog-footer">
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" form={formId} variant="primary" loading={submitLoading}>{submitLabel}</Button>
          </div>
        )}
      </div>
    </div>
  );
}
