import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Activity, ArrowRight, ShieldCheck } from 'lucide-react';
import { platformApi, type PlatformHealth, type PlatformSettings, type PlatformWork } from '../api/platform';
import { requestError } from '../api/errors';
import { useApi } from '../hooks/useApi';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../components/ui/Toast';
import { Pagination } from '../components/ui/Pagination';
import { ErrorState } from '../components/ui/ErrorState';
import { SupportAccess } from '../components/ui/SupportAccess';
import { Settings } from './Settings';
import { canAccessPage } from '../utils/permissions';

const resources: Record<string, string> = {
  users: 'Total Users', 'active-users': 'Active Users', 'inactive-users': 'Inactive Users', tenants: 'Tenants',
  events: 'Events', alerts: 'Alerts', incidents: 'Incidents', 'log-sources': 'Log Sources',
  'failed-logins': 'Failed Logins', authentication: 'Authentication Activity', audit: 'Audit Logs',
  ticket: 'Support Tickets', health: 'System Health',
};
const workTitles: Record<string, string> = { ticket: 'Support Tickets', backup: 'Backup & Recovery', maintenance: 'Maintenance', integration: 'Integrations', detection: 'Detection Templates' };
const format = (value: string) => value.replace(/__/g, ' ').replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());
const display = (value: unknown) => typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value ?? '-');
const encodeCsv = (value: unknown) => {
  const text = display(value);
  return `"${(/^[\\s]*[=+@-]/.test(text) ? "'" + text : text).replace(/"/g, '""')}"`;
};

function HealthPanel({ health }: { health: PlatformHealth }) {
  return <dl className="platform-health">
    <div><dt>API</dt><dd>{format(health.api)}</dd></div><div><dt>Database</dt><dd>{format(health.database)}</dd></div>
    <div><dt>Database probe</dt><dd>{health.database_probe_ms} ms</dd></div>
    <div><dt>Last event received</dt><dd>{health.last_event ? new Date(health.last_event).toLocaleString() : 'No events recorded'}</dd></div>
  </dl>;
}

const reportMetrics: Record<string, string[]> = {
  usage: ['users', 'active-users', 'inactive-users', 'events', 'log-sources'],
  security: ['alerts', 'incidents', 'failed-logins', 'authentication', 'audit'],
  tenants: ['tenants', 'users', 'active-users', 'inactive-users', 'ticket'],
  performance: ['health'],
};

