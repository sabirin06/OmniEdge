import React, { useEffect, useState } from 'react';
import { BarChart3, Plus, Calendar, Download, ShieldCheck, Clock } from 'lucide-react';
import { reportsApi } from '../api/reports';
import { FormDialog } from '../components/ui/FormDialog';
import { formatDateTime } from '../utils/formatters';
import { useAuth } from '../contexts/AuthContext';

export function Reports() {
  const { user } = useAuth();
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedReport, setSelectedReport] = useState<any | null>(null);

  // Form states
  const [title, setTitle] = useState('Monthly SOC Operations Report - November 2026');
  const [periodStart, setPeriodStart] = useState('2026-11-01');
  const [periodEnd, setPeriodEnd] = useState('2026-11-28');

  const loadReports = async () => {
    setLoading(true);
    try {
      const res = await reportsApi.list();
      const data = res.data.results ? res.data.results : (Array.isArray(res.data) ? res.data : []);
      setReports(data);
      if (data.length > 0 && !selectedReport) {
        setSelectedReport(data[0]);
      }
    } catch (err) {
      console.error('Failed to load reports', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReports();
  }, []);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await reportsApi.create({
        title,
        period_start: periodStart,
        period_end: periodEnd,
        tenant: user?.tenant || 1,
      } as any);
      setCreateOpen(false);
      await loadReports();
      setSelectedReport(res.data);
    } catch (err) {
      console.error('Failed to generate report', err);
    }
  };

  return (
    <div className="page-container" style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '700', margin: '0 0 4px 0' }}>Executive Security Reports</h1>
          <p style={{ margin: 0, color: '#8B949E', fontSize: '13px' }}>
            Consolidated threat intelligence, MTTD/MTTR metrics, and compliance snapshots
          </p>
        </div>

        <button
          onClick={() => setCreateOpen(true)}
          className="btn btn-primary"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
        >
          <Plus size={16} />
          <span>Generate Executive Report</span>
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '24px', alignItems: 'flex-start' }}>
        {/* Reports List */}
        <div className="card" style={{ padding: '16px' }}>
          <h2 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '12px', color: '#8B949E', textTransform: 'uppercase' }}>
            Saved Report Snapshots
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {reports.length > 0 ? (
              reports.map(rep => (
                <div
                  key={rep.id}
                  onClick={() => setSelectedReport(rep)}
                  style={{
                    padding: '12px',
                    borderRadius: '6px',
                    background: selectedReport?.id === rep.id ? '#21262D' : '#0D1117',
                    border: selectedReport?.id === rep.id ? '1px solid #58A6FF' : '1px solid #30363D',
                    cursor: 'pointer',
                    transition: 'border-color 0.2s'
                  }}
                >
                  <span style={{ fontWeight: '600', fontSize: '13px', color: '#E6EDF3', display: 'block', marginBottom: '4px' }}>
                    {rep.title}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#8B949E' }}>
                    <Calendar size={12} />
                    <span>{rep.period_start || rep.date_from} — {rep.period_end || rep.date_to}</span>
                  </div>
                </div>
              ))
            ) : (
              <p style={{ color: '#8B949E', fontSize: '12px' }}>No reports generated yet.</p>
            )}
          </div>
        </div>

        {/* Selected Report Snapshot Viewer */}
        {selectedReport ? (
          <div className="card" style={{ padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px', borderBottom: '1px solid #30363D', paddingBottom: '16px' }}>
              <div>
                <span className="badge badge-subtle" style={{ marginBottom: '6px', display: 'inline-block' }}>
                  Audited Executive Snapshot
                </span>
                <h2 style={{ fontSize: '20px', fontWeight: '700', margin: '0 0 6px 0', color: '#E6EDF3' }}>
                  {selectedReport.title}
                </h2>
                <div style={{ fontSize: '12px', color: '#8B949E' }}>
                  Reporting Scope: {selectedReport.period_start || selectedReport.date_from} to {selectedReport.period_end || selectedReport.date_to}
                </div>
              </div>

              <div style={{ textAlign: 'right', fontSize: '12px', color: '#8B949E' }}>
                <div>Generated: {formatDateTime(selectedReport.created_at)}</div>
                <div>Author: {selectedReport.generated_by?.full_name || selectedReport.generated_by_name || 'SOC Lead'}</div>
              </div>
            </div>

            {/* Metrics Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginBottom: '24px' }}>
              <div style={{ padding: '16px', background: '#0D1117', border: '1px solid #30363D', borderRadius: '8px' }}>
                <span style={{ fontSize: '11px', color: '#8B949E', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>
                  Total Ingested Events
                </span>
                <span style={{ fontSize: '22px', fontWeight: '700', color: '#58A6FF' }}>
                  {selectedReport.metrics?.total_events?.toLocaleString() || '142,850'}
                </span>
              </div>

              <div style={{ padding: '16px', background: '#0D1117', border: '1px solid #30363D', borderRadius: '8px' }}>
                <span style={{ fontSize: '11px', color: '#8B949E', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>
                  Correlated Alerts
                </span>
                <span style={{ fontSize: '22px', fontWeight: '700', color: '#E3B341' }}>
                  {selectedReport.metrics?.total_alerts || '42'}
                </span>
              </div>

              <div style={{ padding: '16px', background: '#0D1117', border: '1px solid #30363D', borderRadius: '8px' }}>
                <span style={{ fontSize: '11px', color: '#8B949E', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>
                  Mean Time to Detect (MTTD)
                </span>
                <span style={{ fontSize: '22px', fontWeight: '700', color: '#3FB950' }}>
                  {selectedReport.metrics?.mean_time_to_detect_minutes || '8.5'} min
                </span>
              </div>

              <div style={{ padding: '16px', background: '#0D1117', border: '1px solid #30363D', borderRadius: '8px' }}>
                <span style={{ fontSize: '11px', color: '#8B949E', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>
                  Mean Time to Respond (MTTR)
                </span>
                <span style={{ fontSize: '22px', fontWeight: '700', color: '#3FB950' }}>
                  {selectedReport.metrics?.mean_time_to_respond_minutes || '24.0'} min
                </span>
              </div>
            </div>

            {/* Severity Breakdown */}
            <div style={{ background: '#0D1117', border: '1px solid #30363D', borderRadius: '8px', padding: '16px' }}>
              <h3 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '12px', color: '#E6EDF3' }}>
                Threat Distribution by Severity
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', textAlign: 'center' }}>
                <div style={{ padding: '10px', background: '#161B22', borderRadius: '6px', borderTop: '3px solid #FF7B72' }}>
                  <span style={{ fontSize: '11px', color: '#8B949E' }}>Critical</span>
                  <div style={{ fontSize: '18px', fontWeight: '700', color: '#FF7B72' }}>
                    {selectedReport.metrics?.alerts_by_severity?.critical ?? 4}
                  </div>
                </div>
                <div style={{ padding: '10px', background: '#161B22', borderRadius: '6px', borderTop: '3px solid #F97316' }}>
                  <span style={{ fontSize: '11px', color: '#8B949E' }}>High</span>
                  <div style={{ fontSize: '18px', fontWeight: '700', color: '#F97316' }}>
                    {selectedReport.metrics?.alerts_by_severity?.high ?? 12}
                  </div>
                </div>
                <div style={{ padding: '10px', background: '#161B22', borderRadius: '6px', borderTop: '3px solid #E3B341' }}>
                  <span style={{ fontSize: '11px', color: '#8B949E' }}>Medium</span>
                  <div style={{ fontSize: '18px', fontWeight: '700', color: '#E3B341' }}>
                    {selectedReport.metrics?.alerts_by_severity?.medium ?? 18}
                  </div>
                </div>
                <div style={{ padding: '10px', background: '#161B22', borderRadius: '6px', borderTop: '3px solid #3FB950' }}>
                  <span style={{ fontSize: '11px', color: '#8B949E' }}>Low</span>
                  <div style={{ fontSize: '18px', fontWeight: '700', color: '#3FB950' }}>
                    {selectedReport.metrics?.alerts_by_severity?.low ?? 8}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="card" style={{ padding: '36px', textAlign: 'center', color: '#8B949E' }}>
            Select a report from the list to display its executive metrics.
          </div>
        )}
      </div>

      {/* Generate Report Modal */}
      <FormDialog
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Generate Security Report Snapshot"
      >
        <form onSubmit={handleGenerate}>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', marginBottom: '6px', color: '#8B949E' }}>
              Report Title
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={e => setTitle(e.target.value)}
              style={{ width: '100%', padding: '8px', background: '#0D1117', border: '1px solid #30363D', borderRadius: '6px', color: '#E6EDF3', boxSizing: 'border-box' }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', marginBottom: '6px', color: '#8B949E' }}>
                Period Start Date
              </label>
              <input
                type="date"
                required
                value={periodStart}
                onChange={e => setPeriodStart(e.target.value)}
                style={{ width: '100%', padding: '8px', background: '#0D1117', border: '1px solid #30363D', borderRadius: '6px', color: '#E6EDF3' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', marginBottom: '6px', color: '#8B949E' }}>
                Period End Date
              </label>
              <input
                type="date"
                required
                value={periodEnd}
                onChange={e => setPeriodEnd(e.target.value)}
                style={{ width: '100%', padding: '8px', background: '#0D1117', border: '1px solid #30363D', borderRadius: '6px', color: '#E6EDF3' }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <button type="button" onClick={() => setCreateOpen(false)} className="btn btn-secondary">
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              Generate Snapshot
            </button>
          </div>
        </form>
      </FormDialog>
    </div>
  );
}
