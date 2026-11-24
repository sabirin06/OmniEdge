import React, { useState, useEffect } from 'react';
import { FormDialog } from '../ui/FormDialog';
import { useToast } from '../ui/Toast';
import { incidentsApi } from '../../api/incidents';
import { useAuth } from '../../hooks/useAuth';
import { useApi } from '../../hooks/useApi';
import { playbooksApi } from '../../api/playbooks';
import { usersApi } from '../../api/users';
import type { Incident, Severity } from '../../types';

const SEVERITIES: Severity[] = ['critical','high','medium','low','info'];
const STATUSES = ['open','investigating','resolved','closed'];

interface Props { open: boolean; incident?: Incident | null; linkedAlertId?: number; onClose: () => void; onSaved: (inc: Incident) => void; }

export function IncidentForm({ open, incident, linkedAlertId, onClose, onSaved }: Props) {
  const toast = useToast();
  const { user } = useAuth();
  const { data: playbookData } = useApi(() => playbooksApi.list({ page_size: 100 }), []);
  const { data: usersData }    = useApi(() => usersApi.list({ page_size: 100 }), []);
  const playbooks = playbookData?.results ?? [];
  const users     = usersData?.results ?? [];

  const [title, setTitle]         = useState('');
  const [description, setDesc]    = useState('');
  const [severity, setSeverity]   = useState<Severity>('medium');
  const [status, setStatus]       = useState('open');
  const [owner, setOwner]         = useState<number | ''>('');
  const [playbook, setPlaybook]   = useState<number | ''>('');
  const [loading, setLoading]     = useState(false);
  const [errors, setErrors]       = useState<Record<string,string>>({});

  useEffect(() => {
    if (open) {
      setTitle(incident?.title ?? '');
      setDesc(incident?.description ?? '');
      setSeverity((incident?.severity as Severity) ?? 'medium');
      setStatus(incident?.status ?? 'open');
      setOwner(incident?.owner ?? user?.id ?? '');
      setPlaybook(incident?.playbook ?? '');
      setErrors({});
    }
  }, [open, incident, user]);

  const validate = () => {
    const e: Record<string,string> = {};
    if (!title.trim()) e.title = 'Title required';
    setErrors(e);
    return !Object.keys(e).length;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setLoading(true);
    try {
      const payload = {
        title, description, severity, status,
        owner: owner === '' ? null : Number(owner),
        playbook: playbook === '' ? null : Number(playbook),
        tenant: user?.tenant!,
        ...(linkedAlertId ? { alerts: [linkedAlertId] } : {}),
      };
      let saved: Incident;
      if (incident) {
        const { data } = await incidentsApi.update(incident.id, payload);
        saved = data;
      } else {
        const { data } = await incidentsApi.create(payload);
        saved = data;
      }
      toast('success', incident ? 'Incident updated' : 'Incident created');
      onSaved(saved); onClose();
    } catch { toast('error', 'Failed to save incident'); }
    finally { setLoading(false); }
  };

  return (
    <FormDialog open={open} title={incident ? 'Edit Incident' : 'Create Incident'} onClose={onClose} onSubmit={handleSubmit} submitLoading={loading} size="lg">
      <div className="form-group">
        <label>Title</label>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Incident title" />
        {errors.title && <div className="form-error">{errors.title}</div>}
      </div>
      <div className="form-group">
        <label>Description</label>
        <textarea value={description} onChange={e => setDesc(e.target.value)} rows={3} placeholder="Summary of the incident…" />
      </div>
      <div className="form-row">
        <div className="form-group">
          <label>Severity</label>
          <select value={severity} onChange={e => setSeverity(e.target.value as Severity)}>
            {SEVERITIES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>Status</label>
          <select value={status} onChange={e => setStatus(e.target.value)}>
            {STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>)}
          </select>
        </div>
      </div>
      <div className="form-row">
        <div className="form-group">
          <label>Owner</label>
          <select value={owner} onChange={e => setOwner(e.target.value ? Number(e.target.value) : '')}>
            <option value="">— Unassigned —</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.full_name || u.username}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>Playbook</label>
          <select value={playbook} onChange={e => setPlaybook(e.target.value ? Number(e.target.value) : '')}>
            <option value="">— None —</option>
            {playbooks.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
      </div>
    </FormDialog>
  );
}
