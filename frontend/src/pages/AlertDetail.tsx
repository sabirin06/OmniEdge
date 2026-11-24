import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Shield, Clock, User, AlertTriangle, CheckCircle, FileText } from 'lucide-react';
import { alertsApi } from '../api/alerts';
import { SeverityBadge, StatusBadge } from '../components/ui/Badge';
import { formatDateTime } from '../utils/formatters';

export function AlertDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [alert, setAlert] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) {
      alertsApi.get(Number(id))
        .then(res => setAlert(res.data))
        .catch(err => console.error(err))
        .finally(() => setLoading(false));
    }
  }, [id]);

  if (loading) return <div style={{ padding: '32px', textAlign: 'center', color: 'var(--color-text-secondary)' }}>Loading alert details...</div>;
  if (!alert) return <div style={{ padding: '32px', textAlign: 'center', color: '#FF7B72' }}>Alert record not found.</div>;

  return (
    <div className="page-container" style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      <button
        onClick={() => navigate('/alerts')}
        className="btn btn-ghost"
        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', marginBottom: '20px' }}
      >
        <ArrowLeft size={16} />
        <span>Back to Alert Queue</span>
      </button>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
            <SeverityBadge severity={alert.severity} />
            <StatusBadge status={alert.status} />
            <span style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>Alert #{alert.id}</span>
          </div>
          <h1 style={{ fontSize: '22px', fontWeight: '700', margin: 0 }}>{alert.title}</h1>
        </div>

        {alert.incident && (
          <button
            onClick={() => navigate(`/incidents/${alert.incident}`)}
            className="btn btn-primary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <FileText size={16} />
            <span>View Linked Incident</span>
          </button>
        )}
      </div>

      {alert.event && <button className="btn btn-ghost" onClick={() => navigate(`/events?event=${alert.event}`)}>Open linked event</button>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
        {/* Detection Metadata */}
        <div className="card" style={{ padding: '20px' }}>
          <h2 style={{ fontSize: '15px', fontWeight: '600', marginBottom: '16px' }}>Detection Context</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '13px' }}>
            <div>
              <span style={{ color: 'var(--color-text-secondary)', display: 'block', marginBottom: '2px' }}>Triggered Rule:</span>
              <span style={{ fontWeight: '600', color: 'var(--color-accent-hover)' }}>{alert.rule_name || alert.rule_snapshot?.name || alert.rule_snapshot?.rule_name || 'Detection Rule'}</span>
            </div>
            <div>
              <span style={{ color: 'var(--color-text-secondary)', display: 'block', marginBottom: '2px' }}>Detected Timestamp:</span>
              <span>{formatDateTime(alert.created_at)}</span>
            </div>
            <div>
              <span style={{ color: 'var(--color-text-secondary)', display: 'block', marginBottom: '2px' }}>Assigned Analyst:</span>
              <span>{alert.assignee?.full_name || alert.assignee_detail?.full_name || 'Unassigned'}</span>
            </div>
            <div>
              <span style={{ color: 'var(--color-text-secondary)', display: 'block', marginBottom: '2px' }}>Triage Notes:</span>
              <p style={{ margin: 0, color: '#C9D1D9', background: 'var(--color-canvas)', padding: '10px', borderRadius: '6px', border: '1px solid #30363D' }}>
                {alert.triage_notes || 'No triage notes provided yet.'}
              </p>
            </div>
            {alert.dismissal_reason && (
              <div>
                <span style={{ color: '#FF7B72', display: 'block', marginBottom: '2px' }}>Dismissal Reason:</span>
                <p style={{ margin: 0, color: '#FF7B72', background: 'rgba(255, 123, 114, 0.1)', padding: '10px', borderRadius: '6px', border: '1px solid #FF7B72' }}>
                  {alert.dismissal_reason}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Underlying Event Telemetry */}
        <div className="card" style={{ padding: '20px' }}>
          <h2 style={{ fontSize: '15px', fontWeight: '600', marginBottom: '16px' }}>Source Event Telemetry</h2>
          {alert.event_detail || alert.event ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '13px' }}>
              <div>
                <span style={{ color: 'var(--color-text-secondary)', display: 'block', marginBottom: '2px' }}>Event Type:</span>
                <span className="badge badge-subtle">{alert.event_detail?.event_type || alert.event?.event_type || 'Security Telemetry'}</span>
              </div>
              <div>
                <span style={{ color: 'var(--color-text-secondary)', display: 'block', marginBottom: '2px' }}>Severity Rating:</span>
                <span style={{ textTransform: 'capitalize' }}>{alert.event_detail?.severity || alert.event?.severity}</span>
              </div>
              <div>
                <span style={{ color: 'var(--color-text-secondary)', display: 'block', marginBottom: '2px' }}>Raw Payload & Metadata:</span>
                <pre style={{
                  margin: 0,
                  padding: '12px',
                  background: 'var(--color-canvas)',
                  border: '1px solid #30363D',
                  borderRadius: '6px',
                  fontSize: '12px',
                  overflowX: 'auto',
                  color: 'var(--color-accent-hover)',
                  fontFamily: 'monospace'
                }}>
                  {JSON.stringify(alert.rule_snapshot || alert.event_detail || {}, null, 2)}
                </pre>
              </div>
            </div>
          ) : (
            <p style={{ color: 'var(--color-text-secondary)', fontSize: '13px' }}>Underlying event details unavailable.</p>
          )}
        </div>
      </div>
    </div>
  );
}
