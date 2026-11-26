import { useState } from 'react';
import { Activity, Bell, Download, Filter, Shield, ArrowDownUp } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { reportsApi, type ReportAnalytics, type ReportFilters, type ReportRecord } from '../api/reports';
import { requestError } from '../api/errors';
import { useAuth } from '../contexts/AuthContext';
import { useApi } from '../hooks/useApi';
import { dateInput } from '../components/forms/ReportForm';
import { ErrorState } from '../components/ui/ErrorState';
import { Pagination } from '../components/ui/Pagination';
import { useToast } from '../components/ui/Toast';
import { formatDateTime } from '../utils/formatters';
import { isAxiosError } from 'axios';
import { Link } from 'react-router-dom';

const seriesInfo = {
  events: { title: 'Events received', icon: Activity, color: 'var(--color-brand-button)' },
  alerts: { title: 'Alerts created', icon: Bell, color: 'var(--color-chart-alerts)' },
  incidents: { title: 'Incidents opened', icon: Shield, color: 'var(--color-success)' },
};
const alertStatuses = ['new', 'in_review', 'dismissed', 'escalated', 'resolved'];
const incidentStatuses = ['open', 'investigating', 'containment', 'resolved', 'closed'];
const labels = (value: string) => value.replace(/_/g, ' ').replace(/^./, letter => letter.toUpperCase());
const range = (days: number) => {
  const end = new Date();
  const start = new Date(end.getFullYear(), end.getMonth(), end.getDate() - days + 1);
  return { period_start: dateInput(start), period_end: dateInput(end) };
};

function Analytics({ data }: { data: ReportAnalytics }) {
  const severityRows = data.breakdown.filter(row => row.dimension === 'severity');
  const maxSeverity = Math.max(1, ...severityRows.map(row => row.count));
  return <div className="page-stack report-analytics">
    <div className="report-kpis">
      {data.series.map(key => {
        const { icon: Icon, title, color } = seriesInfo[key];
        return <section className="panel report-kpi" key={key}>
          <span className="report-kpi-icon" style={{ color }}><Icon size={23} aria-hidden="true" /></span>
          <div><p>{title}</p><strong>{(data.totals[key] ?? 0).toLocaleString()}</strong></div>
        </section>;
      })}
    </div>
    <div className="report-charts">
      <section className="panel page-stack">
        <h3>Activity over time</h3>
        {data.series.some(key => data.totals[key]) ? <div className="report-chart">
          <ResponsiveContainer width="100%" height={265}>
            <BarChart data={data.daily} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--color-border)" />
              <XAxis dataKey="date" tickFormatter={date => date.slice(5)} stroke="var(--color-text-secondary)" />
              <YAxis allowDecimals={false} stroke="var(--color-text-secondary)" />
              <Tooltip contentStyle={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }} />
              <Legend />
              {data.series.map(key => <Bar key={key} dataKey={key} name={seriesInfo[key].title} fill={seriesInfo[key].color} radius={[4, 4, 0, 0]} />)}
            </BarChart>
          </ResponsiveContainer>
        </div> : <p className="report-empty muted">No matching activity in this date range.</p>}
      </section>
      <section className="panel page-stack">
        <h3>Severity and status breakdown</h3>
        {!!severityRows.length && <ul className="report-distribution" aria-label="Severity distribution">
          {severityRows.map(row => <li key={`${row.type}-${row.value}`}>
            <span>{labels(row.type)} / {labels(row.value)}</span>
            <meter value={row.count} max={maxSeverity} aria-label={`${labels(row.type)} / ${labels(row.value)}`} />
            <strong>{row.count.toLocaleString()}</strong>
          </li>)}
        </ul>}
        {data.breakdown.length ? <div className="table-wrapper"><table className="data-table">
          <thead><tr><th>Type</th><th>Dimension</th><th>Value</th><th>Count</th></tr></thead>
          <tbody>{data.breakdown.map(row => <tr key={[row.type, row.dimension, row.value].join(':')}>
            <td>{labels(row.type)}</td><td>{labels(row.dimension)}</td><td>{labels(row.value)}</td><td>{row.count.toLocaleString()}</td>
          </tr>)}</tbody>
        </table></div> : <p className="muted">No results for the selected filters.</p>}
      </section>
    </div>
  </div>;
}

const recordTypes = { events: 'Event', alerts: 'Alert', incidents: 'Incident' };

