import { useSearchParams } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import { useToast } from '../components/ui/Toast';
import { Pagination } from '../components/ui/Pagination';
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileText, Search, Plus, Filter, ShieldAlert,
  Clock, ArrowRight, User
} from 'lucide-react';
import { incidentsApi } from '../api/incidents';
import { SeverityBadge, StatusBadge } from '../components/ui/Badge';
import { formatRelative, formatDateTime } from '../utils/formatters';
import { IncidentIntakeDialog } from '../components/forms/IncidentIntakeDialog';
import { useAuth } from '../contexts/AuthContext';

export function Incidents() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const canRespond = user?.role === 'soc_lead' || user?.role === 'soc_analyst';
  const [page, setPage] = useState(1);
  const [params, setParams] = useSearchParams();
  const search = params.get('q') ?? '';
  const setSearch = (value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set('q', value);
    else next.delete('q');
    setParams(next, { replace: true });
  };
  const [statusFilter, setStatusFilter] = useState('');
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    setPage(1);
  }, [search]);
  const listing = useApi(() => incidentsApi.list({ page, search, status: statusFilter }), [page, search, statusFilter]);
  const filtered: any[] = listing.data?.results ?? [];
  const loading = listing.loading;

  return (
    <div className="page-container" style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '16px' }}>

        <button
          onClick={() => setCreateOpen(true)}
          disabled={!canRespond}
          className="btn btn-primary"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
        >
          <Plus size={16} />
          <span>Create incident</span>
        </button>
      </div>

      {/* Filter Bar */}
      <div className="card" style={{ padding: '16px', marginBottom: '20px', display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1', minWidth: '220px' }}>
          <Search size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-secondary)' }} />
          <input
            type="text"
            placeholder="Search by reference, title, or owner..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
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
          onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
          style={{ padding: '8px 12px', background: 'var(--color-canvas)', border: '1px solid var(--color-border)', borderRadius: '6px', color: 'var(--color-text-primary)', fontSize: '13px' }}
        >
          <option value="">All Statuses</option>
          <option value="open">Open</option>
          <option value="investigating">Investigating</option>
          <option value="containment">Containment</option>
          <option value="resolved">Resolved</option>
          <option value="closed">Closed</option>
        </select>
      </div>

      {/* Incidents Table */}
      <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          {listing.error && <p role="alert">Could not load incidents. <button onClick={listing.refresh}>Retry</button></p>}
          <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: 'var(--color-surface)', borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>
                <th style={{ padding: '12px 16px' }}>Reference</th>
                <th style={{ padding: '12px 16px' }}>Title</th>
                <th style={{ padding: '12px 16px' }}>Severity</th>
                <th style={{ padding: '12px 16px' }}>Status</th>
                <th style={{ padding: '12px 16px' }}>Owner</th>
                <th style={{ padding: '12px 16px' }}>Created</th>
                <th style={{ padding: '12px 16px', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length > 0 ? (
                filtered.map(inc => (
                  <tr key={inc.id} style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                    <td style={{ padding: '12px 16px', fontWeight: '700', color: 'var(--color-accent-hover)' }}>
                      {inc.reference}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span
                        style={{ fontWeight: '600', color: 'var(--color-text-primary)', cursor: 'pointer' }}
                        onClick={() => navigate(`/incidents/${inc.id}`)}
                      >
                        {inc.title}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <SeverityBadge severity={inc.severity} />
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <StatusBadge status={inc.status} />
                    </td>
                    <td style={{ padding: '12px 16px', color: 'var(--color-text-secondary)' }}>
                      {inc.owner_detail?.full_name || 'Unassigned'}
                    </td>
                    <td style={{ padding: '12px 16px', color: 'var(--color-text-secondary)' }}>
                      {formatRelative(inc.created_at)}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                      <button
                        onClick={() => navigate(`/incidents/${inc.id}`)}
                        className="btn btn-ghost btn-sm"
                        style={{ fontSize: '11px', color: 'var(--color-accent-hover)' }}
                      >
                        Open Case
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} style={{ padding: '36px', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
                    {loading ? 'Loading incidents...' : 'No incident cases found.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <Pagination page={page} pageSize={50} total={listing.data?.count ?? 0} onPageChange={setPage} />
        </div>
      </div>

      {/* Create Modal */}
      {createOpen && <IncidentIntakeDialog onClose={() => setCreateOpen(false)} onSave={async draft => {
        const { data } = await incidentsApi.create(draft);
        toast('success', 'Incident created');
        navigate(`/incidents/${data.id}`);
      }} />}
    </div>
  );
}
