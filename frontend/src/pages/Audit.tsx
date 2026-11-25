import { Pagination } from '../components/ui/Pagination';
import React, { useEffect, useState } from 'react';
import { ClipboardList, Search, Clock, User, Shield } from 'lucide-react';
import api from '../api/client';
import { formatDateTime } from '../utils/formatters';

export function Audit() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [count, setCount] = useState(0);
  const [error, setError] = useState(false);

  const loadAudit = async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await api.get('/audit-logs/', { params: { page, search } });
      const data = res.data.results ? res.data.results : (Array.isArray(res.data) ? res.data : []);
      setLogs(data);
      setCount(res.data.count);
    } catch (err) {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAudit();
  }, [page, search]);

  const filtered = logs;

  return (
    <div className="page-container" style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '700', margin: '0 0 4px 0' }}>Security Audit Trail</h1>
        <p style={{ margin: 0, color: 'var(--color-text-secondary)', fontSize: '13px' }}>
          Immutable system audit ledger of sensitive actions, triage changes, and incident status transitions
        </p>
      </div>

      {error && <p role="alert">Could not load audit entries. <button onClick={loadAudit}>Retry</button></p>}
      <div className="card" style={{ padding: '16px', marginBottom: '20px' }}>
        <input
          type="text"
          placeholder="Search audit trail by actor, action, or entity..."
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          style={{ width: '100%', padding: '8px 12px', background: 'var(--color-canvas)', border: '1px solid var(--color-border)', borderRadius: '6px', color: 'var(--color-text-primary)', fontSize: '13px', boxSizing: 'border-box' }}
        />
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
          <thead>
            <tr style={{ background: 'var(--color-surface)', borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>
              <th style={{ padding: '12px 16px' }}>Timestamp</th>
              <th style={{ padding: '12px 16px' }}>Action Performed</th>
              <th style={{ padding: '12px 16px' }}>Entity Type & ID</th>
              <th style={{ padding: '12px 16px' }}>Actor</th>
              <th style={{ padding: '12px 16px' }}>Diff / Changes</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length > 0 ? (
              filtered.map((l, i) => (
                <tr key={l.id || i} style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                  <td style={{ padding: '12px 16px', color: 'var(--color-text-secondary)' }}>
                    {formatDateTime(l.timestamp)}
                  </td>
                  <td style={{ padding: '12px 16px', fontWeight: '600', color: 'var(--color-accent-hover)' }}>
                    {l.action}
                  </td>
                  <td style={{ padding: '12px 16px', color: 'var(--color-text-primary)' }}>
                    {l.entity_type} {l.entity_id ? `#${l.entity_id}` : ''}
                  </td>
                  <td style={{ padding: '12px 16px', color: 'var(--color-text-secondary)' }}>
                    {l.actor_email || 'System Service'}
                  </td>
                  <td style={{ padding: '12px 16px', color: 'var(--color-text-secondary)', fontFamily: 'monospace', fontSize: '11px' }}>
                    {l.changes ? JSON.stringify(l.changes).slice(0, 80) : 'Recorded'}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} style={{ padding: '36px', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
                  {loading ? 'Loading audit ledger...' : 'No audit records match query.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <Pagination page={page} pageSize={50} total={count} onPageChange={setPage} />
      </div>
    </div>
  );
}
