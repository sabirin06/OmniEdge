import { useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import { requestError, requestFields } from '../../api/errors';
import { FormDialog } from '../ui/FormDialog';

export interface IncidentDraft {
  title: string;
  description: string;
  severity: string;
}

interface Props {
  alert?: { id: number; title: string; severity: string; triage_notes?: string };
  onClose: () => void;
  onSave: (draft: IncidentDraft) => Promise<void>;
}

const levels = ['low', 'medium', 'high', 'critical'];

export function IncidentIntakeDialog({ alert, onClose, onSave }: Props) {
  const id = useId();
  const titleRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState(alert?.title.slice(0, 500) ?? '');
  const [description, setDescription] = useState(alert?.triage_notes ?? '');
  const [severity, setSeverity] = useState(alert && levels.includes(alert.severity) ? alert.severity : 'high');
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof IncidentDraft | 'form', string>>>({});

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const draft = { title: title.trim(), description: description.trim(), severity };
    if (!draft.title || draft.title.length > 500) {
      setErrors({ title: draft.title ? 'Keep the title to 500 characters or fewer.' : 'Enter a short title for this incident.' });
      titleRef.current?.focus();
      return;
    }
    setPending(true);
    setErrors({});
    try {
      await onSave(draft);
    } catch (error) {
      const next: typeof errors = requestFields(error, ['title', 'severity', 'description']);
      if (!Object.keys(next).length) next.form = requestError(error, 'Could not create the incident. Please try again.');
      setErrors(next);
    } finally {
      setPending(false);
    }
  }

  return (
    <FormDialog open size="lg" title={alert ? 'Escalate alert to an incident' : 'Create an incident'}
      onClose={() => { if (!pending) onClose(); }}>
      <form className="incident-intake" onSubmit={submit} noValidate aria-busy={pending}>
        <p className="incident-muted">
          {alert ? 'Create a case to investigate this alert. The alert and its original event stay linked, and you become the case owner.'
            : 'Open a case for suspicious activity that needs investigation. You can assign an owner from the case overview after saving.'}
        </p>
        {alert && <div className="incident-source">
          <AlertTriangle size={18} aria-hidden="true" />
          <div><strong>Source alert #{alert.id}</strong><p>{alert.title}</p></div>
        </div>}

        <div className="incident-form-grid">
          <div className="form-group">
            <label htmlFor={id + '-title'}>Case title <span className="incident-muted">Required</span></label>
            <input id={id + '-title'} ref={titleRef} autoFocus required maxLength={500} value={title}
              onChange={e => { setTitle(e.target.value); if (errors.title) setErrors(current => ({ ...current, title: undefined })); }}
              placeholder="Repeated failed sign-ins on the finance server"
              aria-invalid={!!errors.title} aria-describedby={id + '-title-help'} />
            <div id={id + '-title-help'} className={errors.title ? 'form-error' : 'incident-muted'} aria-live="polite">
              {errors.title ?? 'Name what happened and the affected service or asset.'}
            </div>
          </div>
          <div className="form-group">
            <label htmlFor={id + '-severity'}>Severity</label>
            <select id={id + '-severity'} value={severity} onChange={e => setSeverity(e.target.value)}
              aria-invalid={!!errors.severity} aria-describedby={id + '-severity-help'}>
              {levels.map(level => <option key={level} value={level}>{level[0].toUpperCase() + level.slice(1)}</option>)}
            </select>
            <div id={id + '-severity-help'} className={errors.severity ? 'form-error' : 'incident-muted'}>
              {errors.severity ?? 'Choose the current impact.'}
            </div>
          </div>
        </div>

        <div className="form-group">
          <label htmlFor={id + '-description'}>Initial findings <span className="incident-muted">Optional</span></label>
          <textarea id={id + '-description'} rows={4} value={description} onChange={e => setDescription(e.target.value)}
            placeholder="What was observed, when it started, and what still needs checking."
            aria-invalid={!!errors.description} aria-describedby={id + '-description-help'} />
          <div id={id + '-description-help'} className={errors.description ? 'form-error' : 'incident-muted'}>
            {errors.description ?? (alert ? 'Triage notes are copied here when available. Keep confirmed details apart from open questions.'
              : 'Use what you know now. Add new findings later in the investigation timeline.')}
          </div>
        </div>

        {errors.form && <p className="form-error" role="alert">{errors.form}</p>}
        <div className="incident-intake-footer">
          <span className="incident-muted">The case opens with status Open.</span>
          <div className="incident-buttons">
            <button type="button" className="btn btn-secondary" disabled={pending} onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={pending}>
              {pending ? 'Creating incident…' : alert ? 'Create linked incident' : 'Create incident'} <ArrowRight size={15} aria-hidden="true" />
            </button>
          </div>
        </div>
      </form>
    </FormDialog>
  );
}