function DetailedRecords({ filters }: { filters: ReportFilters }) {
  const toast = useToast();
  const [draft, setDraft] = useState('');
  const [search, setSearch] = useState('');
  const [ordering, setOrdering] = useState('-record_date');
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  const params = { ...filters, search, ordering };
  const records = useApi(() => reportsApi.records(params, page), [search, ordering, page]);
  const result = records.data;
  const columns: { key: keyof ReportRecord; title: string }[] = [
    ...(filters.report_type === 'overview' ? [{ key: 'record_type' as const, title: 'Type' }] : []),
    { key: 'record_id', title: 'ID' },
    { key: 'record_date', title: filters.report_type === 'events' ? 'Received' : 'Date and time' },
    { key: 'record_title', title: filters.report_type === 'events' ? 'Message' : 'Record' },
    { key: 'record_severity', title: 'Severity' },
    ...(filters.report_type !== 'events' ? [{ key: 'record_status' as const, title: 'Status' }] : []),
    { key: 'record_context', title: {
      events: 'Event type', alerts: 'Detection rule', incidents: 'Case reference', overview: 'Context',
    }[filters.report_type] },
  ];

  function display(row: ReportRecord, field: keyof ReportRecord) {
    const value = row[field];
    switch (field) {
      case 'record_type': return recordTypes[row.record_type];
      case 'record_date': return <time dateTime={row.record_date}>{formatDateTime(row.record_date)}</time>;
      case 'record_id': return <Link to={row.record_type === 'events' ? `/events?event=${value}` : `/${row.record_type}/${value}`}>#{value}</Link>;
      case 'record_severity':
      case 'record_status': return value ? labels(String(value)) : '-';
      default: return value || '-';
    }
  }

  async function download(format: 'pdf' | 'csv') {
    if (!result?.count || records.loading || records.error || exporting) return;
    if (format === 'pdf' && result.count > 1000) {
      toast('warning', 'PDF exports support up to 1,000 records. Narrow your search or download CSV.');
      return;
    }
    setExporting(true);
    try {
      const response = await reportsApi.exportRecords(params, format);
      const url = URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = `omniedge-${filters.report_type}-records-${filters.period_start}-${filters.period_end}.${format}`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast('success', `${format.toUpperCase()} records downloaded.`);
    } catch (error) {
      const response = isAxiosError(error) ? error.response : undefined;
      let message = requestError(error, 'Could not download the records.');
      if (format === 'pdf' && response?.status === 400 && response.data instanceof Blob) {
        const body = await response.data.text();
        if (body.includes('1,000 records')) message = 'PDF exports support up to 1,000 records. Narrow your search or download CSV.';
      }
      toast('error', message);
    } finally {
      setExporting(false);
    }
  }

  return <section className="panel page-stack" aria-labelledby="report-records-title">
    <div className="workspace-heading">
      <div><h3 id="report-records-title">Detailed records</h3></div>
      <div className="incident-buttons">
        {(['csv', 'pdf'] as const).map(format => <button key={format} type="button" className="btn btn-secondary"
          disabled={!result?.count || records.loading || !!records.error || exporting} onClick={() => download(format)}
          aria-label={`Export ${format.toUpperCase()}`} title={`Export ${format.toUpperCase()}`}>
          <Download size={16} aria-hidden="true" /><span aria-hidden="true">{format.toUpperCase()}</span>
        </button>)}
      </div>
    </div>
    <form className="report-record-search" onSubmit={event => {
      event.preventDefault(); setSearch(draft.trim()); setPage(1);
    }}>
      <div><input id="report-record-search" type="search" aria-label="Search records" maxLength={200} value={draft}
          placeholder="Search by ID, title, or context" onChange={event => setDraft(event.target.value)} /></div>
      <button className="btn btn-primary">Search</button>
      {search && <button type="button" className="btn btn-ghost" onClick={() => { setDraft(''); setSearch(''); setPage(1); }}>Clear</button>}
    </form>
    {records.error ? <ErrorState message={records.error} onRetry={records.refresh} /> :
      records.loading ? <p role="status">Loading records...</p> :
      !result?.count ? <p className="muted">No matching records.</p> : <>
        <p className="muted" role="status">{result.count.toLocaleString()} matching records</p>
        <div className="table-wrapper report-record-scroll" tabIndex={0} role="region" aria-label="Detailed records table"><table className="data-table report-record-table">
          <thead><tr>{columns.map(({ key, title }) => {
            const active = ordering === key || ordering === `-${key}`;
            return <th key={key} scope="col" aria-sort={active ? (ordering.startsWith('-') ? 'descending' : 'ascending') : undefined}>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => {
                setOrdering(ordering === key ? `-${key}` : key); setPage(1);
              }}>{title} <ArrowDownUp size={13} aria-hidden="true" /></button>
            </th>;
          })}</tr></thead>
          <tbody>{result.results.map(row => <tr key={`${row.record_type}-${row.record_id}`}>
            {columns.map(({ key }) => <td key={key} className={key === 'record_title' ? 'report-record-title' : undefined}>{display(row, key)}</td>)}
          </tr>)}</tbody>
        </table></div>
        <Pagination page={page} pageSize={25} total={result.count} onPageChange={setPage} />
      </>}
  </section>;
}

