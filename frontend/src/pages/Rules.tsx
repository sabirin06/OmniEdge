import { Pagination } from '../components/ui/Pagination';
import { useApi } from '../hooks/useApi';
import { requestError } from '../api/errors';
import { useToast } from '../components/ui/Toast';
import React, { useEffect, useState } from 'react';
import { Shield, Plus, ToggleLeft, ToggleRight, CheckCircle2, AlertCircle } from 'lucide-react';
import { rulesApi } from '../api/rules';
import { SeverityBadge } from '../components/ui/Badge';
import { FormDialog } from '../components/ui/FormDialog';
import { useAuth } from '../contexts/AuthContext';

export function Rules() {
  const toast = useToast();
  const [search, setSearch] = useState('');
  const { user } = useAuth();
  const [createOpen, setCreateOpen] = useState(false);

  // Form states
  const [editing, setEditing] = useState<number | null>(null);
  const [conditions, setConditions] = useState('{}');
  const [name, setName] = useState('');
  const [eventType, setEventType] = useState('login_failed');
  const [severity, setSeverity] = useState('high');
  const [description, setDescription] = useState('');

  const [listFilter, setListFilter] = useState('');
  const [page, setPage] = useState(1);
  const listing = useApi(() => rulesApi.list({ page, search, enabled: listFilter || undefined }), [page, search, listFilter]);
  const rules = listing.data?.results ?? [];
  const loading = listing.loading;
  const loadRules = listing.refresh;

  const handleToggle = async (rule: any) => {
    try {
      if (rule.enabled) {
        await rulesApi.disable(rule.id);
      } else {
        await rulesApi.enable(rule.id);
      }
      await loadRules();
    } catch (err) {
      toast('error', requestError(err, 'Failed to toggle rule.'));
    }
  };

  const openRule = (record?: (typeof rules)[number]) => {
    setEditing(record?.id ?? null);
    setName(record?.name ?? '');
    setEventType(record?.event_type ?? 'login_failed');
    setSeverity(record?.severity ?? 'high');
    setDescription(record?.description ?? '');
    setConditions(JSON.stringify(record?.conditions ?? {}));
    setCreateOpen(true);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        name,
        event_type: eventType,
        severity,
        description,
        conditions: JSON.parse(conditions),
      };
      if (editing) await rulesApi.update(editing, payload);
      else await rulesApi.create(payload);
      toast('success', editing ? 'Rule updated' : 'Rule created');
      setCreateOpen(false);
      setName('');
      setDescription('');
      await loadRules();
    } catch (err) {
      toast('error', requestError(err, 'Failed to create rule.'));
    }
  };

  return (
    <div className="page-container" style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '700', margin: '0 0 4px 0' }}>Detection Rule Catalog</h1>
          <p style={{ margin: 0, color: 'var(--color-text-secondary)', fontSize: '13px' }}>
            Automated correlation rules executed synchronously against streaming ingestion telemetry
          </p>
        </div>

        <button
          onClick={() => openRule()}
          className="btn btn-primary"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
        >
          <Plus size={16} />
          <span>Add Detection Rule</span>
        </button>
      </div>

      <div className="form-group">
        <label htmlFor="monitoring-search">Search</label>
        <input id="monitoring-search" value={search} onChange={e => { setPage(1); setSearch(e.target.value); }} />
      </div>
      <div className="form-group">
        <label htmlFor="monitoring-filter">Filter by status</label>
        <select id="monitoring-filter" value={listFilter} onChange={e => { setPage(1); setListFilter(e.target.value); }}>
          <option value="">All</option><option value="true">Enabled</option><option value="false">Disabled</option>
        </select>
      </div>
      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        {listing.error && <p role="alert">Could not load records. <button className="btn btn-ghost" onClick={listing.refresh}>Retry</button></p>}
        <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
          <thead>
            <tr style={{ background: 'var(--color-surface)', borderBottom: '1px solid #30363D', color: 'var(--color-text-secondary)' }}>
              <th style={{ padding: '12px 16px' }}>Rule Name</th>
              <th style={{ padding: '12px 16px' }}>Target Event Type</th>
              <th style={{ padding: '12px 16px' }}>Alert Severity</th>
              <th style={{ padding: '12px 16px' }}>Description</th>
              <th style={{ padding: '12px 16px' }}>State</th>
              <th style={{ padding: '12px 16px', textAlign: 'right' }}>Toggle</th>
              <th>Edit</th>
            </tr>
          </thead>
          <tbody>
            {rules.length > 0 ? (
              rules.map(r => (
                <tr key={r.id} style={{ borderBottom: '1px solid #21262D' }}>
                  <td style={{ padding: '12px 16px', fontWeight: '600', color: 'var(--color-text-primary)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Shield size={16} color={r.enabled ? '#3FB950' : 'var(--color-text-secondary)'} />
                      <span>{r.name}</span>
                    </div>
                  </td>
                  <td style={{ padding: '12px 16px', color: 'var(--color-accent-hover)', fontFamily: 'monospace' }}>
                    {r.event_type}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <SeverityBadge severity={r.severity} />
                  </td>
                  <td style={{ padding: '12px 16px', color: 'var(--color-text-secondary)' }}>
                    {r.description || 'Standard threat detection rule.'}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{
                      padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: '600',
                      background: r.enabled ? 'rgba(63, 185, 80, 0.15)' : 'rgba(139, 148, 158, 0.15)',
                      color: r.enabled ? '#3FB950' : 'var(--color-text-secondary)'
                    }}>
                      {r.enabled ? 'Active / Enabled' : 'Disabled'}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                    <button
                      onClick={() => handleToggle(r)}
                      className="btn btn-ghost btn-sm"
                      style={{ fontSize: '12px', color: r.enabled ? '#FF7B72' : '#3FB950' }}
                    >
                      {r.enabled ? 'Disable' : 'Enable'}
                    </button>
                  </td>
                    <td><button className="btn btn-ghost btn-sm" onClick={() => openRule(r)}>Edit</button></td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7} style={{ padding: '36px', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
                  {loading ? 'Loading detection catalog...' : 'No detection rules found.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <Pagination page={page} pageSize={50} total={listing.data?.count ?? 0} onPageChange={setPage} />
      </div>

      {/* Create Rule Modal */}
      <FormDialog
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        title={editing ? "Edit detection rule" : "Create detection rule"}
      >
        <form onSubmit={handleCreate}>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', marginBottom: '6px', color: 'var(--color-text-secondary)' }}>
              Rule Name
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Cobalt Strike Beacon Detection"
              style={{ width: '100%', padding: '8px', background: 'var(--color-canvas)', border: '1px solid #30363D', borderRadius: '6px', color: 'var(--color-text-primary)', boxSizing: 'border-box' }}
            />
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', marginBottom: '6px', color: 'var(--color-text-secondary)' }}>
              Target Event Type
            </label>
            <input
              type="text"
              required
              value={eventType}
              onChange={e => setEventType(e.target.value)}
              placeholder="e.g. login_failed, data_transfer, privilege_escalation"
              style={{ width: '100%', padding: '8px', background: 'var(--color-canvas)', border: '1px solid #30363D', borderRadius: '6px', color: 'var(--color-text-primary)', boxSizing: 'border-box' }}
            />
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', marginBottom: '6px', color: 'var(--color-text-secondary)' }}>
              Trigger Alert Severity
            </label>
            <select
              value={severity}
              onChange={e => setSeverity(e.target.value)}
              style={{ width: '100%', padding: '8px', background: 'var(--color-canvas)', border: '1px solid #30363D', borderRadius: '6px', color: 'var(--color-text-primary)' }}
            >
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', marginBottom: '6px', color: 'var(--color-text-secondary)' }}>
              Rule Logic / Description
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Conditions for alert generation..."
              style={{ width: '100%', padding: '8px', background: 'var(--color-canvas)', border: '1px solid #30363D', borderRadius: '6px', color: 'var(--color-text-primary)', boxSizing: 'border-box' }}
            />
          </div>

          <div className="form-group">
            <label htmlFor="rule-conditions">Match conditions (JSON)</label>
            <textarea id="rule-conditions" value={conditions} onChange={e => setConditions(e.target.value)} rows={3} placeholder={'{"metadata__failed_attempts":{"gte":5}}'} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <button type="button" onClick={() => setCreateOpen(false)} className="btn btn-secondary">
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              Save Rule
            </button>
          </div>
        </form>
      </FormDialog>
    </div>
  );
}
