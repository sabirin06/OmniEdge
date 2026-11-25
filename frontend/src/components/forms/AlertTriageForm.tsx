import { requestError } from '../../api/errors';
import React, { useState } from 'react';
import { FormDialog } from '../ui/FormDialog';
import { useToast } from '../ui/Toast';
import { alertsApi } from '../../api/alerts';
import type { Alert, Severity } from '../../types';

const SEVERITIES: Severity[] = ['critical','high','medium','low','info'];

interface TriageProps { open: boolean; alert: Alert | null; onClose: () => void; onSaved: () => void; }
interface DismissProps { open: boolean; alert: Alert | null; onClose: () => void; onSaved: () => void; }

export function AlertTriageForm({ open, alert, onClose, onSaved }: TriageProps) {
  const toast = useToast();
  const [severity, setSeverity] = useState<Severity>('medium');
  const [notes, setNotes]       = useState('');
  const [loading, setLoading]   = useState(false);

  React.useEffect(() => {
    if (open && alert) { setSeverity(alert.severity); setNotes(alert.triage_notes ?? ''); }
  }, [open, alert]);

  const handleSubmit = async () => {
    if (!alert) return;
    setLoading(true);
    try {
      await alertsApi.triage(alert.id, { severity, triage_notes: notes });
      toast('success', 'Alert triaged');
      onSaved(); onClose();
    } catch (error) { toast('error', requestError(error, 'Could not save the alert review.')); }
    finally { setLoading(false); }
  };

  return (
    <FormDialog open={open} title="Triage Alert" onClose={onClose} onSubmit={handleSubmit} submitLoading={loading} submitLabel="Triage">
      <div className="form-group">
        <label>Severity</label>
        <select value={severity} onChange={e => setSeverity(e.target.value as Severity)}>
          {SEVERITIES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>)}
        </select>
      </div>
      <div className="form-group">
        <label>Notes</label>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={4} placeholder="Investigation notes…" />
      </div>
    </FormDialog>
  );
}

export function AlertDismissForm({ open, alert, onClose, onSaved }: DismissProps) {
  const toast = useToast();
  const [reason, setReason]   = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  React.useEffect(() => { if (open) { setReason(''); setError(''); } }, [open]);

  const handleSubmit = async () => {
    if (!reason.trim()) { setError('Dismiss reason is required'); return; }
    if (!alert) return;
    setLoading(true);
    try {
      await alertsApi.dismiss(alert.id, { dismiss_reason: reason });
      toast('success', 'Alert dismissed');
      onSaved(); onClose();
    } catch (error) { toast('error', requestError(error, 'Could not dismiss the alert.')); }
    finally { setLoading(false); }
  };

  return (
    <FormDialog open={open} title="Dismiss Alert" onClose={onClose} onSubmit={handleSubmit} submitLoading={loading} submitLabel="Dismiss">
      <div className="form-group">
        <label>Reason</label>
        <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3} placeholder="Why is this alert being dismissed?" />
        {error && <div className="form-error">{error}</div>}
      </div>
    </FormDialog>
  );
}
