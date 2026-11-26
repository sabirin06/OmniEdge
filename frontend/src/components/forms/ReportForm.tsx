import { useId, useState } from 'react';
import type { Report } from '../../types';
import { FormDialog } from '../ui/FormDialog';
import { reportsApi, type ReportFilters } from '../../api/reports';
import { requestError, requestFields } from '../../api/errors';

interface Props { filters?: ReportFilters; onClose: () => void; onSaved: (report: Report) => void }

export function dateInput(date: Date) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
}

export function ReportForm({ filters, onClose, onSaved }: Props) {
  const id = useId();
  const today = new Date();
  const [title, setTitle] = useState('');
  const [start, setStart] = useState(() => filters?.period_start ?? dateInput(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6)));
  const [end, setEnd] = useState(() => filters?.period_end ?? dateInput(today));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [fields, setFields] = useState<Partial<Record<'title' | 'period_start' | 'period_end', string>>>({});

  async function save() {
    if (saving) return;
    setError('');
    const issues: typeof fields = {};
    if (!title.trim()) issues.title = 'Enter a report title.';
    if (!start) issues.period_start = 'Choose a start date.';
    if (!end) issues.period_end = 'Choose an end date.';
    else if (start > end) issues.period_end = 'Choose an end date on or after the start date.';
    else if (start && Date.parse(end) - Date.parse(start) >= 366 * 86400000) issues.period_end = 'Choose a range of 366 days or fewer.';
    setFields(issues);
    if (Object.keys(issues).length) return;
    setSaving(true);
    try {
      const { data } = await reportsApi.generate({ ...filters, title: title.trim(), period_start: start, period_end: end });
      onSaved(data);
    } catch (err) {
      const next = requestFields(err, ['title', 'period_start', 'period_end']);
      setFields(next);
      if (!Object.keys(next).length) setError(requestError(err, 'Could not generate the report.'));
    } finally { setSaving(false); }
  }

  return <FormDialog open title="Generate report" onClose={() => { if (!saving) onClose(); }}
    onSubmit={save} submitLoading={saving} submitLabel="Generate report">
    <p className="form-hint">Save a snapshot of your organization’s activity for the selected date range.</p>
    <div className="form-group">
      <label htmlFor={id + '-title'}>Report title</label>
      <input aria-invalid={!!fields.title} aria-describedby={fields.title ? id + "-title-error" : undefined} id={id + '-title'} value={title} onChange={e => setTitle(e.target.value)} maxLength={500}
        placeholder="Weekly security operations" autoFocus />
      {fields.title && <p id={id + "-title-error"} className="form-error" role="alert">{fields.title}</p>}
    </div>
    <div className="form-row">
      <div className="form-group"><label htmlFor={id + '-start'}>Start date</label>
        <input aria-invalid={!!fields.period_start} aria-describedby={fields.period_start ? id + "-start-error" : undefined} id={id + '-start'} type="date" value={start} onChange={e => setStart(e.target.value)} />
      {fields.period_start && <p id={id + "-start-error"} className="form-error" role="alert">{fields.period_start}</p>}</div>
      <div className="form-group"><label htmlFor={id + '-end'}>End date</label>
        <input aria-invalid={!!fields.period_end} aria-describedby={fields.period_end ? id + "-end-error" : undefined} id={id + '-end'} type="date" value={end} onChange={e => setEnd(e.target.value)} />
      {fields.period_end && <p id={id + "-end-error"} className="form-error" role="alert">{fields.period_end}</p>}</div>
    </div>
    {error && <p role="alert" className="form-error">{error}</p>}
  </FormDialog>;
}
