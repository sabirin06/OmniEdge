import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from './Button';

interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
}

export function ErrorState({ message = 'Something went wrong', onRetry }: ErrorStateProps) {
  return (
    <div className="error-state">
      <AlertCircle size={48} color="var(--color-danger)" />
      <div className="error-state-title">Error</div>
      <p style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" leftIcon={<RefreshCw size={14} />} onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}
