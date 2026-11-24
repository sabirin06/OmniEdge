import { Pagination } from '../components/ui/Pagination';
import { useApi } from '../hooks/useApi';
import { requestError } from '../api/errors';
import { useToast } from '../components/ui/Toast';
import React, { useEffect, useState } from 'react';
import { Building2, Plus, CheckCircle2, XCircle } from 'lucide-react';
import { tenantsApi } from '../api/tenants';
import { FormDialog } from '../components/ui/FormDialog';
import { formatDateTime } from '../utils/formatters';

export function Tenants() {
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);

  // Form states
  const [editing, setEditing] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [industry, setIndustry] = useState('Financial Services');
  const [contactEmail, setContactEmail] = useState('');

  const [listFilter, setListFilter] = useState('');
  const [page, setPage] = useState(1);
  const listing = useApi(() => tenantsApi.list({ page, search, status: listFilter || undefined }), [page, search, listFilter]);
  const tenants = listing.data?.results ?? [];
  const loading = listing.loading;
  const loadTenants = listing.refresh;

  const openTenant = (record?: (typeof tenants)[number]) => {
    setEditing(record?.id ?? null);
    setName(record?.name ?? '');
    setCode(record?.code ?? '');
    setIndustry(record?.industry ?? 'Financial Services');
    setContactEmail(record?.contact_email ?? '');
    setCreateOpen(true);
  };

  const changeStatus = async (record: (typeof tenants)[number]) => {
    const suspending = record.status === 'active';
    if (suspending && !window.confirm('Suspend this organization and block its access?')) return;
    try {
      await tenantsApi.setStatus(record.id, suspending ? 'suspend' : 'activate');
      toast('success', suspending ? 'Organization suspended' : 'Organization activated');
      await loadTenants();
    } catch (err) {
      toast('error', requestError(err, 'Could not change organization status.'));
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        name,
        code,
        industry,
        contact_email: contactEmail,
      } as any;
      if (editing) await tenantsApi.update(editing, payload);
      else await tenantsApi.create(payload);
      toast('success', editing ? 'Organization updated' : 'Organization created');
      setCreateOpen(false);
      setName('');
      setCode('');
      setContactEmail('');
      await loadTenants();
    } catch (err) {
      toast('error', requestError(err, 'Failed to onboard tenant.'));
    }
  };

  return (
    <div className="page-container" style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '700', margin: '0 0 4px 0' }}>Tenant Organizations</h1>
          <p style={{ margin: 0, color: 'var(--color-text-secondary)', fontSize: '13px' }}>
            Multi-tenant boundary administration, customer isolation, and organization provisioning
          </p>
        </div>

        <button
          onClick={() => openTenant()}
          className="btn btn-primary"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
        >
          <Plus size={16} />
          <span>Onboard New Tenant</span>
        </button>
      </div>

      <div className="form-group">
        <label htmlFor="monitoring-search">Search</label>
        <input id="monitoring-search" value={search} onChange={e => { setPage(1); setSearch(e.target.value); }} />
      </div>
      <div className="form-group">
        <label htmlFor="monitoring-filter">Filter by status</label>
        <select id="monitoring-filter" value={listFilter} onChange={e => { setPage(1); setListFilter(e.target.value); }}>
          <option value="">All</option><option value="active">Active</option><option value="suspended">Suspended</option>
        </select>
      </div>
      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        {listing.error && <p role="alert">Could not load records. <button className="btn btn-ghost" onClick={listing.refresh}>Retry</button></p>}
        <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
          <thead>
            <tr style={{ background: 'var(--color-surface)', borderBottom: '1px solid #30363D', color: 'var(--color-text-secondary)' }}>
              <th style={{ padding: '12px 16px' }}>Tenant Code</th>
              <th style={{ padding: '12px 16px' }}>Organization Name</th>
              <th style={{ padding: '12px 16px' }}>Industry Sector</th>
              <th style={{ padding: '12px 16px' }}>Security Contact</th>
              <th style={{ padding: '12px 16px' }}>Status</th>
              <th style={{ padding: '12px 16px' }}>Onboarded</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {tenants.length > 0 ? (
              tenants.map(t => (
                <tr key={t.id} style={{ borderBottom: '1px solid #21262D' }}>
                  <td style={{ padding: '12px 16px', fontWeight: '700', color: 'var(--color-accent-hover)', fontFamily: 'monospace' }}>
                    {t.code || t.slug}
                  </td>
                  <td style={{ padding: '12px 16px', fontWeight: '600', color: 'var(--color-text-primary)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Building2 size={16} color='var(--color-text-secondary)' />
                      <span>{t.name}</span>
                    </div>
                  </td>
                  <td style={{ padding: '12px 16px', color: 'var(--color-text-secondary)' }}>
                    {t.industry || 'Enterprise'}
                  </td>
                  <td style={{ padding: '12px 16px', color: 'var(--color-accent-hover)' }}>
                    {t.contact_email || 'security@tenant.internal'}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{
                      padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: '600',
                      background: t.status === 'active' || t.is_active ? 'rgba(63, 185, 80, 0.15)' : 'rgba(255, 123, 114, 0.15)',
                      color: t.status === 'active' || t.is_active ? '#3FB950' : '#FF7B72'
                    }}>
                      {t.status === 'active' || t.is_active ? 'Active' : 'Suspended'}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px', color: 'var(--color-text-secondary)' }}>
                    {formatDateTime(t.created_at)}
                  </td>
                  <td>
                    <button className="btn btn-ghost btn-sm" onClick={() => openTenant(t)}>Edit</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => changeStatus(t)}>{t.status === 'active' ? 'Suspend' : 'Activate'}</button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7} style={{ padding: '36px', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
                  {loading ? 'Loading tenants...' : 'No tenants found.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <Pagination page={page} pageSize={50} total={listing.data?.count ?? 0} onPageChange={setPage} />
      </div>

      {/* Onboard Tenant Modal */}
      <FormDialog
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        title={editing ? "Edit organization" : "Onboard new organization"}
      >
        <form onSubmit={handleCreate}>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', marginBottom: '6px', color: 'var(--color-text-secondary)' }}>
              Organization Name
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Apex Global Bank"
              style={{ width: '100%', padding: '8px', background: 'var(--color-canvas)', border: '1px solid #30363D', borderRadius: '6px', color: 'var(--color-text-primary)', boxSizing: 'border-box' }}
            />
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', marginBottom: '6px', color: 'var(--color-text-secondary)' }}>
              Tenant Unique Code
            </label>
            <input
              type="text"
              required
              value={code}
              onChange={e => setCode(e.target.value.toUpperCase())}
              placeholder="APEX"
              style={{ width: '100%', padding: '8px', background: 'var(--color-canvas)', border: '1px solid #30363D', borderRadius: '6px', color: 'var(--color-text-primary)', boxSizing: 'border-box' }}
            />
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', marginBottom: '6px', color: 'var(--color-text-secondary)' }}>
              Industry Sector
            </label>
            <input
              type="text"
              value={industry}
              onChange={e => setIndustry(e.target.value)}
              placeholder="Financial Services, Healthcare, Telecommunications"
              style={{ width: '100%', padding: '8px', background: 'var(--color-canvas)', border: '1px solid #30363D', borderRadius: '6px', color: 'var(--color-text-primary)', boxSizing: 'border-box' }}
            />
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', marginBottom: '6px', color: 'var(--color-text-secondary)' }}>
              Primary Contact Email
            </label>
            <input
              type="email"
              required
              value={contactEmail}
              onChange={e => setContactEmail(e.target.value)}
              placeholder="security@apexbank.com"
              style={{ width: '100%', padding: '8px', background: 'var(--color-canvas)', border: '1px solid #30363D', borderRadius: '6px', color: 'var(--color-text-primary)', boxSizing: 'border-box' }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <button type="button" onClick={() => setCreateOpen(false)} className="btn btn-secondary">
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              Provision Tenant
            </button>
          </div>
        </form>
      </FormDialog>
    </div>
  );
}
