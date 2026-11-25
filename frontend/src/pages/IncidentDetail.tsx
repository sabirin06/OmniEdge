import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Clock, CloudUpload, Download, FileText, Link2, ListChecks, Paperclip, Plus, Save, Send, Shield, TriangleAlert } from 'lucide-react';
import type { FormEvent } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { incidentsApi } from '../api/incidents';
import { playbooksApi } from '../api/playbooks';
import { usersApi } from '../api/users';
import { requestError } from '../api/errors';
import { useToast } from '../components/ui/Toast';
import { formatDateTime } from '../utils/formatters';

const stages = ['open', 'investigating', 'containment', 'resolved', 'closed'];
const stageLabels: Record<string, string> = {
  open: 'Open', investigating: 'Investigating', containment: 'Containment', resolved: 'Resolved', closed: 'Closed',
};
const transitionLabels: Record<string, string> = {
  investigating: 'Start investigation', containment: 'Move to containment', resolved: 'Resolve incident', closed: 'Close incident',
};

const transitions: Record<string, string[]> = {
  open: ['investigating'], investigating: ['containment', 'resolved'],
  containment: ['resolved'], resolved: ['closed'],
};

const timelineKinds = {
  note: { title: 'Investigation note', icon: FileText },
  status_change: { title: 'Status updated', icon: Shield },
  alert_linked: { title: 'Alert linked', icon: TriangleAlert },
  evidence_added: { title: 'Evidence added', icon: Paperclip },
  task_updated: { title: 'Task updated', icon: ListChecks },
  playbook_applied: { title: 'Playbook applied', icon: ListChecks },
  assignment_changed: { title: 'Assignment updated', icon: ListChecks },
};

