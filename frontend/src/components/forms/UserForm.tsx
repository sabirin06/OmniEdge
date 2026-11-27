import { requestError, requestFields } from '../../api/errors';
import { useEffect, useState } from 'react';
import { FormDialog } from '../ui/FormDialog';
import { PasswordInput } from '../ui/PasswordInput';
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
  const [fields, setFields] = useState<Partial<Record<'full_name' | 'email' | 'role' | 'managed_role' | 'tenant' | 'password', string>>>({});

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
    setError('');
    const issues: typeof fields = {};
    if (!fullName.trim()) issues.full_name = 'Enter the user?s full name.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) issues.email = 'Enter a valid email address.';
    if (!managedRole && !builtInRole) issues.role = 'Choose a role.';
    if (platform && !globalRole && !tenant) issues.tenant = 'Choose an organization.';
    if (!user && !password) issues.password = 'Enter a temporary password.';
    setFields(issues);
    if (Object.keys(issues).length) return;

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
      if (user) {
        const result = await usersApi.update(user.id, payload);
        toast('success', result.data.email_verified ? 'User updated' : 'User updated. Email verification is pending.');
      } else {
        const result = await usersApi.create(payload);
        toast(result.data.verification_email_available ? 'success' : 'warning', result.data.verification_email_available
          ? 'User created. A verification email was queued.'
          : 'User created. Email delivery is unavailable, so this account is pending verification.');
      }
      onSaved();
      onClose();
    } catch (err: unknown) {
      const next = requestFields(err, ['full_name', 'email', 'role', 'managed_role', 'tenant', 'password']);
      setFields(next);
      if (!Object.keys(next).length) setError(requestError(err, 'Could not save the user.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormDialog open title={user ? 'Edit user' : 'Create user'}
      onClose={() => { if (!saving) onClose(); }} onSubmit={save} submitLoading={saving}>
      <div className="form-group">
        <label htmlFor="user-name">Full name</label>
        <input id="user-name" aria-invalid={!!fields.full_name} aria-describedby={fields.full_name ? "user-name-error" : undefined} value={fullName} onChange={e => { setFullName(e.target.value); setFields(current => ({ ...current, full_name: undefined })); }} />
        {fields.full_name && <p className="form-error" role="alert" id="user-name-error">{fields.full_name}</p>}
      </div>
      <div className="form-group">
        <label htmlFor="user-email">Email</label>
        <input id="user-email" readOnly={!!user && user.email_verified !== false} aria-invalid={!!fields.email} aria-describedby={fields.email ? "user-email-error" : undefined} type="email" value={email} onChange={e => { setEmail(e.target.value); setFields(current => ({ ...current, email: undefined })); }} />
        {fields.email && <p className="form-error" role="alert" id="user-email-error">{fields.email}</p>}
      </div>
      <div className="form-group">
        <label htmlFor="user-role">Role</label>
        <select id="user-role" aria-invalid={!!(fields.role || fields.managed_role)} aria-describedby={(fields.role || fields.managed_role) ? "user-role-error" : undefined} value={selection} onChange={e => { setSelection(e.target.value); setFields(current => ({ ...current, role: undefined, managed_role: undefined })); }}>
          <option value="">Choose a role</option>
          {builtInRoles.filter(([key]) => platform || key !== 'platform_admin')
            .map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          {roles.data?.map(role => <option key={role.id} value={role.id}>{role.name}</option>)}
        </select>
        {(fields.role || fields.managed_role) && <p className="form-error" role="alert" id="user-role-error">{(fields.role || fields.managed_role)}</p>}
        {roles.loading && <p role="status">Loading custom roles...</p>}
        {roles.error && <p role="alert">Could not load custom roles. <button type="button" className="btn btn-ghost" onClick={roles.refresh}>Retry</button></p>}
      </div>
      {platform && !globalRole && (
        <div className="form-group">
          <label htmlFor="user-tenant">Organization</label>
          <select id="user-tenant" aria-invalid={!!fields.tenant} aria-describedby={fields.tenant ? "user-tenant-error" : undefined} value={tenant} onChange={e => { setTenant(e.target.value); setFields(current => ({ ...current, tenant: undefined })); }}>
            <option value="">Choose an organization</option>
            {tenants.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}
          </select>
        {fields.tenant && <p className="form-error" role="alert" id="user-tenant-error">{fields.tenant}</p>}
          {tenantError && <p role="alert">{tenantError}</p>}
        </div>
      )}
      {!user && <div className="form-group">
        <label htmlFor="user-password">Initial password</label>
        <PasswordInput id="user-password" aria-invalid={!!fields.password} aria-describedby={fields.password ? "user-password-error" : undefined} minLength={8} maxLength={128} autoComplete="new-password" value={password} onChange={e => { setPassword(e.target.value); setFields(current => ({ ...current, password: undefined })); }} />
        {fields.password && <p className="form-error" role="alert" id="user-password-error">{fields.password}</p>}
      </div>}
      {user?.email_verified === false && <p className="muted">This account is awaiting email verification.</p>}
      {user && user.email_verified !== false && <label><input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} /> Active</label>}
      {error && <p className="form-error" role="alert">{error}</p>}
    </FormDialog>
  );
}