export function Reports() {
  const { user } = useAuth();
  const [filters, setFilters] = useState<ReportFilters>(() => ({ ...range(7), report_type: 'overview', severity: '', status: '' }));
  const { period_start, period_end, report_type, severity, status } = filters;
  const scoped = { ...filters, tenant: user?.tenant ?? undefined };
  const valid = !!period_start && !!period_end && period_start <= period_end &&
    Date.parse(period_end) - Date.parse(period_start) < 366 * 86400000;
  const analytics = useApi(() => valid ? reportsApi.analytics(scoped) : Promise.resolve({ data: null } as Awaited<ReturnType<typeof reportsApi.analytics>>),
    [period_start, period_end, report_type, severity, status, scoped.tenant]);
  const data = analytics.data;
  const current = data && !analytics.loading && !analytics.error && data.tenant.id === scoped.tenant &&
    Object.entries(filters).every(([key, value]) => data.filters[key as keyof ReportFilters] === value);
  const statuses = report_type === 'events' ? [] : report_type === 'alerts' ? alertStatuses :
    report_type === 'incidents' ? incidentStatuses : [...new Set([...alertStatuses, ...incidentStatuses])];

  return <section className="workspace-page report-workspace">
    <section className="panel page-stack" aria-labelledby="report-filter-title">
      <div className="workspace-heading">
        <h3 id="report-filter-title" className="overview-panel-title"><Filter aria-hidden="true" /> Report filters</h3>
        <div className="incident-buttons">
          {[7, 30, 90].map(days => <button key={days} className="btn btn-secondary btn-sm"
            onClick={() => setFilters(previous => ({ ...previous, ...range(days) }))}>Last {days} days</button>)}
        </div>
      </div>
      <div className="report-filter-grid">
        <label>Start date<input type="date" aria-invalid={!valid} aria-describedby={!valid ? 'report-range-error' : undefined}
          value={period_start} onChange={e => setFilters({ ...filters, period_start: e.target.value })} /></label>
        <label>End date<input type="date" aria-invalid={!valid} aria-describedby={!valid ? 'report-range-error' : undefined}
          value={period_end} onChange={e => setFilters({ ...filters, period_end: e.target.value })} /></label>
        <label>Tenant<select value={scoped.tenant ?? ''} onChange={() => analytics.refresh()}>
          <option value={scoped.tenant ?? ''}>{user?.tenant_detail?.name ?? data?.tenant.name ?? 'Current organization'}</option>
        </select></label>
        <label>Report type<select value={report_type} onChange={e => setFilters({ ...filters, report_type: e.target.value as ReportFilters['report_type'], status: '' })}>
          <option value="overview">All activity</option><option value="events">Events</option>
          <option value="alerts">Alerts</option><option value="incidents">Incidents</option>
        </select></label>
        <label>Severity<select value={severity} onChange={e => setFilters({ ...filters, severity: e.target.value })}>
          <option value="">All severities</option>
          {['low', 'medium', 'high', 'critical'].map(value => <option key={value} value={value}>{labels(value)}</option>)}
        </select></label>
        <label>Status<select value={status} disabled={!statuses.length} onChange={e => setFilters({ ...filters, status: e.target.value })}>
          <option value="">{statuses.length ? 'All statuses' : 'Events have no status'}</option>
          {statuses.map(value => <option key={value} value={value}>{labels(value)}</option>)}
        </select></label>
      </div>
      {!valid && <p id="report-range-error" className="form-error" role="alert">Choose a valid date range of up to 366 days.</p>}
      {status && report_type === 'overview' && <p className="muted">Status filters include only record types that use the selected status.</p>}
    </section>
    {valid && (analytics.error ? <ErrorState message={analytics.error} onRetry={analytics.refresh} /> :
      current ? <Analytics key={JSON.stringify(filters)} data={data} /> : <p role="status">Loading report data...</p>)}
    {valid && report_type !== 'overview' && <DetailedRecords key={JSON.stringify(scoped)} filters={scoped} />}
  </section>;
}
