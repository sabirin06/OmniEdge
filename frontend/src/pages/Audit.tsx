import React, { useEffect, useState } from 'react';
import { ClipboardList, Search, Clock, User, Shield } from 'lucide-react';
import api from '../api/client';
import { formatDateTime } from '../utils/formatters';

export function Audit() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const loadAudit = async () => {
    setLoading(true);
    try {
      const res = await api.get('/audit-logs/');
      const data = res.data.results ? res.data.results : (Array.isArray(res.data) ? res.data : []);
      setLogs(data);
    } catch (err) {
      console.error('Failed to load audit logs', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAudit();
  }, []);

  const filtered = logs.filter(l => {
    const q = search.toLowerCase();
    return (
      (l.action?.toLowerCase() || '').includes(q) ||
      (l.entity_type?.toLowerCase() || '').includes(q) ||
      (l.actor?.full_name?.toLowerCase() || '').includes(q)
    );
  });

  return (
    <div className="page-container" style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '700', margin: '0 0 4px 0' }}>Security Audit Trail</h1>
        <p style={{ margin: 0, color: '#8B949E', fontSize: '13px' }}>
          Immutable system audit ledger of sensitive actions, triage changes, and incident status transitions
        </p>
      </div>

      <div className="card" style={{ padding: '16px', marginBottom: '20px' }}>
        <input
          type="text"
          placeholder="Search audit trail by actor, action, or entity..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ width: '100%', padding: '8px 12px', background: '#0D1117', border: '1px solid #30363D', borderRadius: '6px', color: '#E6EDF3', fontSize: '13px', boxSizing: 'border-box' }}
        />
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
          <thead>
            <tr style={{ background: '#161B22', borderBottom: '1px solid #30363D', color: '#8B949E' }}>
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
                <tr key={l.id || i} style={{ borderBottom: '1px solid #21262D' }}>
                  <td style={{ padding: '12px 16px', color: '#8B949E' }}>
                    {formatDateTime(l.timestamp)}
                  </td>
                  <td style={{ padding: '12px 16px', fontWeight: '600', color: '#58A6FF' }}>
                    {l.action}
                  </td>
                  <td style={{ padding: '12px 16px', color: '#E6EDF3' }}>
                    {l.entity_type} {l.entity_id ? `#${l.entity_id}` : ''}
                  </td>
                  <td style={{ padding: '12px 16px', color: '#8B949E' }}>
                    {l.actor?.full_name || l.actor_name || 'System Service'}
                  </td>
                  <td style={{ padding: '12px 16px', color: '#8B949E', fontFamily: 'monospace', fontSize: '11px' }}>
                    {l.changes ? JSON.stringify(l.changes).slice(0, 80) : 'Recorded'}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} style={{ padding: '36px', textAlign: 'center', color: '#8B949E' }}>
                  {loading ? 'Loading audit ledger...' : 'No audit records match query.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