function Overview({ report = false }: { report?: boolean }) {
  const state = useApi(report ? platformApi.report : platformApi.overview, [report]);
  const data = state.data;
  const [reportType, setReportType] = useState('usage');
  const metrics = report ? reportMetrics[reportType] : Object.keys(resources);
  function exportCounts() {
    if (!data) return;
    const rows: (string | number)[][] = [['Metric', 'Value'], ['Report', reportType], ['Generated', data.as_of]];
    rows.push(...metrics.filter(key => key in data.counts).map(key => [resources[key], data.counts[key]]));
    if (reportType === 'performance') rows.push(
      ['Database', data.health.database], ['API', data.health.api], ['Database probe (ms)', data.health.database_probe_ms],
      ['Last event received', data.health.last_event ?? 'No events recorded'],
    );
    const url = URL.createObjectURL(new Blob([rows.map(row => row.map(encodeCsv).join(',')).join('\r\n')], { type: 'text/csv' }));
    const link = document.createElement('a'); link.href = url; link.download = `omniedge-platform-${reportType}.csv`; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  if (state.error) return <ErrorState message={state.error} onRetry={state.refresh} />;
  if (!data) return <p role="status">Loading platform activity...</p>;
  return <div className="page-stack">
    <div className="workspace-heading"><p className="muted">Updated {new Date(data.as_of).toLocaleString()}</p>
      <div className="incident-buttons"><button className="btn btn-secondary" onClick={state.refresh} disabled={state.loading}>Refresh</button>
        {report && <><label>Report type<select value={reportType} onChange={e => setReportType(e.target.value)}>
          {Object.keys(reportMetrics).map(value => <option key={value} value={value}>{format(value)}</option>)}
        </select></label><button className="btn btn-primary" onClick={exportCounts}>Download CSV</button></>}</div></div>
    <div className="platform-metrics">
      {metrics.map(key => <Link key={key} className="panel platform-metric" to={key === 'health' ? '/settings/system-health' : `/platform/${key}`}>
        <span>{resources[key]}</span><strong>{key === 'health' ? format(data.health.database) : (data.counts[key] ?? 0).toLocaleString()}</strong>
        <ArrowRight size={17} aria-hidden="true" />
      </Link>)}
    </div>
    <div className="dashboard-grid">
      <section className="panel page-stack"><h3>Service health</h3><HealthPanel health={data.health} /></section>
      <section className="panel page-stack"><h3>Recent administrative activity</h3>
        {!data.activity.length && <p className="muted">No activity recorded.</p>}
        <ul className="platform-activity">{data.activity.map((entry, index) => <li key={index}><span>{entry.action}</span><time>{new Date(entry.timestamp).toLocaleString()}</time></li>)}</ul>
      </section>
    </div>
  </div>;
}

function Records({ section }: { section: string }) {
  const [page, setPage] = useState(1);
  const listing = useApi(() => platformApi.records(section, page), [section, page]);
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  async function change(kind: 'users' | 'tenants', id: number, state: string) {
    if (busy || !window.confirm(`Set this ${kind === 'users' ? 'user' : 'tenant'} to ${state}?`)) return;
    setBusy(true);
    try { await platformApi.access(kind, id, state); listing.refresh(); toast('success', 'Access updated.'); }
    catch (error) { toast('error', requestError(error, 'Could not change access.')); }
    finally { setBusy(false); }
  }
  if (listing.error) return <ErrorState message={listing.error} onRetry={listing.refresh} />;
  if (!listing.data) return <p role="status">Loading records...</p>;
  const data = listing.data;
  const accessKind = section === 'tenants' ? 'tenants' : section.endsWith('users') ? 'users' : null;
  return <section className="panel page-stack" aria-busy={listing.loading}>
    {accessKind && <Link className="btn btn-secondary platform-inline" to={`/${accessKind}`}>Manage {accessKind}</Link>}
    <div className="table-wrapper"><table className="data-table"><thead><tr>
      {data.columns.map(column => <th key={column}>{format(column)}</th>)}{accessKind && <th>Access</th>}
    </tr></thead><tbody>{data.results.map(row => <tr key={String(row.id)}>
      {data.columns.map(column => <td key={column}>{display(row[column])}</td>)}
      {accessKind && <td>{row.role !== 'platform_admin' && <div className="incident-buttons">
        {['active', 'suspended', 'inactive'].map(state => <button key={state} type="button" className="btn btn-ghost btn-sm" disabled={busy}
          onClick={() => change(accessKind, Number(row.id), state)}>{state === 'active' ? 'Activate' : state === 'suspended' ? 'Suspend' : 'Deactivate'}</button>)}
        {accessKind === 'tenants' && <SupportAccess tenant={Number(row.id)} label={String(row.name)} />}
      </div>}</td>}
    </tr>)}</tbody></table></div>
    {!data.count && <p className="muted">No records found.</p>}
    <Pagination page={page} pageSize={25} total={data.count} onPageChange={setPage} />
  </section>;
}

function SettingsForm({ mode = 'all' }: { mode?: 'all' | 'email' | 'notifications' | 'security' }) {
  const settings = useApi(platformApi.settings);
  const [draft, setDraft] = useState<PlatformSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const value = draft ?? settings.data;
  async function save(e: FormEvent) {
    e.preventDefault();
    if (!value || busy) return;
    setBusy(true);
    try { await platformApi.saveSettings(value); toast('success', 'Platform settings saved.'); }
    catch (error) { toast('error', requestError(error, 'Could not save platform settings.')); }
    finally { setBusy(false); }
  }
  if (settings.error) return <ErrorState message={settings.error} onRetry={settings.refresh} />;
  if (!value) return <p role="status">Loading settings...</p>;
  return <form className="panel page-stack" onSubmit={save}>
    {(mode === 'all' || mode === 'email') && <dl className="platform-health">
      <div><dt>Email transport</dt><dd>{format(value.email_transport ?? 'unavailable')}</dd></div>
      <div><dt>SMTP configuration</dt><dd>{value.smtp_host_configured ? 'Host configured' : 'Host unavailable'}</dd></div>
    </dl>}
    {(mode === 'all' || mode === 'security') && <div className="form-group"><label>Support session duration in minutes<input type="number" min={5} max={30} required value={value.support_minutes}
      onChange={e => setDraft({ ...value, support_minutes: Number(e.target.value) })} /></label></div>}
    {(mode === 'all' || mode === 'notifications') && <><div className="form-group"><label>Notification contact<input type="email" value={value.notification_email}
      onChange={e => setDraft({ ...value, notification_email: e.target.value })} /></label></div>
    <div className="form-group"><label>Maintenance notice<textarea maxLength={300} value={value.maintenance_notice}
      onChange={e => setDraft({ ...value, maintenance_notice: e.target.value })} /></label></div></>}
    {mode !== 'email' && <button className="btn btn-primary platform-inline" disabled={busy}>Save settings</button>}
  </form>;
}

const initialWork = { title: '', details: '', status: 'open' };
function Work({ kind }: { kind: string }) {
  const [page, setPage] = useState(1);
  const listing = useApi(() => platformApi.work(kind, page), [kind, page]);
  const [draft, setDraft] = useState<Pick<PlatformWork, 'title' | 'details' | 'status'>>(initialWork);
  const [editing, setEditing] = useState<number>();
  const [eventType, setEventType] = useState('');
  const [conditions, setConditions] = useState('{}');
  const [severity, setSeverity] = useState('medium');
  const [enabled, setEnabled] = useState(false);
  function edit(item: PlatformWork) {
    setEditing(item.id);
    setDraft(item);
    setEventType(item.configuration?.event_type ?? '');
    setConditions(JSON.stringify(item.configuration?.conditions ?? {}));
    setSeverity(item.configuration?.severity ?? 'medium');
    setEnabled(item.configuration?.enabled ?? false);
  }
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy || (['completed', 'cancelled'].includes(draft.status) && !window.confirm('Confirm this work item status.'))) return;
    setBusy(true);
    try {
      await platformApi.saveWork(kind, editing, kind === 'detection' ? {
        ...draft, configuration: { event_type: eventType.trim(), conditions: JSON.parse(conditions), severity, enabled },
      } : draft);
      setEditing(undefined); setDraft(initialWork); setEventType(''); setConditions('{}'); setSeverity('medium'); setEnabled(false);
      listing.refresh(); toast('success', 'Work item saved.');
    }
    catch (error) { toast('error', error instanceof SyntaxError ? 'Enter valid JSON match conditions.' : requestError(error, 'Could not save the work item.')); }
    finally { setBusy(false); }
  }
  return <div className="dashboard-grid">
    <form className="panel page-stack" onSubmit={save}>
      <h3>{editing ? 'Edit item' : 'Create item'}</h3>
      {kind === 'detection' && <p className="form-hint">Templates are stored centrally for review. Tenant detection engines continue using their assigned rules.</p>}
      {kind === 'integration' && <p className="form-hint">Record the service, owner, and operational notes. Keep credentials in the deployment secret store.</p>}
      {kind === 'backup' && <p className="form-hint">Record backup verification and recovery tests performed by infrastructure operators.</p>}
      <div className="form-group"><label>Title<input value={draft.title} maxLength={160} required onChange={e => setDraft({ ...draft, title: e.target.value })} /></label></div>
      <div className="form-group"><label>Details<textarea value={draft.details} maxLength={4000} required onChange={e => setDraft({ ...draft, details: e.target.value })} /></label></div>
      <div className="form-group"><label>Status<select value={draft.status} onChange={e => setDraft({ ...draft, status: e.target.value })}>
        {['open', 'in_progress', 'completed', 'cancelled'].map(value => <option key={value} value={value}>{format(value)}</option>)}</select></label></div>
      {kind === 'detection' && <>
        <div className="form-group"><label>Event type<input value={eventType} maxLength={100} required onChange={e => setEventType(e.target.value)} /></label></div>
        <div className="form-group"><label>Severity<select value={severity} onChange={e => setSeverity(e.target.value)}>
          {['low', 'medium', 'high', 'critical'].map(value => <option key={value} value={value}>{format(value)}</option>)}</select></label></div>
        <div className="form-group"><label>Match conditions (JSON)<textarea value={conditions} onChange={e => setConditions(e.target.value)} /></label></div>
        <label><input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} /> Available for review</label>
      </>}
      <button className="btn btn-primary platform-inline" disabled={busy}>Save item</button>
    </form>
    <section className="panel page-stack"><h3>Work history</h3>
      {listing.loading && <p role="status">Loading work...</p>}
      {listing.error && <ErrorState message={listing.error} onRetry={listing.refresh} />}
      {listing.data?.results.map(item => <article className="platform-work-row" key={item.id}>
        <strong>{item.title}</strong><span>{format(item.status)}</span><p>{item.details}</p>
        <button className="btn btn-secondary btn-sm" onClick={() => edit(item)}>Edit</button>
      </article>)}
      {listing.data?.count === 0 && <p className="muted">No work items recorded.</p>}
      <Pagination page={page} pageSize={50} total={listing.data?.count ?? 0} onPageChange={setPage} />
    </section>
  </div>;
}

