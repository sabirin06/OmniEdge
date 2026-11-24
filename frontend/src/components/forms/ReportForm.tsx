import React, { useState, useEffect } from 'react';
import { FormDialog } from '../ui/FormDialog';
import { useToast } from '../ui/Toast';
import { reportsApi } from '../../api/reports';
import { useAuth } from '../../hooks/useAuth';
import type { Report } from '../../types';

const TYPES = ['daily','weekly','monthly','custom'];

interface Props { open: boolean; onClose: () => void; onSaved: () => void; }

export function ReportForm({ open, onClose, onSaved }: Props) {
  const toast = useToast();
  const { user } = useAuth();
  const today = new Date().toISOString().split('T')[0];
  const weekAgo = new Date(Date.now() - 7*86400000).toISOString().split('T')[0];

  const [title, setTitle]         = useState('');
  const [type, setType]           = useState('weekly');
  const [dateFrom, setDateFrom]   = useState(weekAgo);
  const [dateTo, setDateTo]       = useState(today);
  const [loading, setLoading]     = useState(false);
  const [errors, setErrors]       = useState<Record<string,string>>({});

  useEffect(() => { if (open) { setTitle(''); setType('weekly'); setDateFrom(weekAgo); setDateTo(today); setErrors({}); } }, [open]);

  const validate = () => {
    const e: Record<string,string> = {};
    if (!title.trim()) e.title = 'Title required';
    if (dateFrom > dateTo) e.date = 'From must be before To';
    setErrors(e);
    return !Object.keys(e).length;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setLoading(true);
    try {
      await reportsApi.generate({ title, report_type: type, date_from: dateFrom, date_to: dateTo, tenant: user?.tenant! });
      toast('success', 'Report generated');
      onSaved(); onClose();
    } catch { toast('error', 'Failed to generate report'); }
    finally { setLoading(false); }
  };

  return (
    <FormDialog open={open} title="Generate Report" onClose={onClose} onSubmit={handleSubmit} submitLoading={loading} submitLabel="Generate">
      <div className="form-group">
        <label>Title</label>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Weekly Security Report" />
        {errors.title && <div className="form-error">{errors.title}</div>}
      </div>
      <div className="form-group">
        <label>Report Type</label>
        <select value={type} onChange={e => setType(e.target.value)}>
          {TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase()+t.slice(1)}</option>)}
        </select>
      </div>
      <div className="form-row">
        <div className="form-group">
          <label>Date From</label>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
        </div>
        <div className="form-group">
          <label>Date To</label>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
        </div>
      </div>
      {errors.date && <div className="form-error">{errors.date}</div>}
    </FormDialog>
  );
}
