import { useSearchParams } from 'react-router-dom';
import { IncidentIntakeDialog } from '../components/forms/IncidentIntakeDialog';
import { Pagination } from '../components/ui/Pagination';
import { useApi } from '../hooks/useApi';
import { requestError, requestFields } from '../api/errors';
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
  const canRespond = user?.role === "soc_analyst" || user?.role === "soc_lead";
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const search = params.get('q') ?? '';
  const setSearch = (value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set('q', value);
    else next.delete('q');
    setParams(next, { replace: true });
  };
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
  const [actionFields, setActionFields] = useState<Partial<Record<'severity' | 'notes' | 'reason', string>>>({});

  const [page, setPage] = useState(1);
  useEffect(() => {
    setPage(1);
  }, [search]);
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
      toast('success', 'Alert review saved.');
      await loadAlerts();
    } catch (err) {
      const fields = requestFields(err, ['severity', 'notes']);
      setActionFields(fields);
      if (!Object.keys(fields).length) toast('error', requestError(err, 'Could not save the alert review.'));
    }
  };

  const handleDismissSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeAlert) return;
    try {
      await alertsApi.dismiss(activeAlert.id, { reason: dismissReason });
      setDismissOpen(false);
      toast('success', 'Alert dismissed.');
      await loadAlerts();
    } catch (err) {
      const fields = requestFields(err, ['reason']);
      setActionFields(fields);
      if (!Object.keys(fields).length) toast('error', requestError(err, 'Could not dismiss the alert.'));
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
              border: '1px solid var(--color-border)',
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
          style={{ padding: '8px 12px', background: 'var(--color-canvas)', border: '1px solid var(--color-border)', borderRadius: '6px', color: 'var(--color-text-primary)', fontSize: '13px' }}
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
          style={{ padding: '8px 12px', background: 'var(--color-canvas)', border: '1px solid var(--color-border)', borderRadius: '6px', color: 'var(--color-text-primary)', fontSize: '13px' }}
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
        {user && !canRespond && (
          <p style={{ padding: '12px 16px', margin: 0, color: 'var(--color-text-secondary)' }}>
            You can view alerts. A SOC Analyst or SOC Lead can claim, triage, escalate, or dismiss them.
          </p>
        )}
        <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: 'var(--color-surface)', borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>
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
                  <tr key={alert.id} style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
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
                        <span style={{ color: 'var(--color-text-muted)', fontStyle: 'italic' }}>Unassigned</span>
                      )}
                    </td>
                    <td style={{ padding: '12px 16px', color: 'var(--color-text-secondary)' }}>
                      {formatRelative(alert.created_at)}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: '6px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => navigate(`/alerts/${alert.id}`)}
                          aria-label={`Open alert #${alert.id}`}
                        >
                          View alert
                        </button>
                        {canRespond && alert.status === 'new' && (
                          <button
                            onClick={() => handleClaim(alert.id)}
                            className="btn btn-ghost btn-sm"
                            style={{ fontSize: '11px', color: 'var(--color-success)' }}
                            title="Claim Alert"
                          >
                            <UserCheck size={14} style={{ marginRight: '4px' }} />
                            Claim
                          </button>
                        )}

                        {canRespond && ['new', 'in_review'].includes(alert.status) && (
                          <>
                            <button
                              onClick={() => {
                                setActiveAlert(alert);
                                setTriageSeverity(alert.severity);
                                setTriageNotes(alert.triage_notes || '');
                                setActionFields({});
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
                                  setEscalateOpen(true);
                                }}
                                className="btn btn-ghost btn-sm"
                                style={{ fontSize: '11px', color: 'var(--color-high)' }}
                              >
                                Escalate
                              </button>
                            )}

                            <button
                              onClick={() => {
                                setActiveAlert(alert);
                                setDismissReason('');
                                setActionFields({});
                                setDismissOpen(true);
                              }}
                              className="btn btn-ghost btn-sm"
                              style={{ fontSize: '11px', color: 'var(--color-danger)' }}
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
            <label htmlFor="alert-severity" style={{ display: 'block', fontSize: '12px', fontWeight: '600', marginBottom: '6px', color: 'var(--color-text-secondary)' }}>
              Updated Severity
            </label>
            <select id="alert-severity" aria-invalid={!!actionFields.severity} aria-describedby={actionFields.severity ? "alert-severity-error" : undefined}
              value={triageSeverity}
              onChange={e => setTriageSeverity(e.target.value)}
              style={{ width: '100%', padding: '8px', background: 'var(--color-canvas)', border: '1px solid var(--color-border)', borderRadius: '6px', color: 'var(--color-text-primary)' }}
            >
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
              <option value="info">Info</option>
            </select>
            {actionFields.severity && <p id="alert-severity-error" className="form-error" role="alert">{actionFields.severity}</p>}
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label htmlFor="alert-notes" style={{ display: 'block', fontSize: '12px', fontWeight: '600', marginBottom: '6px', color: 'var(--color-text-secondary)' }}>
              Analyst Triage Assessment Notes
            </label>
            <textarea id="alert-notes" aria-invalid={!!actionFields.notes} aria-describedby={actionFields.notes ? "alert-notes-error" : undefined}
              rows={4}
              value={triageNotes}
              onChange={e => setTriageNotes(e.target.value)}
              placeholder="Document observed threat indicators, affected assets, or findings..."
              style={{ width: '100%', padding: '8px', background: 'var(--color-canvas)', border: '1px solid var(--color-border)', borderRadius: '6px', color: 'var(--color-text-primary)', boxSizing: 'border-box' }}
            />
            {actionFields.notes && <p id="alert-notes-error" className="form-error" role="alert">{actionFields.notes}</p>}
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
            <label htmlFor="alert-reason" style={{ display: 'block', fontSize: '12px', fontWeight: '600', marginBottom: '6px', color: 'var(--color-text-secondary)' }}>
              Dismissal Reason (Required)
            </label>
            <textarea id="alert-reason" aria-invalid={!!actionFields.reason} aria-describedby={actionFields.reason ? "alert-reason-error" : undefined}
              rows={4}
              required
              value={dismissReason}
              onChange={e => setDismissReason(e.target.value)}
              placeholder="Explain why this detection is considered false positive or benign..."
              style={{ width: '100%', padding: '8px', background: 'var(--color-canvas)', border: '1px solid var(--color-border)', borderRadius: '6px', color: 'var(--color-text-primary)', boxSizing: 'border-box' }}
            />
            {actionFields.reason && <p id="alert-reason-error" className="form-error" role="alert">{actionFields.reason}</p>}
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

      {escalateOpen && activeAlert && <IncidentIntakeDialog alert={activeAlert}
        onClose={() => setEscalateOpen(false)} onSave={async draft => {
          const { data } = await alertsApi.escalate(activeAlert.id, draft);
          toast('success', 'Alert escalated. The linked incident is ready to investigate.');
          navigate(`/incidents/${data.id}`, { state: { escalatedAlert: activeAlert.id } });
        }} />}
    </div>
  );
}
