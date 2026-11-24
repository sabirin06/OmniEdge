import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ShieldAlert, AlertTriangle, Zap, CheckSquare,
  ArrowRight, RefreshCw, Plus, Play
} from 'lucide-react';
import { ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip } from 'recharts';
import { requestError } from '../api/errors';
import { useToast } from '../components/ui/Toast';
import { dashboardApi } from '../api/dashboard';
import { eventsApi } from '../api/events';
import { useAuth } from '../contexts/AuthContext';
import { SeverityBadge, StatusBadge } from '../components/ui/Badge';
import { formatRelative, SEVERITY_CHART_COLORS, STATUS_CHART_COLORS } from '../utils/formatters';

export function Dashboard() {
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [simulating, setSimulating] = useState(false);
  const [simMessage, setSimMessage] = useState<string | null>(null);

  const fetchStats = async () => {
    try {
      setLoading(true);
      const res = await dashboardApi.stats();
      setStats(res.data);
    } catch (err) {
      toast('error', requestError(err, 'Could not refresh the overview.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const handleQuickSimulate = async () => {
    setSimulating(true);
    setSimMessage(null);
    try {
      const res = await eventsApi.simulate({ batch_size: 3, event_type: 'login_failed' });
      setSimMessage(`${res.data.created} events saved. ${res.data.alerts_created} alerts created.`);
      await fetchStats();
      setTimeout(() => setSimMessage(null), 4000);
    } catch (err) {
      toast('error', requestError(err, 'Simulation failed.'));
    } finally {
      setSimulating(false);
    }
  };

  const severityData = (stats?.alerts_by_severity || []).filter((s: any) => s.count > 0);
  const incidentData = (stats?.incidents_by_status || []).map((i: any) => ({
    name: i.status.charAt(0).toUpperCase() + i.status.slice(1),
    count: i.count,
    fill: STATUS_CHART_COLORS[i.status] || 'var(--color-brand-button)'
  }));

  return (
    <div className="page-container" style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Top Banner / Actions */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '700', margin: '0 0 4px 0' }}>
            SOC Operations Overview
          </h1>
          <p style={{ margin: 0, color: 'var(--color-text-secondary, #8B949E)', fontSize: '13px' }}>
            Real-time telemetry, automated threat detection, and incident status
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={fetchStats}
            className="btn btn-secondary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            title="Refresh Metrics"
          >
            <RefreshCw size={15} className={loading ? 'spin' : ''} />
            <span>Refresh</span>
          </button>

          <button
            onClick={handleQuickSimulate}
            disabled={simulating}
            className="btn btn-primary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <Play size={15} />
            <span>{simulating ? 'Ingesting...' : 'Ingest Synthetic Logs'}</span>
          </button>
        </div>
      </div>

      {simMessage && (
        <div style={{
          padding: '12px 16px',
          background: 'rgba(63, 185, 80, 0.15)',
          border: '1px solid #3FB950',
          borderRadius: '8px',
          color: '#3FB950',
          fontSize: '13px',
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <Zap size={16} />
          <span>{simMessage}</span>
        </div>
      )}

      {/* Metric Stat Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
        gap: '16px',
        marginBottom: '24px'
      }}>
        <div className="card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '12px', fontWeight: '600', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>
              New Alerts
            </span>
            <div style={{ padding: '6px', borderRadius: '6px', background: 'rgba(88, 166, 255, 0.15)', color: 'var(--color-accent-hover)' }}>
              <ShieldAlert size={18} />
            </div>
          </div>
          <div style={{ fontSize: '28px', fontWeight: '700', color: 'var(--color-text-primary)' }}>
            {stats?.total_alerts_new ?? stats?.alerts?.new ?? 0}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
            {stats?.alerts?.total_open ?? 0} total active alerts in queue
          </div>
        </div>

        <div className="card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '12px', fontWeight: '600', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>
              Active Incidents
            </span>
            <div style={{ padding: '6px', borderRadius: '6px', background: 'rgba(255, 123, 114, 0.15)', color: '#FF7B72' }}>
              <AlertTriangle size={18} />
            </div>
          </div>
          <div style={{ fontSize: '28px', fontWeight: '700', color: 'var(--color-text-primary)' }}>
            {stats?.active_incidents ?? stats?.incidents?.total_active ?? 0}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
            {stats?.incidents?.containment ?? 0} in active containment
          </div>
        </div>

        <div className="card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '12px', fontWeight: '600', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>
              Events (24h)
            </span>
            <div style={{ padding: '6px', borderRadius: '6px', background: 'rgba(227, 179, 65, 0.15)', color: '#E3B341' }}>
              <Zap size={18} />
            </div>
          </div>
          <div style={{ fontSize: '28px', fontWeight: '700', color: 'var(--color-text-primary)' }}>
            {stats?.events_24h ?? stats?.events_last_24h ?? 0}
          </div>
          <div style={{ fontSize: '12px', color: '#3FB950', marginTop: '4px' }}>
            Ingestion telemetry active
          </div>
        </div>

        <div className="card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '12px', fontWeight: '600', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>
              Open Playbook Tasks
            </span>
            <div style={{ padding: '6px', borderRadius: '6px', background: 'rgba(63, 185, 80, 0.15)', color: '#3FB950' }}>
              <CheckSquare size={18} />
            </div>
          </div>
          <div style={{ fontSize: '28px', fontWeight: '700', color: 'var(--color-text-primary)' }}>
            {stats?.open_tasks ?? 0}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
            Assigned containment actions
          </div>
        </div>
      </div>

      {/* Visual Charts Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '20px', marginBottom: '24px' }}>
        {/* Severity Donut */}
        <div className="card" style={{ padding: '20px' }}>
          <h2 style={{ fontSize: '15px', fontWeight: '600', marginBottom: '16px', color: 'var(--color-text-primary)' }}>
            Alerts by Severity
          </h2>
          {severityData.length > 0 ? (
            <div style={{ width: '100%', height: '220px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={severityData}
                    dataKey="count"
                    nameKey="severity"
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={80}
                    paddingAngle={4}
                  >
                    {severityData.map((entry: any, index: number) => (
                      <Cell key={`cell-${index}`} fill={SEVERITY_CHART_COLORS[entry.severity] || 'var(--color-text-secondary)'} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: 'var(--color-surface)', border: '1px solid #30363D', borderRadius: '6px', color: 'var(--color-text-primary)' }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', flexWrap: 'wrap', marginTop: '8px' }}>
                {severityData.map((s: any) => (
                  <div key={s.severity} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}>
                    <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: SEVERITY_CHART_COLORS[s.severity] || 'var(--color-text-secondary)' }} />
                    <span style={{ textTransform: 'capitalize', color: 'var(--color-text-secondary)' }}>{s.severity}:</span>
                    <span style={{ fontWeight: '600', color: 'var(--color-text-primary)' }}>{s.count}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ height: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-secondary)' }}>
              No alert severity records to plot
            </div>
          )}
        </div>

        {/* Incident Status Bar */}
        <div className="card" style={{ padding: '20px' }}>
          <h2 style={{ fontSize: '15px', fontWeight: '600', marginBottom: '16px', color: 'var(--color-text-primary)' }}>
            Incidents by Lifecycle Status
          </h2>
          <div style={{ width: '100%', height: '220px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={incidentData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <XAxis dataKey="name" stroke='var(--color-text-secondary)' fontSize={11} tickLine={false} />
                <YAxis stroke='var(--color-text-secondary)' fontSize={11} tickLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ background: 'var(--color-surface)', border: '1px solid #30363D', borderRadius: '6px', color: 'var(--color-text-primary)' }}
                />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {incidentData.map((entry: any, index: number) => (
                    <Cell key={`bar-${index}`} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Recent Alerts Feed Table */}
      <div className="card" style={{ padding: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2 style={{ fontSize: '15px', fontWeight: '600', margin: 0, color: 'var(--color-text-primary)' }}>
            Live Alert Queue
          </h2>
          <button
            onClick={() => navigate('/alerts')}
            className="btn btn-ghost"
            style={{ fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
          >
            <span>View Full Queue</span>
            <ArrowRight size={14} />
          </button>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #30363D', color: 'var(--color-text-secondary)' }}>
                <th style={{ padding: '10px 12px' }}>Severity</th>
                <th style={{ padding: '10px 12px' }}>Alert Title</th>
                <th style={{ padding: '10px 12px' }}>Rule</th>
                <th style={{ padding: '10px 12px' }}>Status</th>
                <th style={{ padding: '10px 12px' }}>Time</th>
                <th style={{ padding: '10px 12px', textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {stats?.recent_alerts && stats.recent_alerts.length > 0 ? (
                stats.recent_alerts.map((alert: any) => (
                  <tr key={alert.id} style={{ borderBottom: '1px solid #21262D' }}>
                    <td style={{ padding: '10px 12px' }}>
                      <SeverityBadge severity={alert.severity} />
                    </td>
                    <td style={{ padding: '10px 12px', fontWeight: '500', color: 'var(--color-text-primary)' }}>
                      {alert.title}
                    </td>
                    <td style={{ padding: '10px 12px', color: 'var(--color-text-secondary)' }}>
                      {alert.rule_name || alert.rule_snapshot?.name || alert.rule_snapshot?.rule_name || 'Detection Rule'}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <StatusBadge status={alert.status} />
                    </td>
                    <td style={{ padding: '10px 12px', color: 'var(--color-text-secondary)' }}>
                      {formatRelative(alert.created_at)}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                      <button
                        onClick={() => navigate(`/alerts/${alert.id}`)}
                        className="btn btn-ghost btn-sm"
                        style={{ fontSize: '11px', color: 'var(--color-accent-hover)' }}
                      >
                        Inspect
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} style={{ padding: '24px', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
                    No alerts recorded. Click 'Ingest Synthetic Logs' above to simulate detection.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