const previewRoutes = ['/dashboard', '/alerts', '/incidents', '/events', '/assets', '/log-sources', '/rules', '/playbooks', '/reports', '/users', '/audit', '/settings'];

function SupportPreview() {
  const [section, setSection] = useState("");
  const state = useApi(() => platformApi.preview(section), [section]);
  const navigate = useNavigate();
  const toast = useToast();
  const expiry = state.data?.expires_at;
  const [expired, setExpired] = useState(false);
  useEffect(() => {
    if (!expiry) return;
    const until = Date.parse(expiry) - Date.now();
    if (until <= 0) { setExpired(true); return; }
    const timer = window.setTimeout(() => setExpired(true), until);
    return () => window.clearTimeout(timer);
  }, [expiry]);
  const data = state.data;
  if (expired) return <p className="panel" role="status">This support session has expired.</p>;
  if (state.error) return <ErrorState message="No active support session." onRetry={state.refresh} />;
  if (!data) return <p role="status">Loading support session...</p>;
  async function end() {
    try { await platformApi.endSupport(); navigate('/platform'); toast('success', 'Support session ended.'); }
    catch (error) { toast('error', requestError(error, 'Could not end the session.')); }
  }
  return <div className="page-stack">
    <header className="panel workspace-heading"><div><h3>Read-only support is active</h3>
      <p>{data.tenant} | Expires {new Date(data.expires_at).toLocaleTimeString()}</p><p>{data.reason}</p></div>
      <button className="btn btn-secondary" onClick={end}>End session</button></header>
    {data.target && <section className="panel page-stack"><h3>{data.target.name}</h3>
      <p>{format(data.target.role)} | {data.target.active ? 'Active' : 'Inactive'}</p>
      {data.target.active && !!Object.keys(data.counts).length && <p>Available sections: {previewRoutes.filter(path => canAccessPage(data.target?.role, path)).map(path => format(path.slice(1))).join(', ')}</p>}
    </section>}
    {!!Object.keys(data.counts).length && <section className="panel page-stack"><h3>Organization activity</h3><dl className="platform-health">
      {Object.entries(data.counts).map(([key, count]) => <div key={key}><dt>{format(key)}</dt><dd>{count.toLocaleString()}</dd></div>)}</dl></section>}
    {!!data.sections.length && <section className="panel page-stack"><h3>Support records</h3>
      <div className="incident-buttons">{data.sections.map(key => <button key={key} type="button"
        className={key === section ? 'btn btn-primary' : 'btn btn-secondary'}
        aria-pressed={key === section} onClick={() => setSection(key)}>{resources[key] ?? format(key)}</button>)}</div>
      {state.loading ? <p role="status">Loading support records...</p> : data.records && <>
        <p className="muted">Showing {data.records.results.length} of {data.records.count} records</p>
        <div className="table-wrapper"><table className="data-table">
          <thead><tr>{data.records.columns.map(column => <th key={column}>{format(column)}</th>)}</tr></thead>
          <tbody>{data.records.results.map(row => <tr key={String(row.id)}>
            {data.records!.columns.map(column => <td key={column}>{display(row[column])}</td>)}
          </tr>)}</tbody>
        </table></div>
      </>}
    </section>}
  </div>;
}

