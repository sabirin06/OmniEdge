import { useSearchParams } from 'react-router-dom';
import { Pagination } from '../components/ui/Pagination';
import { useApi } from '../hooks/useApi';
import { requestError, requestFields } from '../api/errors';
import { useToast } from '../components/ui/Toast';
import React, { useEffect, useState } from 'react';
import { Monitor, Plus, Search, Server, Database, Shield, Globe } from 'lucide-react';
import { assetsApi } from '../api/assets';
import { SeverityBadge } from '../components/ui/Badge';
import { FormDialog } from '../components/ui/FormDialog';
import { useAuth } from '../contexts/AuthContext';

export function Assets() {
  const toast = useToast();
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const search = params.get('q') ?? '';
  const setSearch = (value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set('q', value);
    else next.delete('q');
    setParams(next, { replace: true });
  };
  const [createOpen, setCreateOpen] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Form states
  const [editing, setEditing] = useState<number | null>(null);
  const [status, setStatus] = useState('active');
  const canEdit = user?.role === 'customer_admin';
  const [name, setName] = useState('');
  const [hostname, setHostname] = useState('');
  const [ipAddress, setIpAddress] = useState('');
  const [assetType, setAssetType] = useState('server');
  const [criticality, setCriticality] = useState('high');

  const [listFilter, setListFilter] = useState('');
  const [page, setPage] = useState(1);
  useEffect(() => {
    setPage(1);
  }, [search]);
  const listing = useApi(() => assetsApi.list({ page, search, status: listFilter || undefined }), [page, search, listFilter]);
  const assets = listing.data?.results ?? [];
  const loading = listing.loading;
  const loadAssets = listing.refresh;

  const openAsset = (record?: (typeof assets)[number]) => {
    setEditing(record?.id ?? null);
    setName(record?.name ?? '');
    setHostname(record?.hostname ?? '');
    setIpAddress(record?.ip_address ?? '');
    setAssetType(record?.asset_type ?? 'server');
    setCriticality(record?.criticality ?? 'high');
    setStatus(record?.status ?? 'active');
    setFieldErrors({});
    setCreateOpen(true);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFieldErrors({});
    try {
      const payload = {
        name,
        hostname,
        ip_address: ipAddress,
        asset_type: assetType,
        criticality,
        status,
      } as any;
      if (editing) await assetsApi.update(editing, payload);
      else await assetsApi.create(payload);
      toast('success', editing ? 'Asset updated' : 'Asset registered');
      setCreateOpen(false);
      setName('');
      setHostname('');
      setIpAddress('');
      await loadAssets();
    } catch (err) {
      const errors = requestFields(err, ['name', 'hostname', 'ip_address', 'asset_type', 'criticality', 'status']);
      setFieldErrors(errors);
      if (!Object.keys(errors).length) toast('error', requestError(err, 'Could not save the asset.'));
    }
  };


  return (
    <div className="page-container" style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '700', margin: '0 0 4px 0' }}>Asset Inventory</h1>
          <p style={{ margin: 0, color: 'var(--color-text-secondary)', fontSize: '13px' }}>
            Monitored servers, databases, endpoints, and cloud infrastructure per tenant
          </p>
        </div>

        <button
          onClick={() => openAsset()}
          disabled={!canEdit}
          className="btn btn-primary"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
        >
          <Plus size={16} />
          <span>Register Asset</span>
        </button>
      </div>

      <div className="card" style={{ padding: '16px', marginBottom: '20px' }}>
        <input
          type="text"
          placeholder="Search assets by name, hostname, or IP address..."
          value={search}
          onChange={e => { setPage(1); setSearch(e.target.value); }}
          style={{ width: '100%', padding: '8px 12px', background: 'var(--color-canvas)', border: '1px solid var(--color-border)', borderRadius: '6px', color: 'var(--color-text-primary)', fontSize: '13px', boxSizing: 'border-box' }}
        />
      </div>

      <div className="form-group">
        <label htmlFor="monitoring-filter">Filter by status</label>
        <select id="monitoring-filter" value={listFilter} onChange={e => { setPage(1); setListFilter(e.target.value); }}>
          <option value="">All</option><option value="active">Active</option><option value="inactive">Inactive</option><option value="decommissioned">Decommissioned</option>
        </select>
      </div>
      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        {listing.error && <p role="alert">Could not load records. <button className="btn btn-ghost" onClick={listing.refresh}>Retry</button></p>}
        <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
          <thead>
            <tr style={{ background: 'var(--color-surface)', borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>
              <th style={{ padding: '12px 16px' }}>Criticality</th>
              <th style={{ padding: '12px 16px' }}>Asset Name</th>
              <th style={{ padding: '12px 16px' }}>Hostname</th>
              <th style={{ padding: '12px 16px' }}>IP Address</th>
              <th style={{ padding: '12px 16px' }}>Type</th>
              <th style={{ padding: '12px 16px' }}>Status</th>
              {canEdit && <th>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {assets.length > 0 ? (
              assets.map(a => (
                <tr key={a.id} style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                  <td style={{ padding: '12px 16px' }}>
                    <SeverityBadge severity={a.criticality} />
                  </td>
                  <td style={{ padding: '12px 16px', fontWeight: '600', color: 'var(--color-text-primary)' }}>
                    {a.name}
                  </td>
                  <td style={{ padding: '12px 16px', color: 'var(--color-accent-hover)', fontFamily: 'monospace' }}>
                    {a.hostname || 'N/A'}
                  </td>
                  <td style={{ padding: '12px 16px', color: 'var(--color-text-secondary)', fontFamily: 'monospace' }}>
                    {a.ip_address || 'N/A'}
                  </td>
                  <td style={{ padding: '12px 16px', textTransform: 'capitalize', color: 'var(--color-text-secondary)' }}>
                    {a.asset_type?.replace(/_/g, ' ')}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{
                      padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: '600',
                      background: 'color-mix(in srgb, var(--color-success) 15%, transparent)', color: 'var(--color-success)'
                    }}>
                      {a.status || 'Active'}
                    </span>
                  </td>
                  {canEdit && <td><button className="btn btn-ghost btn-sm" onClick={() => openAsset(a)}>Edit</button></td>}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={canEdit ? 7 : 6} style={{ padding: '36px', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
                  {loading ? 'Loading assets...' : 'No assets registered yet.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <Pagination page={page} pageSize={50} total={listing.data?.count ?? 0} onPageChange={setPage} />
      </div>

      {/* Register Asset Modal */}
      <FormDialog
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        title={editing ? "Edit asset" : "Register infrastructure asset"}
      >
        <form onSubmit={handleCreate}>
          <div style={{ marginBottom: '16px' }}>
            <label htmlFor="asset-name" style={{ display: 'block', fontSize: '12px', fontWeight: '600', marginBottom: '6px', color: 'var(--color-text-secondary)' }}>
              Asset Name
            </label>
            <input id="asset-name" aria-invalid={!!fieldErrors.name} aria-describedby={fieldErrors.name ? "asset-name-error" : undefined}
              type="text"
              required
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Core Banking API Gateway"
              style={{ width: '100%', padding: '8px', background: 'var(--color-canvas)', border: '1px solid var(--color-border)', borderRadius: '6px', color: 'var(--color-text-primary)', boxSizing: 'border-box' }}
            />
            {fieldErrors.name && <p className="form-error" id="asset-name-error" role="alert">{fieldErrors.name}</p>}
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label htmlFor="asset-hostname" style={{ display: 'block', fontSize: '12px', fontWeight: '600', marginBottom: '6px', color: 'var(--color-text-secondary)' }}>
              Hostname
            </label>
            <input id="asset-hostname" aria-invalid={!!fieldErrors.hostname} aria-describedby={fieldErrors.hostname ? "asset-hostname-error" : undefined}
              type="text"
              value={hostname}
              onChange={e => setHostname(e.target.value)}
              placeholder="srv-api-01.horizon.internal"
              style={{ width: '100%', padding: '8px', background: 'var(--color-canvas)', border: '1px solid var(--color-border)', borderRadius: '6px', color: 'var(--color-text-primary)', boxSizing: 'border-box' }}
            />
            {fieldErrors.hostname && <p className="form-error" id="asset-hostname-error" role="alert">{fieldErrors.hostname}</p>}
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label htmlFor="asset-ip-address" style={{ display: 'block', fontSize: '12px', fontWeight: '600', marginBottom: '6px', color: 'var(--color-text-secondary)' }}>
              IP Address
            </label>
            <input id="asset-ip-address" aria-invalid={!!fieldErrors.ip_address} aria-describedby={fieldErrors.ip_address ? "asset-ip-address-error" : undefined}
              type="text"
              value={ipAddress}
              onChange={e => setIpAddress(e.target.value)}
              placeholder="10.10.1.25"
              style={{ width: '100%', padding: '8px', background: 'var(--color-canvas)', border: '1px solid var(--color-border)', borderRadius: '6px', color: 'var(--color-text-primary)', boxSizing: 'border-box' }}
            />
            {fieldErrors.ip_address && <p className="form-error" id="asset-ip-address-error" role="alert">{fieldErrors.ip_address}</p>}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
            <div>
              <label htmlFor="asset-asset-type" style={{ display: 'block', fontSize: '12px', fontWeight: '600', marginBottom: '6px', color: 'var(--color-text-secondary)' }}>
                Asset Category
              </label>
              <select id="asset-asset-type" aria-invalid={!!fieldErrors.asset_type} aria-describedby={fieldErrors.asset_type ? "asset-asset-type-error" : undefined}
                value={assetType}
                onChange={e => setAssetType(e.target.value)}
                style={{ width: '100%', padding: '8px', background: 'var(--color-canvas)', border: '1px solid var(--color-border)', borderRadius: '6px', color: 'var(--color-text-primary)' }}
              >
                <option value="server">Server</option>
                <option value="database">Database</option>
                <option value="network_device">Network Device</option>
                <option value="application">Application</option>
                <option value="cloud_resource">Cloud Resource</option>
              </select>
            {fieldErrors.asset_type && <p className="form-error" id="asset-asset-type-error" role="alert">{fieldErrors.asset_type}</p>}
            </div>

            <div>
              <label htmlFor="asset-criticality" style={{ display: 'block', fontSize: '12px', fontWeight: '600', marginBottom: '6px', color: 'var(--color-text-secondary)' }}>
                Asset Criticality
              </label>
              <select id="asset-criticality" aria-invalid={!!fieldErrors.criticality} aria-describedby={fieldErrors.criticality ? "asset-criticality-error" : undefined}
                value={criticality}
                onChange={e => setCriticality(e.target.value)}
                style={{ width: '100%', padding: '8px', background: 'var(--color-canvas)', border: '1px solid var(--color-border)', borderRadius: '6px', color: 'var(--color-text-primary)' }}
              >
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            {fieldErrors.criticality && <p className="form-error" id="asset-criticality-error" role="alert">{fieldErrors.criticality}</p>}
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="asset-status">Status</label>
            <select aria-invalid={!!fieldErrors.status} aria-describedby={fieldErrors.status ? "asset-status-error" : undefined} id="asset-status" value={status} onChange={e => setStatus(e.target.value)}>
              <option value="active">Active</option><option value="inactive">Inactive</option>
              <option value="decommissioned">Decommissioned</option>
            </select>
            {fieldErrors.status && <p className="form-error" id="asset-status-error" role="alert">{fieldErrors.status}</p>}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <button type="button" onClick={() => setCreateOpen(false)} className="btn btn-secondary">
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              Register Asset
            </button>
          </div>
        </form>
      </FormDialog>
    </div>
  );
}
