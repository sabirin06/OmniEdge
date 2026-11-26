import { LogIn } from 'lucide-react';
import { storeSupportWorkspace } from '../../api/supportWorkspace';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { platformApi } from '../../api/platform';
import { requestError } from '../../api/errors';
import { FormDialog } from './FormDialog';

export function SupportAccess({ tenant, target, label, iconOnly = false }: { tenant: number; target?: number; label: string; iconOnly?: boolean }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  async function begin() {
    if (busy) return;
    if (reason.trim().length < 10) { setError('Enter a support reason of at least 10 characters.'); return; }
    setBusy(true); setError('');
    try {
      const { data } = await platformApi.support({ tenant, target, reason: reason.trim() });
      if (target) {
        storeSupportWorkspace({ ...data, label });
        window.location.assign('/dashboard');
        return;
      }
      setOpen(false);
      navigate('/platform/support');
    } catch (err) { setError(requestError(err, 'Could not start support access.')); }
    finally { setBusy(false); }
  }
  const title = target ? 'Login as User' : 'Support Access';
  return <>
    <button type="button" className={`btn btn-ghost ${iconOnly ? 'btn-icon' : 'btn-sm'}`} title={title} aria-label={title}
      onClick={() => { setReason(''); setError(''); setOpen(true); }}>{iconOnly ? <LogIn size={17} aria-hidden="true" /> : title}</button>
    <FormDialog open={open} title={`Read-only support for ${label}`} onClose={() => { if (!busy) setOpen(false); }}
      onSubmit={begin} submitLoading={busy} submitLabel="Start support session">
      <p className="form-hint">The session expires automatically, appears to the customer, and is recorded in the audit log.</p>
      <div className="form-group"><label htmlFor="support-reason">Support reason</label>
        <textarea id="support-reason" maxLength={500} value={reason} onChange={e => setReason(e.target.value)} /></div>
      {error && <p className="form-error" role="alert">{error}</p>}
    </FormDialog>
  </>;
}
