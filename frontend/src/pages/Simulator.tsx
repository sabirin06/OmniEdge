import React, { useState } from 'react';
import { Play, Zap, CheckCircle2, ShieldAlert, AlertTriangle, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import { logSourcesApi } from '../api/logSources';
import { requestError } from '../api/errors';
import { eventsApi } from '../api/events';

export function Simulator() {
  const navigate = useNavigate();
  const sources = useApi(() => logSourcesApi.list({ enabled: true }));
  const [sourceId, setSourceId] = useState('');
  const [error, setError] = useState('');
  const [eventType, setEventType] = useState('login_failed');
  const [severity, setSeverity] = useState('high');
  const [batchCount, setBatchCount] = useState(5);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<Awaited<ReturnType<typeof eventsApi.simulate>>["data"] | null>(null);

  const handleSimulate = async (e: React.FormEvent) => {
    e.preventDefault();
    setRunning(true);
    setResult(null);
    setError('');
    try {
      const res = await eventsApi.simulate({
        batch_size: batchCount,
        event_type: eventType,
        severity,
        ...(sourceId ? { source_id: Number(sourceId) } : {}),
      });
      setResult(res.data);
    } catch (err) {
      setError(requestError(err, 'Simulation failed.'));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="page-container" style={{ padding: '24px', maxWidth: '1000px', margin: '0 auto' }}>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '700', margin: '0 0 4px 0' }}>Synthetic Telemetry Simulator</h1>
        <p style={{ margin: 0, color: 'var(--color-text-secondary)', fontSize: '13px' }}>
          Simulate real-time log ingestion to verify detection rule evaluation, alert generation, and tenant isolation
        </p>
      </div>

      <div className="card" style={{ padding: '24px', marginBottom: '24px' }}>
        <form onSubmit={handleSimulate}>
          <div className="form-group">
            <label htmlFor="simulator-source">Log source</label>
            <select id="simulator-source" value={sourceId} onChange={e => setSourceId(e.target.value)}>
              <option value="">Use an enabled source automatically</option>
              {sources.data?.results.map(source => <option value={source.id} key={source.id}>{source.name}</option>)}
            </select>
          </div>
          {sources.error && <p role="alert">Could not load log sources. <button type="button" className="btn btn-ghost" onClick={sources.refresh}>Retry</button></p>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px', marginBottom: '24px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', marginBottom: '8px', color: 'var(--color-text-secondary)' }}>
                Simulated Threat Scenario
              </label>
              <select
                value={eventType}
                onChange={e => setEventType(e.target.value)}
                style={{ width: '100%', padding: '10px', background: 'var(--color-canvas)', border: '1px solid #30363D', borderRadius: '6px', color: 'var(--color-text-primary)', fontSize: '13px' }}
              >
                <option value="login_failed">Brute Force Authentication Failure (login_failed)</option>
                <option value="privilege_escalation">Suspicious Sudo / Privilege Escalation (privilege_escalation)</option>
                <option value="data_transfer">High-Volume Data Egress Spike (data_transfer)</option>
                <option value="network_scan">Perimeter Port Reconnaissance (network_scan)</option>
                <option value="login_success">Benign User Authentication (login_success)</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', marginBottom: '8px', color: 'var(--color-text-secondary)' }}>
                Telemetry Severity Level
              </label>
              <select
                value={severity}
                onChange={e => setSeverity(e.target.value)}
                style={{ width: '100%', padding: '10px', background: 'var(--color-canvas)', border: '1px solid #30363D', borderRadius: '6px', color: 'var(--color-text-primary)', fontSize: '13px' }}
              >
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
                <option value="info">Info (Benign)</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', marginBottom: '8px', color: 'var(--color-text-secondary)' }}>
                Event Batch Volume (1 - 50)
              </label>
              <input
                type="number"
                min={1}
                max={50}
                value={batchCount}
                onChange={e => setBatchCount(Number(e.target.value))}
                style={{ width: '100%', padding: '10px', background: 'var(--color-canvas)', border: '1px solid #30363D', borderRadius: '6px', color: 'var(--color-text-primary)', fontSize: '13px', boxSizing: 'border-box' }}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={running}
            className="btn btn-primary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '12px 20px', fontSize: '14px' }}
          >
            <Play size={16} />
            <span>{running ? 'Ingesting synthetic logs...' : 'Inject Simulated Log Batch'}</span>
          </button>
        </form>
      </div>

      {error && <p className="form-error" role="alert">{error}</p>}
      {result && (
        <div className="card" style={{ padding: '24px', border: '1px solid #3FB950' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
            <CheckCircle2 size={20} color="#3FB950" />
            <h2 style={{ fontSize: '16px', fontWeight: '600', margin: 0, color: '#3FB950' }}>
              Simulation Batch Completed Successfully!
            </h2>
          </div>

          <p style={{ fontSize: '13px', color: '#C9D1D9', margin: '0 0 16px 0' }}>
            {result.created} events saved. {result.alerts_created} alerts created.
          </p>

          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              onClick={() => navigate('/alerts')}
              className="btn btn-primary"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <span>View Triggered Alerts</span>
              <ArrowRight size={15} />
            </button>
            <button
              onClick={() => navigate(`/events?event=${result.event_ids[0]}`)}
              className="btn btn-secondary"
            >
              Open First Event
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
