import React, { useState, useEffect } from 'react';
import { Plus, Trash2, GripVertical } from 'lucide-react';
import { FormDialog } from '../ui/FormDialog';
import { useToast } from '../ui/Toast';
import { playbooksApi } from '../../api/playbooks';
import { useAuth } from '../../hooks/useAuth';
import type { Playbook, Severity } from '../../types';

const SEVERITIES: Severity[] = ['critical','high','medium','low','info'];

interface Props { open: boolean; playbook?: Playbook | null; onClose: () => void; onSaved: () => void; }

export function PlaybookForm({ open, playbook, onClose, onSaved }: Props) {
  const toast = useToast();
  const { user } = useAuth();
  const [name, setName]           = useState('');
  const [description, setDesc]    = useState('');
  const [severity, setSeverity]   = useState<Severity | ''>('');
  const [steps, setSteps]         = useState<{ order:number; title:string; description:string; is_automated:boolean; action_type:string }[]>([]);
  const [loading, setLoading]     = useState(false);
  const [errors, setErrors]       = useState<Record<string,string>>({});

  useEffect(() => {
    if (open) {
      setName(playbook?.name ?? '');
      setDesc(playbook?.description ?? '');
      setSeverity((playbook?.severity_trigger as Severity) ?? '');
      setSteps(playbook?.steps?.length ? [...playbook.steps] : [{ order:1, title:'', description:'', is_automated:false, action_type:'manual' }]);
      setErrors({});
    }
  }, [open, playbook]);

  const addStep = () => setSteps(s => [...s, { order:s.length+1, title:'', description:'', is_automated:false, action_type:'manual' }]);
  const removeStep = (i:number) => setSteps(s => s.filter((_,j) => j!==i).map((step,j) => ({ ...step, order:j+1 })));
  const updateStep = (i:number, key:string, value:unknown) =>
    setSteps(s => s.map((step, j) => j===i ? { ...step, [key]: value } : step));

  const validate = () => {
    const e: Record<string,string> = {};
    if (!name.trim()) e.name = 'Name required';
    steps.forEach((s, i) => { if (!s.title.trim()) e[`step_${i}`] = 'Title required'; });
    setErrors(e);
    return !Object.keys(e).length;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setLoading(true);
    try {
      const payload = { name, description, severity_trigger: severity || null, steps, tenant: user?.tenant!, is_active: true, event_type_trigger: '' };
      if (playbook) await playbooksApi.update(playbook.id, payload);
      else await playbooksApi.create(payload);
      toast('success', playbook ? 'Playbook updated' : 'Playbook created');
      onSaved(); onClose();
    } catch { toast('error', 'Failed to save playbook'); }
    finally { setLoading(false); }
  };

  return (
    <FormDialog open={open} title={playbook ? 'Edit Playbook' : 'New Playbook'} onClose={onClose} onSubmit={handleSubmit} submitLoading={loading} size="lg">
      <div className="form-group">
        <label>Name</label>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Phishing Response" />
        {errors.name && <div className="form-error">{errors.name}</div>}
      </div>
      <div className="form-row">
        <div className="form-group">
          <label>Description</label>
          <textarea value={description} onChange={e => setDesc(e.target.value)} rows={2} />
        </div>
        <div className="form-group">
          <label>Severity Trigger</label>
          <select value={severity} onChange={e => setSeverity(e.target.value as Severity)}>
            <option value="">— Any —</option>
            {SEVERITIES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>)}
          </select>
        </div>
      </div>

      <div style={{ marginBottom:8, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <label style={{ margin:0 }}>Steps</label>
        <button type="button" className="btn btn-ghost btn-sm" onClick={addStep}><Plus size={14} /> Add Step</button>
      </div>
      {steps.map((step, i) => (
        <div key={i} style={{ background:'var(--color-canvas)', border:'1px solid var(--color-border)', borderRadius:'var(--radius-sm)', padding:12, marginBottom:8 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
            <GripVertical size={14} color="var(--color-text-muted)" />
            <span style={{ fontSize:11, color:'var(--color-text-muted)', fontWeight:700 }}>STEP {i+1}</span>
            <button type="button" className="btn btn-ghost btn-icon btn-sm" style={{ marginLeft:'auto' }} onClick={() => removeStep(i)}>
              <Trash2 size={14} color="var(--color-danger)" />
            </button>
          </div>
          <div className="form-group">
            <input value={step.title} onChange={e => updateStep(i,'title',e.target.value)} placeholder="Step title" />
            {errors[`step_${i}`] && <div className="form-error">{errors[`step_${i}`]}</div>}
          </div>
          <textarea value={step.description} onChange={e => updateStep(i,'description',e.target.value)} rows={2} placeholder="Instructions…" style={{ width:'100%' }} />
          <label style={{ display:'flex', alignItems:'center', gap:8, marginTop:8, textTransform:'none' }}>
            <input type="checkbox" checked={step.is_automated} onChange={e => updateStep(i,'is_automated',e.target.checked)} style={{ width:'auto' }} />
            Automated
          </label>
        </div>
      ))}
    </FormDialog>
  );
}
