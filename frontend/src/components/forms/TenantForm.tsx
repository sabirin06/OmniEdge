import React, { useState, useEffect } from 'react';
import { requestError, requestFields } from '../../api/errors';
import { FormDialog } from '../ui/FormDialog';
import { useToast } from '../ui/Toast';
import { tenantsApi } from '../../api/tenants';
import type { Tenant } from '../../types';

interface Props {
  open: boolean;
  tenant?: Tenant | null;
  onClose: () => void;
  onSaved: () => void;
}

export function TenantForm({ open, tenant, onClose, onSaved }: Props) {
  const toast = useToast();
  const [name, setName]       = useState('');
  const [slug, setSlug]       = useState('');
  const [active, setActive]   = useState(true);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors]   = useState<Record<string,string>>({});

  useEffect(() => {
    if (open) {
      setName(tenant?.name ?? '');
      setSlug(tenant?.slug ?? '');
      setActive(tenant?.is_active ?? true);
      setErrors({});
    }
  }, [open, tenant]);

  const validate = () => {
    const e: Record<string,string> = {};
    if (!name.trim()) e.name = 'Name is required';
    if (!slug.trim()) e.slug = 'Slug is required';
    else if (!/^[a-z0-9-]+$/.test(slug)) e.slug = 'Slug must be lowercase letters, numbers, and hyphens only';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setLoading(true);
    try {
      if (tenant) await tenantsApi.update(tenant.id, { name, slug, is_active: active });
      else await tenantsApi.create({ name, slug, is_active: active });
      toast('success', tenant ? 'Tenant updated' : 'Tenant created');
      onSaved();
      onClose();
    } catch (err: unknown) {
      const fields = requestFields(err, ['name', 'slug']);
      setErrors(fields);
      if (!Object.keys(fields).length) toast('error', requestError(err, 'Could not save the organization.'));
    } finally { setLoading(false); }
  };

  return (
    <FormDialog
      open={open}
      title={tenant ? 'Edit Tenant' : 'New Tenant'}
      onClose={onClose}
      onSubmit={handleSubmit}
      submitLoading={loading}
    >
      <div className="form-group">
        <label htmlFor="tenant-name">Name</label>
        <input id="tenant-name" aria-invalid={!!errors.name} aria-describedby={errors.name ? "tenant-name-error" : undefined} value={name} onChange={e => setName(e.target.value)} placeholder="Acme Corp" />
        {errors.name && <div role="alert" id="tenant-name-error" className="form-error">{errors.name}</div>}
      </div>
      <div className="form-group">
        <label htmlFor="tenant-slug">Slug</label>
        <input id="tenant-slug" aria-invalid={!!errors.slug} aria-describedby={errors.slug ? "tenant-slug-error" : undefined} value={slug} onChange={e => setSlug(e.target.value.toLowerCase().replace(/\s+/g,'-'))} placeholder="acme-corp" />
        {errors.slug && <div role="alert" id="tenant-slug-error" className="form-error">{errors.slug}</div>}
        <div className="form-hint">Unique identifier — lowercase, hyphens only</div>
      </div>
      <div className="form-group">
        <label style={{ display:'flex', alignItems:'center', gap:8 }}>
          <label className="toggle">
            <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} />
            <span className="toggle-slider" />
          </label>
          Active
        </label>
      </div>
    </FormDialog>
  );
}