function Health() {
  const health = useApi(platformApi.health);
  return health.error ? <ErrorState message={health.error} onRetry={health.refresh} /> : <section className="panel page-stack">
    {health.data ? <HealthPanel health={health.data} /> : <p role="status">Checking health...</p>}
    <button className="btn btn-secondary platform-inline" disabled={health.loading} onClick={health.refresh}><Activity size={16} /> Check now</button>
  </section>;
}

export function PlatformAdmin() {
  const { user } = useAuth();
  const { section = 'overview' } = useParams();
  if (user?.role !== 'platform_admin') return <p role="alert">Access denied.</p>;
  const work = Object.prototype.hasOwnProperty.call(workTitles, section);
  const resource = Object.prototype.hasOwnProperty.call(resources, section);
  const specialTitles = new Map([
    ['overview', 'Platform Overview'], ['reports', 'Platform Reports'],
    ['configuration', 'System Configuration'], ['support', 'Support Session'],
  ]);
  const title = work ? workTitles[section] : resource ? resources[section] : specialTitles.get(section);
  return <section className="workspace-page">
    <header className="workspace-heading"><div className="report-heading-title"><ShieldCheck aria-hidden="true" /><h2>{title ?? 'Platform Administration'}</h2></div></header>
    {section === 'overview' ? <Overview /> : section === 'reports' ? <Overview report /> : section === 'configuration' ? <SettingsForm /> :
      section === 'support' ? <SupportPreview /> : section === 'health' ? <Health /> : work ? <Work kind={section} key={section} /> :
      resource ? <Records section={section} key={section} /> : <p>Choose a platform section.</p>}
  </section>;
}

