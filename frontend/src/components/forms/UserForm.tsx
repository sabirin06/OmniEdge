import { useEffect, useState } from 'react';
import { FormDialog } from '../ui/FormDialog';
import { useToast } from '../ui/Toast';
import { usersApi } from '../../api/users';
import { rolesApi, builtInRoles } from '../../api/roles';
import { tenantsApi } from '../../api/tenants';
import { useAuth } from '../../contexts/AuthContext';
import { useApi } from '../../hooks/useApi';
import type { Tenant, User } from '../../types';

interface Props { user: User | null; onClose: () => void; onSaved: () => void; }

export function UserForm({ user, onClose, onSaved }: Props) {
  const toast = useToast();
  const { user: me } = useAuth();
  const platform = me?.role === 'platform_admin';
  const roles = useApi(rolesApi.list);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantError, setTenantError] = useState('');
  const [email, setEmail] = useState(user?.email ?? '');
  const [fullName, setFullName] = useState(user?.full_name ?? '');
  const [selection, setSelection] = useState(user?.managed_role ? String(user.managed_role) : user?.role ?? '');
  const [tenant, setTenant] = useState(String(user?.tenant_detail?.id ?? ''));
  const [password, setPassword] = useState('');
  const [active, setActive] = useState(user?.is_active ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!platform) return;
    let ignore = false;
    const loadTenants = async () => {
      const organizations: Tenant[] = [];
      let page = 1;
      while (!ignore) {
        const { data } = await tenantsApi.list({ page });
        organizations.push(...data.results);
        if (!data.next) break;
        page += 1;
      }
      if (!ignore) setTenants(organizations);
    };
    loadTenants().catch(() => { if (!ignore) setTenantError('Could not load organizations. Reopen this form to retry.'); });
    return () => { ignore = true; };
  }, [platform]);

  const managedRole = roles.data?.find(role => String(role.id) === selection);
  const globalRole = (managedRole?.base_role ?? selection) === 'platform_admin';

  const save = async () => {
    if (saving) return;
    const builtInRole = builtInRoles.find(([key]) => key === selection);
    if (!fullName.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Enter a full name and valid email address.');
      return;
    }
    if (!managedRole && !builtInRole) { setError('Choose a role.'); return; }
    if (platform && !globalRole && !tenant) { setError('Choose an organization.'); return; }
    if (!user && !password) { setError('Enter a temporary password.'); return; }

    setSaving(true);
    setError('');
    try {
      const payload = {
        full_name: fullName.trim(),
        email: email.trim(),
        ...(managedRole ? { managed_role: managedRole.id } : { role: selection, managed_role: null }),
        ...(platform ? { tenant: globalRole ? null : Number(tenant) } : {}),
        ...(password ? { password } : {}),
        is_active: active,
      };
      if (user) await usersApi.update(user.id, payload);
      else await usersApi.create(payload);
      toast('success', user ? 'User updated' : 'User created');
      onSaved();
      onClose();
    } catch (err: unknown) {
      const errors = (err as { response?: { data?: { errors?: Record<string, string | string[]> } } }).response?.data?.errors;
      setError(errors ? Object.values(errors).flat().join(' ') : 'Could not save the user.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormDialog open title={user ? 'Edit user' : 'Create user'}
      onClose={() => { if (!saving) onClose(); }} onSubmit={save} submitLoading={saving}>
      <div className="form-group">
        <label htmlFor="user-name">Full name</label>
        <input id="user-name" value={fullName} onChange={e => setFullName(e.target.value)} />
      </div>
      <div className="form-group">
        <label htmlFor="user-email">Email</label>
        <input id="user-email" type="email" value={email} onChange={e => setEmail(e.target.value)} />
      </div>
      <div className="form-group">
        <label htmlFor="user-role">Role</label>
        <select id="user-role" value={selection} onChange={e => setSelection(e.target.value)}>
          <option value="">Choose a role</option>
          {builtInRoles.filter(([key]) => platform || key !== 'platform_admin')
            .map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          {roles.data?.map(role => <option key={role.id} value={role.id}>{role.name}</option>)}
        </select>
        {roles.loading && <p role="status">Loading custom roles...</p>}
        {roles.error && <p role="alert">Could not load custom roles. <button type="button" className="btn btn-ghost" onClick={roles.refresh}>Retry</button></p>}
      </div>
      {platform && !globalRole && (
        <div className="form-group">
          <label htmlFor="user-tenant">Organization</label>
          <select id="user-tenant" value={tenant} onChange={e => setTenant(e.target.value)}>
            <option value="">Choose an organization</option>
            {tenants.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}
          </select>
          {tenantError && <p role="alert">{tenantError}</p>}
        </div>
      )}
      <div className="form-group">
        <label htmlFor="user-password">{user ? 'New password (optional)' : 'Temporary password'}</label>
        <input id="user-password" type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} />
      </div>
      {user && <label><input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} /> Active</label>}
      {error && <p className="form-error" role="alert">{error}</p>}
    </FormDialog>
  );
}
