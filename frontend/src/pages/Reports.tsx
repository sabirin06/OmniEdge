import { useState } from 'react';
import { BarChart3, Plus } from 'lucide-react';
import { reportsApi } from '../api/reports';
import { useAuth } from '../contexts/AuthContext';
import { useApi } from '../hooks/useApi';
import { ReportForm } from '../components/forms/ReportForm';
import { ErrorState } from '../components/ui/ErrorState';
import { Pagination } from '../components/ui/Pagination';
import { useToast } from '../components/ui/Toast';
import { formatDateTime } from '../utils/formatters';
import type { Report } from '../types';

function Counts({ title, counts }: { title: string; counts: Record<string, number> }) {
  return <section className="panel page-stack">
    <h3>{title}</h3>
    <table className="data-table"><tbody>
      {Object.entries(counts).map(([label, value]) => <tr key={label}>
        <th scope="row">{label.replace(/_/g, ' ')}</th><td>{value.toLocaleString()}</td>
      </tr>)}
    </tbody></table>
  </section>;
}

function Snapshot({ report }: { report: Report }) {
  const { events, alerts, incidents, open_workload, method_version } = report.metrics;
  const hasMetrics = events && alerts && incidents && open_workload;
  const time = (minutes: number | null | undefined) => minutes == null ? 'No data' : `${minutes.toLocaleString()} min`;
  return <article className="page-stack">
    <header className="panel page-stack">
      <h3>{report.title}</h3>
      <p>{report.period_start} to {report.period_end}</p>
      <p className="muted">Saved {formatDateTime(report.created_at)}{report.generated_by_detail ? ` · ${report.generated_by_detail.email}` : ''}</p>
    </header>
    {hasMetrics ? <>
      <div className="dashboard-metrics report-metrics">
        {[
          ['Events received', events.total.toLocaleString()], ['Alerts created', alerts.total.toLocaleString()],
          ['Incidents opened', incidents.total.toLocaleString()], ['Open alerts at save', open_workload.alerts.toLocaleString()],
          ['Open incidents at save', open_workload.incidents.toLocaleString()],
          ...(method_version === 2 ? [['Mean detection time', time(report.metrics.mean_time_to_detect_minutes)],
            ['Mean resolution time', time(report.metrics.mean_time_to_respond_minutes)]] : []),
        ].map(([label, value]) => <div className="panel dashboard-metric" key={label}><div><p>{label}</p><strong>{value}</strong></div></div>)}
      </div>
      <div className="dashboard-grid">
        <Counts title="Alerts by severity" counts={alerts.by_severity} />
        <Counts title="Incident outcomes at save" counts={incidents.by_status} />
      </div>
      <p className="muted">Counts use the report dates. Open workload reflects the time the snapshot was saved.</p>
    </> : <section className="panel page-stack">
      <h3>Archived demo report</h3>
      <p>This snapshot contains seeded demonstration figures. Generate a new report for metrics from the database.</p>
    </section>}
  </article>;
}

export function Reports() {
  const { user } = useAuth();
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Report | null>(null);
  const [creating, setCreating] = useState(false);
  const reports = useApi(() => reportsApi.list({ page, search }), [page, search]);
  const canGenerate = user?.role === 'customer_admin' || user?.role === 'soc_lead';
  const rows = reports.data?.results ?? [];
  const report = selected ?? rows[0];

  return <section className="workspace-page">
    <header className="workspace-heading">
      <div><h2>Executive reports</h2><p>Saved tenant snapshots for event, alert, and incident activity.</p></div>
      {canGenerate && <button className="btn btn-primary" onClick={() => setCreating(true)}><Plus size={16} /> Generate report</button>}
    </header>
    <div className="report-layout">
      <aside className="panel page-stack">
        <h3>Saved reports</h3>
        <div className="form-group">
          <label htmlFor="report-search">Search reports</label>
          <input id="report-search" value={search} onChange={e => { setSearch(e.target.value); setPage(1); setSelected(null); }} />
        </div>
        {reports.error ? <ErrorState message="Could not load saved reports." onRetry={reports.refresh} /> :
          reports.loading ? <p role="status">Loading reports…</p> : rows.length ? (
            <ul className="report-list">
              {rows.map(row => <li key={row.id}><button type="button" aria-pressed={report?.id === row.id} onClick={() => setSelected(row)}>
                <span>{row.title}</span><small>{row.period_start} to {row.period_end}</small>
              </button></li>)}
            </ul>
          ) : <p className="muted">No reports found.</p>}
        <Pagination page={page} pageSize={50} total={reports.data?.count ?? 0}
          onPageChange={next => { setPage(next); setSelected(null); }} />
      </aside>
      {report ? <Snapshot report={report} /> : <div className="panel page-stack"><BarChart3 aria-hidden="true" /><p>Select a saved report to view its metrics.</p></div>}
    </div>
    {creating && <ReportForm onClose={() => setCreating(false)} onSaved={saved => {
      setCreating(false);
      setSelected(saved);
      setSearch('');
      setPage(1);
      reports.refresh();
      toast('success', 'Report snapshot saved.');
    }} />}
  </section>;
}
