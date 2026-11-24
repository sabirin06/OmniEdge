import { Pagination } from '../components/ui/Pagination';
import { useApi } from '../hooks/useApi';
import { requestError } from '../api/errors';
import { useToast } from '../components/ui/Toast';
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell, Search, Filter, ShieldAlert, CheckCircle,
  XCircle, ArrowUpRight, UserCheck
} from 'lucide-react';
import { alertsApi, TriagePayload, DismissPayload } from '../api/alerts';
import { SeverityBadge, StatusBadge } from '../components/ui/Badge';
import { formatRelative } from '../utils/formatters';
import { FormDialog } from '../components/ui/FormDialog';
import { useAuth } from '../contexts/AuthContext';

export function Alerts() {
  const toast = useToast();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [severityFilter, setSeverityFilter] = useState('');

  // Modals state
  const [activeAlert, setActiveAlert] = useState<any | null>(null);
  const [triageOpen, setTriageOpen] = useState(false);
  const [dismissOpen, setDismissOpen] = useState(false);
  const [escalateOpen, setEscalateOpen] = useState(false);

  // Form states
  const [triageSeverity, setTriageSeverity] = useState('high');
  const [triageNotes, setTriageNotes] = useState('');
  const [dismissReason, setDismissReason] = useState('');
  const [escalateTitle, setEscalateTitle] = useState('');

  const [page, setPage] = useState(1);
  const listing = useApi(() => alertsApi.list({ page, search, status: statusFilter, severity: severityFilter }), [page, search, statusFilter, severityFilter]);
  const alerts = listing.data?.results ?? [];
  const loading = listing.loading;
  const loadAlerts = listing.refresh;

  const handleClaim = async (alertId: number) => {
    try {
      await alertsApi.claim(alertId);
      await loadAlerts();
    } catch (err) {
      toast('error', requestError(err, 'Failed to claim alert.'));
    }
  };

  const handleTriageSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeAlert) return;
    try {
      await alertsApi.triage(activeAlert.id, { severity: triageSeverity, notes: triageNotes });
      setTriageOpen(false);
      await loadAlerts();
    } catch (err) {
      toast('error', requestError(err, 'Failed to triage alert.'));
    }
  };

  const handleDismissSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeAlert) return;
    try {
      await alertsApi.dismiss(activeAlert.id, { reason: dismissReason });
      setDismissOpen(false);
      await loadAlerts();
    } catch (err) {
      toast('error', requestError(err, 'Failed to dismiss alert.'));
    }
  };

  const handleEscalateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeAlert) return;
    try {
      const result = await alertsApi.escalate(activeAlert.id, { title: escalateTitle.trim() || undefined });
      setEscalateOpen(false);
      await loadAlerts();
      navigate(`/incidents/${result.data.id}`);
    } catch (err) {
      toast('error', requestError(err, 'Failed to escalate alert.'));
    }
  };


  return (
    <div className="page-container" style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '700', margin: '0 0 4px 0' }}>Alert Queue</h1>
          <p style={{ margin: 0, color: 'var(--color-text-secondary)', fontSize: '13px' }}>
            Triaged security detections awaiting analyst review and incident escalation
          </p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="card" style={{ padding: '16px', marginBottom: '20px', display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1', minWidth: '220px' }}>
          <Search size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-secondary)' }} />
          <input
            type="text"
            placeholder="Search alerts by title or assignee..."
            value={search}
            onChange={e => { setPage(1); setSearch(e.target.value); }}
            style={{
              width: '100%',
              padding: '8px 10px 8px 32px',
              background: 'var(--color-canvas)',
              border: '1px solid #30363D',
              borderRadius: '6px',
              color: 'var(--color-text-primary)',
              fontSize: '13px',
              boxSizing: 'border-box'
            }}
          />
        </div>

        <select
          value={statusFilter}
          onChange={e => { setPage(1); setStatusFilter(e.target.value); }}
          style={{ padding: '8px 12px', background: 'var(--color-canvas)', border: '1px solid #30363D', borderRadius: '6px', color: 'var(--color-text-primary)', fontSize: '13px' }}
        >
          <option value="">All Statuses</option>
          <option value="new">New</option>
          <option value="in_review">In Review</option>
          <option value="escalated">Escalated</option>
          <option value="resolved">Resolved</option>
          <option value="dismissed">Dismissed</option>
        </select>

        <select
          value={severityFilter}
          onChange={e => { setPage(1); setSeverityFilter(e.target.value); }}
          style={{ padding: '8px 12px', background: 'var(--color-canvas)', border: '1px solid #30363D', borderRadius: '6px', color: 'var(--color-text-primary)', fontSize: '13px' }}
        >
          <option value="">All Severities</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
          <option value="info">Info</option>
        </select>
      </div>

      {/* Alerts Table */}
      <div className="card" style={{ padding: '0', overflowX: 'auto' }}>
        <div style={{ overflowX: 'auto' }}>
          {listing.error && <p role="alert">Could not load records. <button className="btn btn-ghost" onClick={listing.refresh}>Retry</button></p>}
        <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: 'var(--color-surface)', borderBottom: '1px solid #30363D', color: 'var(--color-text-secondary)' }}>
                <th style={{ padding: '12px 16px' }}>Severity</th>
                <th style={{ padding: '12px 16px' }}>Alert Title</th>
                <th style={{ padding: '12px 16px' }}>Rule</th>
                <th style={{ padding: '12px 16px' }}>Status</th>
                <th style={{ padding: '12px 16px' }}>Assignee</th>
                <th style={{ padding: '12px 16px' }}>Time</th>
                <th style={{ padding: '12px 16px', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {alerts.length > 0 ? (
                alerts.map(alert => (
                  <tr key={alert.id} style={{ borderBottom: '1px solid #21262D' }}>
                    <td style={{ padding: '12px 16px' }}>
                      <SeverityBadge severity={alert.severity} />
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span
                        style={{ fontWeight: '600', color: 'var(--color-text-primary)', cursor: 'pointer' }}
                        onClick={() => navigate(`/alerts/${alert.id}`)}
                      >
                        {alert.title}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', color: 'var(--color-text-secondary)' }}>
                      {alert.rule_name || alert.rule_snapshot?.name || alert.rule_snapshot?.rule_name || 'Detection Rule'}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <StatusBadge status={alert.status} />
                    </td>
                    <td style={{ padding: '12px 16px', color: 'var(--color-text-secondary)' }}>
                      {alert.assignee_detail?.full_name || (
                        <span style={{ color: '#6E7681', fontStyle: 'italic' }}>Unassigned</span>
                      )}
                    </td>
                    <td style={{ padding: '12px 16px', color: 'var(--color-text-secondary)' }}>
                      {formatRelative(alert.created_at)}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: '6px' }}>
                        {alert.status === 'new' && (
                          <button
                            onClick={() => handleClaim(alert.id)}
                            className="btn btn-ghost btn-sm"
                            style={{ fontSize: '11px', color: '#3FB950' }}
                            title="Claim Alert"
                          >
                            <UserCheck size={14} style={{ marginRight: '4px' }} />
                            Claim
                          </button>
                        )}

                        {alert.status !== 'dismissed' && alert.status !== 'resolved' && (
                          <>
                            <button
                              onClick={() => {
                                setActiveAlert(alert);
                                setTriageSeverity(alert.severity);
                                setTriageNotes(alert.triage_notes || '');
                                setTriageOpen(true);
                              }}
                              className="btn btn-ghost btn-sm"
                              style={{ fontSize: '11px', color: 'var(--color-accent-hover)' }}
                            >
                              Triage
                            </button>

                            {alert.status !== 'escalated' && (
                              <button
                                onClick={() => {
                                  setActiveAlert(alert);
                                  setEscalateTitle(`Incident: ${alert.title}`);
                                  setEscalateOpen(true);
                                }}
                                className="btn btn-ghost btn-sm"
                                style={{ fontSize: '11px', color: '#F97316' }}
                              >
                                Escalate
                              </button>
                            )}

                            <button
                              onClick={() => {
                                setActiveAlert(alert);
                                setDismissReason('');
                                setDismissOpen(true);
                              }}
                              className="btn btn-ghost btn-sm"
                              style={{ fontSize: '11px', color: '#FF7B72' }}
                            >
                              Dismiss
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} style={{ padding: '36px', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
                    {loading ? 'Loading alert queue...' : 'No alerts match your filter criteria.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        <Pagination page={page} pageSize={50} total={listing.data?.count ?? 0} onPageChange={setPage} />
        </div>
      </div>

      {/* Triage Modal */}
      <FormDialog
        isOpen={triageOpen}
        onClose={() => setTriageOpen(false)}
        title={`Triage Alert #${activeAlert?.id}`}
      >
        <form onSubmit={handleTriageSubmit}>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', marginBottom: '6px', color: 'var(--color-text-secondary)' }}>
              Updated Severity
            </label>
            <select
              value={triageSeverity}
              onChange={e => setTriageSeverity(e.target.value)}
              style={{ width: '100%', padding: '8px', background: 'var(--color-canvas)', border: '1px solid #30363D', borderRadius: '6px', color: 'var(--color-text-primary)' }}
            >
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
              <option value="info">Info</option>
            </select>
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', marginBottom: '6px', color: 'var(--color-text-secondary)' }}>
              Analyst Triage Assessment Notes
            </label>
            <textarea
              rows={4}
              value={triageNotes}
              onChange={e => setTriageNotes(e.target.value)}
              placeholder="Document observed threat indicators, affected assets, or findings..."
              style={{ width: '100%', padding: '8px', background: 'var(--color-canvas)', border: '1px solid #30363D', borderRadius: '6px', color: 'var(--color-text-primary)', boxSizing: 'border-box' }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <button type="button" onClick={() => setTriageOpen(false)} className="btn btn-secondary">
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              Save Triage
            </button>
          </div>
        </form>
      </FormDialog>

      {/* Dismiss Modal */}
      <FormDialog
        isOpen={dismissOpen}
        onClose={() => setDismissOpen(false)}
        title={`Dismiss Alert #${activeAlert?.id}`}
      >
        <form onSubmit={handleDismissSubmit}>
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', marginBottom: '6px', color: 'var(--color-text-secondary)' }}>
              Dismissal Reason (Required)
            </label>
            <textarea
              rows={4}
              required
              value={dismissReason}
              onChange={e => setDismissReason(e.target.value)}
              placeholder="Explain why this detection is considered false positive or benign..."
              style={{ width: '100%', padding: '8px', background: 'var(--color-canvas)', border: '1px solid #30363D', borderRadius: '6px', color: 'var(--color-text-primary)', boxSizing: 'border-box' }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <button type="button" onClick={() => setDismissOpen(false)} className="btn btn-secondary">
              Cancel
            </button>
            <button type="submit" className="btn btn-danger">
              Confirm Dismissal
            </button>
          </div>
        </form>
      </FormDialog>

      {/* Escalate Modal */}
      <FormDialog
        isOpen={escalateOpen}
        onClose={() => setEscalateOpen(false)}
        title={`Escalate to Security Incident Case`}
      >
        <form onSubmit={handleEscalateSubmit}>
          <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '16px' }}>
            Escalating this alert creates a tracked Incident Case in the incident response lifecycle.
          </p>

          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', marginBottom: '6px', color: 'var(--color-text-secondary)' }}>
              Incident Title
            </label>
            <input
              type="text"
              required
              value={escalateTitle}
              onChange={e => setEscalateTitle(e.target.value)}
              style={{ width: '100%', padding: '8px', background: 'var(--color-canvas)', border: '1px solid #30363D', borderRadius: '6px', color: 'var(--color-text-primary)', boxSizing: 'border-box' }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <button type="button" onClick={() => setEscalateOpen(false)} className="btn btn-secondary">
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              Create & Escalate Incident
            </button>
          </div>
        </form>
      </FormDialog>
    </div>
  );
}
