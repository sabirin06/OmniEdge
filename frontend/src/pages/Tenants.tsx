import { SupportAccess } from '../components/ui/SupportAccess';
import { Pagination } from '../components/ui/Pagination';
import { useApi } from '../hooks/useApi';
import { requestError, requestFields } from '../api/errors';
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
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

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
    setFieldErrors({});
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
    setFieldErrors({});
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
      const errors = requestFields(err, ['name', 'code', 'industry', 'contact_email']);
      setFieldErrors(errors);
      if (!Object.keys(errors).length) toast('error', requestError(err, 'Could not save the organization.'));
    }
  };

  return (
    <div className="page-container" style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>

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
          <option value="">All</option><option value="active">Active</option><option value="suspended">Suspended</option><option value="inactive">Inactive</option>
        </select>
      </div>
      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        {listing.error && <p role="alert">Could not load records. <button className="btn btn-ghost" onClick={listing.refresh}>Retry</button></p>}
        <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
          <thead>
            <tr style={{ background: 'var(--color-surface)', borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>
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
                <tr key={t.id} style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
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
                      background: t.status === 'active' || t.is_active ? 'color-mix(in srgb, var(--color-success) 15%, transparent)' : 'color-mix(in srgb, var(--color-danger) 15%, transparent)',
                      color: t.status === 'active' || t.is_active ? 'var(--color-success)' : 'var(--color-danger)'
                    }}>
                      {t.status === 'active' || t.is_active ? 'Active' : t.status === 'inactive' ? 'Inactive' : 'Suspended'}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px', color: 'var(--color-text-secondary)' }}>
                    {formatDateTime(t.created_at)}
                  </td>
                  <td>
                    <SupportAccess tenant={t.id} label={t.name} />
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
            <label htmlFor="organization-name" style={{ display: 'block', fontSize: '12px', fontWeight: '600', marginBottom: '6px', color: 'var(--color-text-secondary)' }}>
              Organization Name
            </label>
            <input id="organization-name" aria-invalid={!!fieldErrors.name} aria-describedby={fieldErrors.name ? "organization-name-error" : undefined}
              type="text"
              required
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Apex Global Bank"
              style={{ width: '100%', padding: '8px', background: 'var(--color-canvas)', border: '1px solid var(--color-border)', borderRadius: '6px', color: 'var(--color-text-primary)', boxSizing: 'border-box' }}
            />
            {fieldErrors.name && <p className="form-error" id="organization-name-error" role="alert">{fieldErrors.name}</p>}
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label htmlFor="organization-code" style={{ display: 'block', fontSize: '12px', fontWeight: '600', marginBottom: '6px', color: 'var(--color-text-secondary)' }}>
              Tenant Unique Code
            </label>
            <input id="organization-code" aria-invalid={!!fieldErrors.code} aria-describedby={fieldErrors.code ? "organization-code-error" : undefined}
              type="text"
              required
              value={code}
              onChange={e => setCode(e.target.value.toUpperCase())}
              placeholder="APEX"
              style={{ width: '100%', padding: '8px', background: 'var(--color-canvas)', border: '1px solid var(--color-border)', borderRadius: '6px', color: 'var(--color-text-primary)', boxSizing: 'border-box' }}
            />
            {fieldErrors.code && <p className="form-error" id="organization-code-error" role="alert">{fieldErrors.code}</p>}
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label htmlFor="organization-industry" style={{ display: 'block', fontSize: '12px', fontWeight: '600', marginBottom: '6px', color: 'var(--color-text-secondary)' }}>
              Industry Sector
            </label>
            <input id="organization-industry" aria-invalid={!!fieldErrors.industry} aria-describedby={fieldErrors.industry ? "organization-industry-error" : undefined}
              type="text"
              value={industry}
              onChange={e => setIndustry(e.target.value)}
              placeholder="Financial Services, Healthcare, Telecommunications"
              style={{ width: '100%', padding: '8px', background: 'var(--color-canvas)', border: '1px solid var(--color-border)', borderRadius: '6px', color: 'var(--color-text-primary)', boxSizing: 'border-box' }}
            />
            {fieldErrors.industry && <p className="form-error" id="organization-industry-error" role="alert">{fieldErrors.industry}</p>}
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label htmlFor="organization-contact-email" style={{ display: 'block', fontSize: '12px', fontWeight: '600', marginBottom: '6px', color: 'var(--color-text-secondary)' }}>
              Primary Contact Email
            </label>
            <input id="organization-contact-email" aria-invalid={!!fieldErrors.contact_email} aria-describedby={fieldErrors.contact_email ? "organization-contact-email-error" : undefined}
              type="email"
              required
              value={contactEmail}
              onChange={e => setContactEmail(e.target.value)}
              placeholder="security@apexbank.com"
              style={{ width: '100%', padding: '8px', background: 'var(--color-canvas)', border: '1px solid var(--color-border)', borderRadius: '6px', color: 'var(--color-text-primary)', boxSizing: 'border-box' }}
            />
            {fieldErrors.contact_email && <p className="form-error" id="organization-contact-email-error" role="alert">{fieldErrors.contact_email}</p>}
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
