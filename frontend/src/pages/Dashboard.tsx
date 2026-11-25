import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, ArrowRight, BarChart3, Bell, Building2, CheckSquare, ClipboardList, Layers, List, Play, RefreshCw, Shield, TriangleAlert, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { dashboardApi } from '../api/dashboard';
import { eventsApi } from '../api/events';
import { requestError } from '../api/errors';
import { useApi } from '../hooks/useApi';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../components/ui/Toast';
import { SeverityBadge, StatusBadge } from '../components/ui/Badge';
import { formatDateTime, roleLabels } from '../utils/formatters';
import { ErrorState } from '../components/ui/ErrorState';

interface Metric { label: string; value: number; icon: LucideIcon; to?: string }

function Metrics({ items }: { items: Metric[] }) {
  return <div className="dashboard-metrics">
    {items.map(({ label, value, icon: Icon, to }) => (
      <section className="panel dashboard-metric" key={label}>
        <span className="dashboard-metric-icon"><Icon size={26} aria-hidden="true" /></span>
        <div><p>{to ? <Link to={to}>{label}</Link> : label}</p><strong>{value.toLocaleString()}</strong></div>
      </section>
    ))}
  </div>;
}

const severityColors: Record<string, string> = {
  critical: '#f04458', high: '#ff941f', medium: '#ffbf2f',
  low: 'var(--color-brand-button)', info: '#70d6f5',
};

function AlertSeverity({ rows }: { rows: { severity: string; count: number }[] }) {
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  let offset = 0;
  const stops = rows.filter(row => row.count > 0).map(row => {
    const start = offset;
    offset += 100 * row.count / total;
    return `${severityColors[row.severity]} ${start}% ${offset}%`;
  });
  return <section className="panel page-stack">
    <h3 className="overview-panel-title"><TriangleAlert aria-hidden="true" /> Alerts by Severity</h3>
    <div className="overview-severity">
      <div className="overview-donut" style={{ background: total ? `conic-gradient(${stops.join(', ')})` : undefined }}>
        <div><strong>{total.toLocaleString()}</strong><span>Total Alerts</span></div>
      </div>
      <ul className="overview-severity-list">
        {rows.map(row => <li key={row.severity}>
          <span className="overview-severity-label"><i style={{ background: severityColors[row.severity] }} />{row.severity}</span>
          <strong>{row.count.toLocaleString()}</strong>
          <span className="overview-percent">{total ? Math.round(100 * row.count / total) : 0}%</span>
        </li>)}
      </ul>
    </div>
  </section>;
}

function Breakdown({ title, rows, icon: Icon }: { title: string; icon?: LucideIcon; rows: { label: string; count: number }[] }) {
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  return <section className="panel page-stack">
    <h3 className="overview-panel-title">{Icon && <Icon aria-hidden="true" />}{title}</h3>
    {rows.length ? <ul className="metric-breakdown">
      {rows.map(row => <li key={row.label}>
        <span>{row.label}</span><strong>{row.count.toLocaleString()}</strong>
        <span className="metric-track" aria-hidden="true"><span style={{ width: `${total ? 100 * row.count / total : 0}%` }} /></span>
      </li>)}
    </ul> : <p className="muted">No records in this breakdown.</p>}
  </section>;
}

