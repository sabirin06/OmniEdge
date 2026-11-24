import { Pagination } from '../components/ui/Pagination';
import { useApi } from '../hooks/useApi';
import { requestError } from '../api/errors';
import { useToast } from '../components/ui/Toast';
import React, { useEffect, useState } from 'react';
import { Radio, Plus, Key, RefreshCw, CheckCircle2 } from 'lucide-react';
import { assetsApi } from '../api/assets';
import { logSourcesApi } from '../api/logSources';
import { FormDialog } from '../components/ui/FormDialog';
import { formatDateTime } from '../utils/formatters';
import { useAuth } from '../contexts/AuthContext';

export function LogSources() {
  const toast = useToast();
  const [search, setSearch] = useState('');
  const { user } = useAuth();
  const [createOpen, setCreateOpen] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);

  // Form states
  const [asset, setAsset] = useState('');
  const [assets, setAssets] = useState<{ id: number; name: string }[]>([]);
  const [editing, setEditing] = useState<number | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [name, setName] = useState('');
  const [sourceType, setSourceType] = useState('syslog');

  const [listFilter, setListFilter] = useState('');
  const [page, setPage] = useState(1);
  const listing = useApi(() => logSourcesApi.list({ page, search, enabled: listFilter || undefined }), [page, search, listFilter]);
  const sources = listing.data?.results ?? [];
  const loading = listing.loading;
  const loadSources = listing.refresh;

  const openSource = async (source?: (typeof sources)[number]) => {
    setEditing(source?.id ?? null);
    setName(source?.name ?? '');
    setSourceType(source?.source_type ?? 'syslog');
    setAsset(String(source?.asset ?? ''));
    setEnabled(source?.enabled ?? true);
    try {
      const options: { id: number; name: string }[] = [];
      let page = 1;
      while (true) {
        const { data } = await assetsApi.list({ page });
        options.push(...data.results);
        if (!data.next) break;
        page += 1;
      }
      setAssets(options);
      setCreateOpen(true);
    } catch (err) {
      toast('error', requestError(err, 'Could not load assets.'));
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (!asset) { toast('error', 'Choose an associated asset.'); return; }
      const payload = { name, source_type: sourceType, asset: Number(asset), enabled };
      if (editing) await logSourcesApi.update(editing, payload);
      else setNewKey((await logSourcesApi.create(payload)).data.plain_secret_key);
      setCreateOpen(false);
      toast('success', editing ? 'Log source updated' : 'Log source connected');
      await loadSources();
    } catch (err) {
      toast('error', requestError(err, 'Failed to register log source.'));
    }
  };

  const handleRotateKey = async (id: number) => {
    try {
      const res = await logSourcesApi.rotateKey(id);
      setNewKey(res.data.plain_secret_key);
      await loadSources();
    } catch (err) {
      toast('error', requestError(err, 'Failed to rotate key.'));
    }
  };

  return (
    <div className="page-container" style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '700', margin: '0 0 4px 0' }}>Log Source Registration</h1>
          <p style={{ margin: 0, color: 'var(--color-text-secondary)', fontSize: '13px' }}>
            Registered telemetry collectors, agent endpoints, and ingestion API keys
          </p>
        </div>

        <button
          onClick={() => openSource()}
          className="btn btn-primary"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
        >
          <Plus size={16} />
          <span>Connect Log Source</span>
        </button>
      </div>

      <div className="form-group">
        <label htmlFor="monitoring-search">Search</label>
        <input id="monitoring-search" value={search} onChange={e => { setPage(1); setSearch(e.target.value); }} />
      </div>
      {newKey && (
        <div className="card" style={{ padding: '16px', border: '1px solid #3FB950', marginBottom: '20px', background: 'rgba(63, 185, 80, 0.1)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#3FB950', fontWeight: '600', marginBottom: '6px' }}>
            <Key size={16} />
            <span>Generated Secret Key (Copy now - will not be displayed again):</span>
          </div>
          <code style={{ display: 'block', padding: '8px', background: 'var(--color-canvas)', border: '1px solid #30363D', borderRadius: '4px', color: 'var(--color-accent-hover)', fontFamily: 'monospace', wordBreak: 'break-all' }}>
            {newKey}
          </code>
          <button className="btn btn-ghost" onClick={() => setNewKey(null)}>Hide key</button>
        </div>
      )}

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
              <th style={{ padding: '12px 16px' }}>Source Name</th>
              <th style={{ padding: '12px 16px' }}>Type</th>
              <th style={{ padding: '12px 16px' }}>Associated Asset</th>
              <th style={{ padding: '12px 16px' }}>Key Prefix</th>
              <th style={{ padding: '12px 16px' }}>Last Seen</th>
              <th style={{ padding: '12px 16px' }}>Status</th>
              <th style={{ padding: '12px 16px', textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sources.length > 0 ? (
              sources.map(s => (
                <tr key={s.id} style={{ borderBottom: '1px solid #21262D' }}>
                  <td style={{ padding: '12px 16px', fontWeight: '600', color: 'var(--color-text-primary)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Radio size={16} color='var(--color-accent-hover)' />
                      <span>{s.name}</span>
                    </div>
                  </td>
                  <td style={{ padding: '12px 16px', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>
                    {s.source_type}
                  </td>
                  <td style={{ padding: '12px 16px', color: 'var(--color-accent-hover)' }}>
                    {s.asset_detail?.name || 'Unlinked Asset'}
                  </td>
                  <td style={{ padding: '12px 16px', fontFamily: 'monospace', color: 'var(--color-text-secondary)' }}>
                    {s.secret_key_display || '?'}
                  </td>
                  <td style={{ padding: '12px 16px', color: 'var(--color-text-secondary)' }}>
                    {s.last_seen ? formatDateTime(s.last_seen) : 'Never'}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{
                      padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: '600',
                      background: s.enabled ? 'rgba(63, 185, 80, 0.15)' : 'rgba(139, 148, 158, 0.15)',
                      color: s.enabled ? '#3FB950' : 'var(--color-text-secondary)'
                    }}>
                      {s.enabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => openSource(s)}>Edit</button>
                    <button
                      onClick={() => { if (window.confirm("Replace this source key? The old key will stop working.")) handleRotateKey(s.id); }}
                      className="btn btn-ghost btn-sm"
                      style={{ fontSize: '11px', color: '#E3B341' }}
                      title="Rotate Secret Ingestion Key"
                    >
                      <RefreshCw size={13} style={{ marginRight: '4px' }} />
                      Rotate Key
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7} style={{ padding: '36px', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
                  {loading ? 'Loading log sources...' : 'No log sources registered.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <Pagination page={page} pageSize={50} total={listing.data?.count ?? 0} onPageChange={setPage} />
      </div>

      {/* Connect Source Modal */}
      <FormDialog
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        title={editing ? "Edit log source" : "Connect new ingestion source"}
      >
        <form onSubmit={handleCreate}>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', marginBottom: '6px', color: 'var(--color-text-secondary)' }}>
              Collector / Source Name
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. AWS CloudTrail Connector"
              style={{ width: '100%', padding: '8px', background: 'var(--color-canvas)', border: '1px solid #30363D', borderRadius: '6px', color: 'var(--color-text-primary)', boxSizing: 'border-box' }}
            />
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', marginBottom: '6px', color: 'var(--color-text-secondary)' }}>
              Source Protocol / Format
            </label>
            <select
              value={sourceType}
              onChange={e => setSourceType(e.target.value)}
              style={{ width: '100%', padding: '8px', background: 'var(--color-canvas)', border: '1px solid #30363D', borderRadius: '6px', color: 'var(--color-text-primary)' }}
            >
              <option value="syslog">Syslog (RFC 5424)</option>
              <option value="json_http">JSON / HTTP REST Ingestion</option>
              <option value="windows_event">Windows Event Forwarding</option>
              <option value="cef">Common Event Format (CEF)</option>
              <option value="aws_cloudtrail">AWS CloudTrail Log Stream</option>
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="source-asset">Associated asset</label>
            <select id="source-asset" required value={asset} onChange={e => setAsset(e.target.value)}>
              <option value="">Choose an asset</option>
              {assets.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label><input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} /> Enabled</label>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <button type="button" onClick={() => setCreateOpen(false)} className="btn btn-secondary">
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              Generate Key & Connect
            </button>
          </div>
        </form>
      </FormDialog>
    </div>
  );
}
