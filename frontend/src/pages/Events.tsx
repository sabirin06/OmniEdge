import { useSearchParams } from 'react-router-dom';
import { Pagination } from '../components/ui/Pagination';
import { useApi } from '../hooks/useApi';
import { requestError } from '../api/errors';
import { useToast } from '../components/ui/Toast';
import React, { useEffect, useState } from 'react';
import { Zap, Search, Filter, ShieldAlert } from 'lucide-react';
import { eventsApi } from '../api/events';
import { SeverityBadge } from '../components/ui/Badge';
import { formatDateTime } from '../utils/formatters';

export function Events() {
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [activeEvent, setActiveEvent] = useState<any | null>(null);
  const [params, setParams] = useSearchParams();
  const eventId = Number(params.get('event'));
  useEffect(() => {
    if (!eventId) return;
    let active = true;
    eventsApi.get(eventId).then(({ data }) => {
      if (active) setActiveEvent(data);
    }).catch(err => {
      if (active) toast('error', requestError(err, 'Could not open the linked event.'));
    });
    return () => { active = false; };
  }, [eventId, toast]);

  const closeEvent = () => {
    setActiveEvent(null);
    if (eventId) setParams({}, { replace: true });
  };

  const [listFilter, setListFilter] = useState('');
  const [page, setPage] = useState(1);
  const listing = useApi(() => eventsApi.list({ page, search, risk: listFilter || undefined }), [page, search, listFilter]);
  const events = listing.data?.results ?? [];
  const loading = listing.loading;
  const loadEvents = listing.refresh;


  return (
    <div className="page-container" style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      <div className="card" style={{ padding: '16px', marginBottom: '20px' }}>
        <input
          type="text"
          placeholder="Filter events by type, source IP, or message contents..."
          value={search}
          onChange={e => { setPage(1); setSearch(e.target.value); }}
          style={{ width: '100%', padding: '8px 12px', background: 'var(--color-canvas)', border: '1px solid var(--color-border)', borderRadius: '6px', color: 'var(--color-text-primary)', fontSize: '13px', boxSizing: 'border-box' }}
        />
      </div>

      <div className="form-group">
        <label htmlFor="monitoring-filter">Filter by severity</label>
        <select id="monitoring-filter" value={listFilter} onChange={e => { setPage(1); setListFilter(e.target.value); }}>
          <option value="">All</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option>
        </select>
      </div>
      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        {listing.error && <p role="alert">Could not load records. <button className="btn btn-ghost" onClick={listing.refresh}>Retry</button></p>}
        <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
          <thead>
            <tr style={{ background: 'var(--color-surface)', borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>
              <th style={{ padding: '12px 16px' }}>Severity</th>
              <th style={{ padding: '12px 16px' }}>Event Type</th>
              <th style={{ padding: '12px 16px' }}>Source IP</th>
              <th style={{ padding: '12px 16px' }}>Message</th>
              <th style={{ padding: '12px 16px' }}>Timestamp</th>
              <th style={{ padding: '12px 16px', textAlign: 'right' }}>Payload</th>
            </tr>
          </thead>
          <tbody>
            {events.length > 0 ? (
              events.map(e => (
                <tr key={e.id} style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                  <td style={{ padding: '12px 16px' }}>
                    <SeverityBadge severity={e.risk_severity ?? 'low'} />
                  </td>
                  <td style={{ padding: '12px 16px', fontWeight: '600', color: 'var(--color-accent-hover)' }}>{e.event_type}</td>
                  <td style={{ padding: '12px 16px', color: 'var(--color-text-secondary)', fontFamily: 'monospace' }}>{e.source_ip || 'N/A'}</td>
                  <td style={{ padding: '12px 16px', color: 'var(--color-text-primary)' }}>{e.message}</td>
                  <td style={{ padding: '12px 16px', color: 'var(--color-text-secondary)' }}>{formatDateTime(e.occurred_at || e.received_at)}</td>
                  <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                    <button
                      onClick={() => setActiveEvent(e)}
                      className="btn btn-ghost btn-sm"
                      style={{ fontSize: '11px', color: 'var(--color-accent-hover)' }}
                    >
                      JSON
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} style={{ padding: '36px', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
                  {loading ? 'Loading event telemetry...' : 'No telemetry events match search.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <Pagination page={page} pageSize={50} total={listing.data?.count ?? 0} onPageChange={setPage} />
      </div>

      {/* JSON Viewer Modal */}
      {activeEvent && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div className="card" style={{ width: '90%', maxWidth: '600px', maxHeight: '80vh', overflowY: 'auto', padding: '24px' }}>
            <h2 style={{ fontSize: '16px', fontWeight: '700', marginBottom: '16px' }}>Event #{activeEvent.id} Metadata</h2>
            <pre style={{
              background: 'var(--color-canvas)', padding: '14px', borderRadius: '6px', border: '1px solid var(--color-border)',
              fontSize: '12px', color: 'var(--color-success)', fontFamily: 'monospace', overflowX: 'auto'
            }}>
              {JSON.stringify(activeEvent, null, 2)}
            </pre>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
              <button onClick={closeEvent} className="btn btn-secondary">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