export function Dashboard() {
  const { user } = useAuth();
  const toast = useToast();
  const dashboard = useApi(dashboardApi.stats, [user?.id]);
  const [simulating, setSimulating] = useState(false);
  const interval = user?.dashboard_refresh_seconds ?? 30;
  const { refresh } = dashboard;

  useEffect(() => {
    if (!interval) return;
    const timer = window.setInterval(() => { if (!document.hidden) refresh(); }, interval * 1000);
    const onVisible = () => { if (!document.hidden) refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [interval, refresh]);

  async function simulate() {
    setSimulating(true);
    try {
      const { data } = await eventsApi.simulate({ batch_size: 3, event_type: 'login_failed' });
      toast('success', `${data.created} events and ${data.alerts_created} alerts created.`);
      refresh();
    } catch (err) {
      toast('error', requestError(err, 'Could not generate simulated events.'));
    } finally { setSimulating(false); }
  }

  const stats = dashboard.data;
  if (!stats && dashboard.error) return <ErrorState message="Could not load the dashboard." onRetry={refresh} />;
  if (!stats) return <p role="status">Loading dashboard…</p>;

  return <section className="workspace-page overview">
    <header className="workspace-heading overview-heading">
      <div className="overview-heading-copy">
        <Shield className="overview-shield" aria-hidden="true" />
        <div>
        <h2>{stats.scope === 'platform' ? 'Platform Overview' : 'SOC Overview'}</h2>
        </div>
      </div>
      <div className="incident-buttons overview-actions">
        {stats.scope === 'tenant' && <button className="btn btn-primary" disabled={simulating} onClick={simulate}>
          <Play size={16} aria-hidden="true" />
          {simulating ? 'Generating…' : 'Ingest synthetic logs'}
        </button>}
        <button className="btn btn-secondary" onClick={refresh} disabled={dashboard.loading}>
          <RefreshCw size={16} aria-hidden="true" /> Refresh
        </button>
      </div>
    </header>
    {dashboard.error && <p className="muted" role="status">Refresh failed. Showing the last successful data.</p>}
    {stats.scope === 'platform' ? <>
      <Metrics items={[
        { label: 'Organizations', value: stats.tenants, icon: Building2, to: '/tenants' },
        { label: 'Active organizations', value: stats.active_tenants, icon: CheckSquare, to: '/tenants' },
        { label: 'Suspended organizations', value: stats.suspended_tenants, icon: Shield, to: '/tenants' },
        { label: 'Active accounts', value: stats.total_users, icon: Users, to: '/users' },
      ]} />
      <div className="dashboard-grid">
        <Breakdown title="Organizations by status" rows={[
          { label: 'Active', count: stats.active_tenants }, { label: 'Suspended', count: stats.suspended_tenants },
        ]} />
        <Breakdown title="Active accounts by role" rows={stats.users_by_role.map(row => ({ label: roleLabels[row.role] ?? row.role, count: row.count }))} />
      </div>
      <section className="panel page-stack">
        <div className="workspace-heading"><h3>Recently added organizations</h3><Link className="btn btn-secondary" to="/tenants">View organizations</Link></div>
        {stats.recent_tenants.length ? <div className="table-wrapper"><table className="data-table">
          <thead><tr><th>Organization</th><th>Code</th><th>Status</th><th>Created</th></tr></thead>
          <tbody>{stats.recent_tenants.map(tenant => <tr key={tenant.id}>
            <td>{tenant.name}</td><td>{tenant.code}</td><td>{tenant.status}</td><td>{formatDateTime(tenant.created_at)}</td>
          </tr>)}</tbody>
        </table></div> : <p className="muted">No organizations registered.</p>}
      </section>
    </> : <>
      <Metrics items={[
        { label: 'Events received · 24h', value: stats.events_24h, icon: Activity, to: '/events' },
        { label: 'New alerts', value: stats.total_alerts_new, icon: Bell, to: '/alerts' },
        { label: 'Active incidents', value: stats.active_incidents, icon: Shield, to: '/incidents' },
        { label: 'Open response tasks', value: stats.open_tasks, icon: ClipboardList, to: '/incidents' },
      ]} />
      <section className="panel page-stack">
        <h3>Events and alerts · Last 7 days</h3>
        {stats.activity.some(row => row.events || row.alerts) ? (
          <div className="dashboard-chart" role="img" aria-label={stats.activity.map(row => `${row.day}: ${row.events} events and ${row.alerts} alerts`).join('. ')}>
            <ResponsiveContainer width="100%" height={175}>
              <BarChart data={stats.activity} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
                <CartesianGrid vertical={false} stroke="var(--color-border)" />
                <XAxis dataKey="day" tickFormatter={value => value.slice(5)} stroke="var(--color-text-secondary)" />
                <YAxis allowDecimals={false} stroke="var(--color-text-secondary)" />
                <Tooltip contentStyle={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }} />
                <Legend />
                <Bar dataKey="events" name="Events" fill="var(--color-brand-button)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="alerts" name="Alerts" fill="var(--color-chart-alerts)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : <p className="muted">No events or alerts in this date range.</p>}
      </section>
      <div className="dashboard-grid">
        <AlertSeverity rows={stats.alerts_by_severity} />
        <Breakdown title="Incidents by Status" icon={Layers} rows={stats.incidents_by_status.map(row => ({ label: row.status, count: row.count }))} />
      </div>
      <section className="panel page-stack">
        <div className="workspace-heading"><h3 className="overview-panel-title"><List aria-hidden="true" /> Recent Alerts</h3><Link className="btn btn-secondary" to="/alerts">Open Alert Queue <ArrowRight size={16} aria-hidden="true" /></Link></div>
        {stats.recent_alerts.length ? <div className="table-wrapper"><table className="data-table">
          <thead><tr><th>Alert</th><th>Severity</th><th>Status</th><th>Created</th></tr></thead>
          <tbody>{stats.recent_alerts.map(alert => <tr key={alert.id}>
            <td><Link className="overview-alert-link" to={`/alerts/${alert.id}`}><TriangleAlert size={16} aria-hidden="true" />{alert.title}</Link></td>
            <td><SeverityBadge severity={alert.severity} /></td><td><StatusBadge status={alert.status} /></td>
            <td>{formatDateTime(alert.created_at)}</td>
          </tr>)}</tbody>
        </table></div> : <p className="muted">No alerts recorded.</p>}
      </section>
    </>}
  </section>;
}
