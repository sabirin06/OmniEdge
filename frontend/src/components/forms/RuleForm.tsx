import React, { useState, useEffect } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { FormDialog } from '../ui/FormDialog';
import { useToast } from '../ui/Toast';
import { rulesApi } from '../../api/rules';
import { useAuth } from '../../hooks/useAuth';
import type { Rule, Severity, RuleCondition } from '../../types';

const SEVERITIES: Severity[] = ['critical','high','medium','low','info'];
const OPERATORS = ['eq','ne','contains','not_contains','gt','lt','gte','lte','regex'];
const EVENT_TYPES = ['login_failure','port_scan','malware_detected','data_exfiltration','brute_force','ddos','privilege_escalation','other'];

interface Props { open: boolean; rule?: Rule | null; onClose: () => void; onSaved: () => void; }

export function RuleForm({ open, rule, onClose, onSaved }: Props) {
  const toast = useToast();
  const { user } = useAuth();
  const [name, setName]           = useState('');
  const [description, setDesc]    = useState('');
  const [eventType, setEventType] = useState('login_failure');
  const [severity, setSeverity]   = useState<Severity>('medium');
  const [conditions, setConditions] = useState<Omit<RuleCondition,'id'>[]>([{ field:'', operator:'eq', value:'' }]);
  const [loading, setLoading]     = useState(false);
  const [errors, setErrors]       = useState<Record<string,string>>({});

  useEffect(() => {
    if (open) {
      setName(rule?.name ?? '');
      setDesc(rule?.description ?? '');
      setEventType(rule?.event_type ?? 'login_failure');
      setSeverity((rule?.severity as Severity) ?? 'medium');
      setConditions(rule?.conditions?.length ? rule.conditions : [{ field:'', operator:'eq', value:'' }]);
      setErrors({});
    }
  }, [open, rule]);

  const addCondition = () => setConditions(c => [...c, { field:'', operator:'eq', value:'' }]);
  const removeCondition = (i: number) => setConditions(c => c.filter((_,j) => j!==i));
  const updateCondition = (i: number, key: string, value: string) =>
    setConditions(c => c.map((cond, j) => j===i ? { ...cond, [key]: value } : cond));

  const validate = () => {
    const e: Record<string,string> = {};
    if (!name.trim()) e.name = 'Name required';
    conditions.forEach((c, i) => {
      if (!c.field) e[`cond_${i}_field`] = 'Field required';
      if (!c.value) e[`cond_${i}_value`] = 'Value required';
    });
    setErrors(e);
    return !Object.keys(e).length;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setLoading(true);
    try {
      const payload = { name, description, event_type: eventType, severity, conditions, tenant: user?.tenant!, is_active: true };
      if (rule) await rulesApi.update(rule.id, payload);
      else await rulesApi.create(payload);
      toast('success', rule ? 'Rule updated' : 'Rule created');
      onSaved(); onClose();
    } catch { toast('error', 'Failed to save rule'); }
    finally { setLoading(false); }
  };

  return (
    <FormDialog open={open} title={rule ? 'Edit Rule' : 'New Detection Rule'} onClose={onClose} onSubmit={handleSubmit} submitLoading={loading} size="lg">
      <div className="form-group">
        <label>Name</label>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Multiple Login Failures" />
        {errors.name && <div className="form-error">{errors.name}</div>}
      </div>
      <div className="form-group">
        <label>Description</label>
        <textarea value={description} onChange={e => setDesc(e.target.value)} rows={2} placeholder="Triggers when…" />
      </div>
      <div className="form-row">
        <div className="form-group">
          <label>Event Type</label>
          <select value={eventType} onChange={e => setEventType(e.target.value)}>
            {EVENT_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g,' ')}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>Severity</label>
          <select value={severity} onChange={e => setSeverity(e.target.value as Severity)}>
            {SEVERITIES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>)}
          </select>
        </div>
      </div>

      <div style={{ marginBottom: 8, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <label style={{ margin:0 }}>Conditions</label>
        <button type="button" className="btn btn-ghost btn-sm" onClick={addCondition}>
          <Plus size={14} /> Add Condition
        </button>
      </div>
      {conditions.map((cond, i) => (
        <div key={i} style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr auto', gap:8, marginBottom:8, alignItems:'start' }}>
          <div>
            <input value={cond.field} onChange={e => updateCondition(i,'field',e.target.value)} placeholder="Field (e.g. src_ip)" />
            {errors[`cond_${i}_field`] && <div className="form-error">{errors[`cond_${i}_field`]}</div>}
          </div>
          <select value={cond.operator} onChange={e => updateCondition(i,'operator',e.target.value)}>
            {OPERATORS.map(op => <option key={op} value={op}>{op}</option>)}
          </select>
          <div>
            <input value={cond.value} onChange={e => updateCondition(i,'value',e.target.value)} placeholder="Value" />
            {errors[`cond_${i}_value`] && <div className="form-error">{errors[`cond_${i}_value`]}</div>}
          </div>
          <button type="button" className="btn btn-ghost btn-icon" onClick={() => removeCondition(i)} disabled={conditions.length===1}>
            <Trash2 size={14} color="var(--color-danger)" />
          </button>
        </div>
      ))}
    </FormDialog>
  );
}