export function IncidentDetail() {
  const { id } = useParams();
  const { state } = useLocation();
  const incidentId = Number(id);
  const { user } = useAuth();
  const lead = user?.role === 'soc_lead';
  const canAccessEvidence = lead || user?.role === 'soc_analyst';
  const toast = useToast();
  const [incident, setIncident] = useState<any>(null);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [evidence, setEvidence] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [people, setPeople] = useState<{ id: number; full_name: string }[]>([]);
  const [playbooks, setPlaybooks] = useState<{ id: number; name: string }[]>([]);
  const [tab, setTab] = useState('Overview');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [summary, setSummary] = useState('');
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState('');
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const [showPlaybook, setShowPlaybook] = useState(false);

  function chooseEvidence(file: File | null) {
    const issue = file && (!/\.(txt|csv|json|png|jpe?g|pdf)$/i.test(file.name)
      ? 'Choose a TXT, CSV, JSON, PNG, JPG, or PDF file.'
      : file.size > 5 * 1024 * 1024 ? 'Choose a file no larger than 5 MB.' : '');
    setFileError(issue || '');
    setEvidenceFile(issue ? null : file);
  }

  async function load() {
    setLoadError('');
    try {
      const [record, history, files, actions, linked] = await Promise.all([
        incidentsApi.get(incidentId), incidentsApi.getTimeline(incidentId),
        canAccessEvidence ? incidentsApi.getEvidence(incidentId) : Promise.resolve({ data: [] }), incidentsApi.getTasks(incidentId), incidentsApi.linkedAlerts(incidentId),
      ]);
      const rows = (data: any) => data.results ?? data;
      setIncident(record.data);
      setTimeline(rows(history.data)); setEvidence(rows(files.data));
      setTasks(rows(actions.data)); setAlerts(rows(linked.data));
    } catch (err) { setLoadError(requestError(err, 'Could not load this incident.')); }
  }

  useEffect(() => {
    setIncident(null);
    setEvidenceFile(null);
    setFileError('');
    setShowPlaybook(false);
    void load();
    usersApi.list().then(({ data }) => setPeople(data.results.filter(person => person.is_active)))
      .catch(err => toast('error', requestError(err, 'Could not load team members.')));
    if (lead) playbooksApi.list({ enabled: true }).then(({ data }) => setPlaybooks(data.results))
      .catch(err => toast('error', requestError(err, 'Could not load playbooks.')));
  }, [incidentId, lead]);

  async function mutate(operation: () => Promise<unknown>, message: string) {
    if (busy) return;
    setBusy(true); setError('');
    try { await operation(); await load(); toast('success', message); }
    catch (err) { setError(requestError(err, 'Could not save the change.')); }
    finally { setBusy(false); }
  }

  function submit(event: FormEvent<HTMLFormElement>, operation: (data: FormData) => Promise<unknown>, message: string) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    void mutate(async () => { await operation(data); if (message !== 'Case updated') form.reset(); }, message);
  }

  async function download(file: any) {
    try {
      const { data } = await incidentsApi.downloadEvidence(incidentId, file.id);
      const url = URL.createObjectURL(data);
      const link = document.createElement('a');
      link.href = url; link.download = file.original_filename; link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) { setError(requestError(err, 'Evidence file is unavailable.')); }
  }

  if (!incident) return loadError ? <p role="alert">{loadError} <button onClick={load}>Retry</button></p> : <p role="status">Loading incident…</p>;
  const canRespond = lead || user?.role === 'soc_analyst';
  const open = canRespond && !['resolved', 'closed'].includes(incident.status);
  const available = (transitions[incident.status] ?? []).filter(status => canRespond && (status !== 'closed' || lead));
  const teamOptions = people.map(person => <option key={person.id} value={person.id}>{person.full_name}</option>);

  const unresolvedTasks = tasks.filter(task => task.required && task.status !== 'completed');
  return (
    <section className="incident-case">
      <Link className="incident-back" to="/incidents"><ArrowLeft size={16} aria-hidden="true" /> Back to Incidents</Link>
      {state?.escalatedAlert && incident.status === 'open' && alerts.some(alert => alert.id === state.escalatedAlert) &&
        <p className="incident-source" role="status">Alert #{state.escalatedAlert} is linked to this new incident.</p>}
      <ol className="incident-stages" aria-label="Incident lifecycle">
        {stages.map((stage, index) => {
          const current = stage === incident.status;
          const past = index < stages.indexOf(incident.status);
          return <li key={stage} aria-current={current ? 'step' : undefined} className={current ? 'current' : past ? 'past' : ''}>
            <span className="incident-stage-number" aria-hidden="true">{index + 1}</span>
            <span>{stageLabels[stage]}</span>{current && <small>Current status</small>}
          </li>;
        })}
      </ol>
      <div className="incident-buttons incident-tabs" role="group" aria-label="Case sections">
        {Object.entries({ Overview: FileText, Timeline: Clock, ...(canAccessEvidence ? { Evidence: Paperclip } : {}), Tasks: ListChecks })
          .map(([name, Icon]) => <button type="button" key={name} className={tab === name ? 'btn btn-primary' : 'btn btn-secondary'}
            aria-pressed={tab === name} onClick={() => { setTab(name); setError(''); }}>
            <Icon size={16} aria-hidden="true" /> {name}
          </button>)}
      </div>
      {(error || loadError) && <p className="form-error" role="alert">{error || loadError}</p>}

      {tab === 'Overview' && <div className="card">
        <h2 className="incident-panel-title"><FileText size={19} aria-hidden="true" /> Case Details</h2>
        <p className="incident-muted">Update the title, impact, or owner when the investigation uncovers new information.</p>
        {open ? <form id="case-details-form" onSubmit={event => submit(event, data => incidentsApi.update(incidentId, {
          title: String(data.get('title')), description: String(data.get('description')),
          severity: String(data.get('severity')), owner: Number(data.get('owner')) || null,
        }), 'Case updated')}>
          <div className="form-group"><label>Title <input name="title" required defaultValue={incident.title} /></label></div>
          <div className="incident-detail-fields">
          <div className="form-group"><label>Severity <select name="severity" defaultValue={incident.severity}>
            {['low', 'medium', 'high', 'critical'].map(value => <option key={value} value={value}>{value[0].toUpperCase() + value.slice(1)}</option>)}
          </select></label></div>
          <div className="form-group"><label>Owner <select name="owner" defaultValue={incident.owner ?? ''}>
            <option value="">Unassigned</option>{teamOptions}
          </select></label></div>
          </div>
          <div className="form-group"><label>Description <textarea name="description" rows={3}
            placeholder="Describe the incident, impact, and what you observed." defaultValue={incident.description} /></label></div>
        </form> : <dl className="incident-readonly">
          <div><dt>Title</dt><dd>{incident.title}</dd></div>
          <div><dt>Severity</dt><dd>{incident.severity}</dd></div>
          <div><dt>Owner</dt><dd>{incident.owner_detail?.full_name ?? 'Unassigned'}</dd></div>
          <div><dt>Description</dt><dd>{incident.description || 'No description.'}</dd></div>
        </dl>}
        <h3 className="incident-panel-title"><Link2 size={18} aria-hidden="true" /> Linked Alerts</h3>
        {alerts.length ? <ul className="incident-linked-alerts">{alerts.map(alert => <li key={alert.id}><Link to={`/alerts/${alert.id}`}>{alert.title}</Link> · {alert.status}</li>)}</ul> : <p>No alerts linked.</p>}
        {incident.resolution_summary && <p>Resolution · {incident.resolution_summary}</p>}
        {available.includes('resolved') && <div className="form-group">
          <label className="incident-panel-title" htmlFor="case-resolution"><FileText size={18} aria-hidden="true" /> Resolution Summary</label>
          <textarea id="case-resolution" value={summary} rows={3} onChange={e => setSummary(e.target.value)}
            aria-describedby="case-resolution-help" placeholder="What happened, what the team did, and how you verified the outcome." />
          <p id="case-resolution-help" className="incident-muted">
            {unresolvedTasks.length ? 'Complete all required tasks before resolving.' : 'Enter the outcome before marking this incident resolved.'}
          </p>
        </div>}
        <div className="incident-buttons incident-case-actions">
          {available.map(status => <button key={status} disabled={busy || (status === 'resolved' && (!summary.trim() || unresolvedTasks.length > 0))} className="btn btn-primary"
            onClick={() => {
              if (status === 'closed' && !window.confirm('Close this incident and resolve its linked alerts?')) return;
              void mutate(() => incidentsApi.transition(incidentId, status, summary.trim()), 'Case status updated');
            }}>{transitionLabels[status]}</button>)}
          {open && <button form="case-details-form" type="submit" disabled={busy} className="btn btn-secondary">
            <Save size={16} aria-hidden="true" /> Save Case Details
          </button>}
        </div>
      </div>}

      {tab === 'Timeline' && <section className="card incident-workspace-panel">
        <header className="incident-workspace-header"><Clock aria-hidden="true" />
          <div><h2>Investigation Timeline</h2>
            <p className="incident-muted">Record findings and decisions. Status changes appear here automatically.</p></div>
        </header>
        {timeline.length ? <ol className="incident-timeline">{timeline.map(entry => {
          const kind = timelineKinds[entry.entry_type as keyof typeof timelineKinds] ?? timelineKinds.note;
          const Icon = kind.icon;
          return <li key={entry.id}>
            <span className="incident-timeline-icon" data-kind={entry.entry_type}><Icon size={19} aria-hidden="true" /></span>
            <div><strong>{kind.title}</strong><p>{entry.message}</p></div>
            <span>{entry.actor_detail?.full_name ?? 'System'}</span>
            <time dateTime={entry.created_at}>{formatDateTime(entry.created_at)}</time>
          </li>;
        })}</ol> : <p className="incident-muted">No timeline entries yet.</p>}
        {canRespond && <form className="incident-note-form" onSubmit={event => submit(event, data =>
          incidentsApi.addNote(incidentId, String(data.get('note')).trim()), 'Note added')}>
          <textarea aria-label="Investigation note" name="note" rows={1} placeholder="Add an investigation note?" required />
          <button disabled={busy} className="btn btn-primary"><Send size={16} aria-hidden="true" /> Add Note</button>
        </form>}
      </section>}

      {tab === 'Evidence' && canAccessEvidence && <section className="card incident-workspace-panel">
        <header className="incident-workspace-header"><Paperclip aria-hidden="true" />
          <div><h2>Private Evidence</h2>
            <p className="incident-muted">Attach relevant logs, screenshots, or documents. Add a description to explain what each file shows.</p></div>
        </header>
        {open && <form className="incident-evidence-form" onSubmit={event => {
          event.preventDefault();
          if (!evidenceFile || busy) return;
          const form = event.currentTarget;
          const data = new FormData(form);
          data.set('file', evidenceFile);
          void mutate(async () => {
            await incidentsApi.uploadEvidence(incidentId, data);
            form.reset();
            setEvidenceFile(null);
          }, 'Evidence uploaded');
        }}>
          <div>
            <input ref={fileInput} type="file" hidden accept=".txt,.csv,.json,.png,.jpg,.jpeg,.pdf"
              onChange={event => { chooseEvidence(event.currentTarget.files?.[0] ?? null); event.currentTarget.value = ''; }} />
            <button type="button" className="incident-dropzone" data-dragging={dragging} disabled={busy}
              aria-describedby={fileError ? 'incident-file-error' : undefined} onClick={() => fileInput.current?.click()}
              onDragOver={event => { event.preventDefault(); if (!busy) setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={event => {
                event.preventDefault();
                setDragging(false);
                if (busy) return;
                if (event.dataTransfer.files.length > 1) {
                  setFileError('Choose one file at a time.');
                  setEvidenceFile(null);
                  return;
                }
                chooseEvidence(event.dataTransfer.files[0] ?? null);
              }}>
              <CloudUpload size={30} aria-hidden="true" />
              <span>{evidenceFile ? evidenceFile.name : <>Drag and drop a file here, or <strong>click to browse</strong></>}</span>
              <small>{evidenceFile ? 'Click to choose a different file' : 'TXT, CSV, JSON, PNG, JPG, or PDF ? Up to 5 MB'}</small>
            </button>
            {fileError && <p id="incident-file-error" className="form-error" role="alert">{fileError}</p>}
          </div>
          <div className="incident-evidence-description">
            <label htmlFor="incident-evidence-description">Description</label>
            <textarea id="incident-evidence-description" name="description" rows={2} placeholder="Briefly describe the evidence (optional)?" />
            <button disabled={busy || !evidenceFile} className="btn btn-primary"><CloudUpload size={16} aria-hidden="true" /> Upload Evidence</button>
          </div>
        </form>}
        {!open && !evidence.length && <p className="incident-muted">No evidence uploaded.</p>}
        {evidence.map(file => <article className="incident-evidence-file" key={file.id}>
          <div><strong>{file.original_filename}</strong><p className="incident-muted">{file.description} ? {file.file_size} bytes ? {formatDateTime(file.uploaded_at)}</p></div>
          <button className="btn btn-secondary" aria-label={`Download ${file.original_filename}`} onClick={() => download(file)}><Download size={16} aria-hidden="true" /> Download</button>
        </article>)}
      </section>}

      {tab === 'Tasks' && <section className="card incident-workspace-panel">
        <header className="incident-workspace-header"><ListChecks aria-hidden="true" />
          <div><h2>Containment Tasks</h2>
            <p className="incident-muted">{lead ? 'Apply a playbook to create tasks and assign the work.' : 'Record your work and mark assigned tasks complete. A SOC Lead can apply a playbook when needed.'}</p></div>
        </header>
        {!tasks.length && <div className="incident-task-empty">
          <ListChecks size={36} aria-hidden="true" />
          <strong>No containment tasks yet</strong>
          <p className="incident-muted">Tasks track containment and resolution work for this incident.</p>
          {open && lead && !showPlaybook && <button className="btn btn-secondary" onClick={() => setShowPlaybook(true)}>
            <Plus size={16} aria-hidden="true" /> Apply Playbook
          </button>}
        </div>}
        {open && lead && (showPlaybook || tasks.length > 0) && <form className="incident-playbook-form" onSubmit={event => submit(event, data =>
          incidentsApi.applyPlaybook(incidentId, Number(data.get('playbook')), Number(data.get('assignee')) || undefined), 'Playbook applied')}>
          <div className="form-group"><label>Playbook <select name="playbook" required><option value="">Choose a playbook</option>
            {playbooks.map(book => <option key={book.id} value={book.id}>{book.name}</option>)}
          </select></label></div>
          <div className="form-group"><label>Assign generated tasks <select name="assignee"><option value="">Unassigned</option>{teamOptions}</select></label></div>
          <button disabled={busy} className="btn btn-primary">Apply Playbook</button>
        </form>}
        {tasks.map(task => {
          const actionable = open && ['pending', 'in_progress'].includes(task.status);
          const canWork = actionable && (lead || (user?.role === 'soc_analyst' && (!task.assignee || task.assignee === user.id)));
          return <article key={task.id} className="card">
            <h3>{task.title}</h3>
            <p>{task.instructions}</p>
            <p>{task.status} · {task.required ? 'Required' : 'Optional'} · {task.assignee_detail?.full_name ?? 'Unassigned'}</p>
            {task.completion_notes && <p>{task.completion_notes}</p>}
            {actionable && lead && <div className="form-group"><label>Assignee <select disabled={busy} value={task.assignee ?? ''}
              onChange={event => { const assignee = Number(event.target.value) || null; void mutate(() => incidentsApi.assignTask(incidentId, task.id, assignee), 'Task assignment updated'); }}>
              <option value="">Unassigned</option>{teamOptions}
            </select></label></div>}
            {canWork && <>
              <div className="form-group"><label>Completion note or skip reason <input value={notes[task.id] ?? ''}
                onChange={event => { const value = event.target.value; setNotes(current => ({ ...current, [task.id]: value })); }} /></label></div>
              <div className="filter-bar">
                {task.status === 'pending' && <button disabled={busy} className="btn btn-secondary" onClick={() =>
                  mutate(() => incidentsApi.updateTask(incidentId, task.id, { status: 'in_progress' }), 'Task started')}>Start task</button>}
                <button disabled={busy || !notes[task.id]?.trim()} className="btn btn-primary" onClick={() =>
                  mutate(() => incidentsApi.updateTask(incidentId, task.id, { status: 'completed', completion_notes: notes[task.id] }), 'Task completed')}>Complete task</button>
                {lead && !task.required && <button disabled={busy || !notes[task.id]?.trim()} className="btn btn-secondary" onClick={() =>
                  mutate(() => incidentsApi.updateTask(incidentId, task.id, { status: 'skipped', completion_notes: notes[task.id] }), 'Optional task skipped')}>Skip task</button>}
              </div>
            </>}
          </article>;
        })}
      </section>}
    </section>
  );
}