const settingsSections: Record<string, string> = {
  profile: 'Profile', 'system-health': 'System Health', maintenance: 'Maintenance',
  notifications: 'Notification Settings', email: 'Email Configuration',
  security: 'Security Settings', integrations: 'Integrations',
};

export function PlatformSettingsPage() {
  const { section = 'profile' } = useParams();
  return <div className="workspace-page">
    <nav className="incident-buttons" aria-label="Platform settings sections">
      {Object.entries(settingsSections).map(([key, label]) => <Link key={key}
        to={key === 'profile' ? '/settings' : `/settings/${key}`}
        aria-current={key === section ? 'page' : undefined}
        className={key === section ? 'btn btn-primary' : 'btn btn-secondary'}>{label}</Link>)}
    </nav>
    {section === 'profile' ? <Settings /> : <section className="page-stack">
      <h2>{Object.prototype.hasOwnProperty.call(settingsSections, section) ? settingsSections[section] : 'Platform Settings'}</h2>
      {section === 'system-health' ? <Health /> : section === 'maintenance' ? <Work kind="maintenance" key={section} /> :
        section === 'integrations' ? <Work kind="integration" key={section} /> :
        section === 'notifications' || section === 'email' || section === 'security' ? <SettingsForm mode={section} key={section} /> :
        <p>Choose a settings section.</p>}
      {section === 'security' && <Link to="/platform/authentication">Review authentication activity</Link>}
    </section>}
  </div>;
}
